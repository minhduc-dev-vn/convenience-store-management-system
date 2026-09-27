'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { getAuthSettings } = require('../config/auth.config');
const { AuthRepository } = require('../repositories/auth.repository');
const { AppError } = require('../utils/app-error');
const {
  assertPasswordsMatch,
  normalizeDate,
  normalizeEmail,
  normalizeFullName,
  normalizePassword,
  normalizePhone,
  requireString,
  validationError,
} = require('../utils/input-validation');
const { isUniqueConstraintError } = require('../utils/sql-error');
const { withTransaction } = require('../utils/transaction');
const { TokenService } = require('./token.service');

const CUSTOMER_ROLE = 'CUSTOMER';
const DUMMY_PASSWORD_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

function createCustomerId() {
  return `KH${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapIdentity(row) {
  return {
    accountId: Number(row.MaTK),
    username: row.TenDangNhap,
    role: row.MaVaiTro,
    roleName: row.TenVaiTro,
    ownerType: row.LoaiChuSoHuu,
    ownerId: row.MaChuSoHuu,
    displayName: row.TenChuSoHuu,
  };
}

function assertActiveAccount(row) {
  if (row.TrangThai === 'LOCKED') {
    throw new AppError('The account is locked', {
      code: 'ACCOUNT_LOCKED',
      statusCode: 403,
    });
  }

  if (row.TrangThai !== 'ACTIVE' || row.TrangThaiChuSoHuu !== 'ACTIVE') {
    throw new AppError('The account is inactive', {
      code: 'ACCOUNT_INACTIVE',
      statusCode: 403,
    });
  }
}

function registrationConflict(message) {
  return new AppError(message, {
    code: 'REGISTRATION_CONFLICT',
    statusCode: 409,
  });
}

class AuthService {
  constructor({
    authRepository = new AuthRepository(),
    customerIdGenerator = createCustomerId,
    passwordHasher = bcrypt,
    settingsProvider = getAuthSettings,
    tokenService = new TokenService(),
    transactionRunner = withTransaction,
  } = {}) {
    this.authRepository = authRepository;
    this.customerIdGenerator = customerIdGenerator;
    this.passwordHasher = passwordHasher;
    this.settingsProvider = settingsProvider;
    this.tokenService = tokenService;
    this.transactionRunner = transactionRunner;
  }

  async register(input) {
    const fullName = normalizeFullName(input.fullName);
    const phone = normalizePhone(input.phone);
    const email = normalizeEmail(input.email);
    const dateOfBirth = normalizeDate(input.dateOfBirth, 'dateOfBirth');
    const password = normalizePassword(input.password);
    const passwordConfirmation = normalizePassword(
      input.passwordConfirmation,
      'passwordConfirmation',
    );
    assertPasswordsMatch(password, passwordConfirmation, 'passwordConfirmation');

    const passwordHash = await this.passwordHasher.hash(
      password,
      this.settingsProvider().bcryptRounds,
    );

    try {
      return await this.transactionRunner(async (transaction) => {
        const conflict = await this.authRepository.findRegistrationConflict(
          { email, phone },
          transaction,
        );

        if (conflict.phoneExists) {
          throw registrationConflict('The phone number is already registered');
        }
        if (conflict.emailExists) {
          throw registrationConflict('The email address is already registered');
        }

        const customerId = this.customerIdGenerator();
        const customer = await this.authRepository.createCustomer({
          customerId,
          dateOfBirth,
          email,
          fullName,
          phone,
        }, transaction);
        const account = await this.authRepository.createCustomerAccount({
          customerId,
          passwordHash,
          username: phone,
        }, transaction);

        return {
          account: {
            accountId: Number(account.MaTK),
            role: account.MaVaiTro,
            status: account.TrangThai,
            username: account.TenDangNhap,
          },
          customer: {
            customerId: customer.MaKH,
            dateOfBirth: dateOnly(customer.NgaySinh),
            email: customer.Email,
            fullName: customer.HoTen,
            membershipTier: customer.HangThanhVien,
            phone: customer.SDT,
          },
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw registrationConflict('The registration identifier is already in use');
      }
      throw error;
    }
  }

  async login(input) {
    const identifier = requireString(input.identifier, 'identifier', { maxLength: 100 });
    if (typeof input.password !== 'string' || input.password.length === 0) {
      throw validationError('password is required');
    }
    const password = input.password;
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw validationError('password must not exceed 72 UTF-8 bytes');
    }

    const account = await this.authRepository.findForAuthentication(identifier);
    const passwordMatches = await this.passwordHasher.compare(
      password,
      account?.MatKhauHash || DUMMY_PASSWORD_HASH,
    );

    if (!account || !passwordMatches) {
      throw new AppError('The username or password is incorrect', {
        code: 'INVALID_CREDENTIALS',
        statusCode: 401,
      });
    }

    assertActiveAccount(account);
    await this.authRepository.updateLastLogin(account.MaTK);

    const identity = mapIdentity(account);
    return {
      accessToken: this.tokenService.sign({
        accountId: identity.accountId,
        role: identity.role,
      }),
      tokenType: 'Bearer',
      user: identity,
    };
  }

  async resolveIdentity(accessToken) {
    const payload = this.tokenService.verify(accessToken);
    const accountId = Number(payload.sub);
    if (!Number.isSafeInteger(accountId) || accountId <= 0) {
      throw new AppError('The access token subject is invalid', {
        code: 'INVALID_TOKEN',
        statusCode: 401,
      });
    }

    const account = await this.authRepository.findIdentityById(accountId);
    if (!account) {
      throw new AppError('The access token account no longer exists', {
        code: 'INVALID_TOKEN',
        statusCode: 401,
      });
    }

    assertActiveAccount(account);
    return {
      ...mapIdentity(account),
      customerId: account.MaVaiTro === CUSTOMER_ROLE ? account.MaChuSoHuu : null,
      employeeId: account.MaVaiTro === CUSTOMER_ROLE ? null : account.MaChuSoHuu,
    };
  }

  async changePassword(identity, input, ipAddress = null) {
    const currentPassword = normalizePassword(input.currentPassword, 'currentPassword');
    const newPassword = normalizePassword(input.newPassword, 'newPassword');
    const confirmation = normalizePassword(
      input.newPasswordConfirmation,
      'newPasswordConfirmation',
    );
    assertPasswordsMatch(newPassword, confirmation, 'newPasswordConfirmation');

    return this.transactionRunner(async (transaction) => {
      const account = await this.authRepository.findSecretById(
        identity.accountId,
        transaction,
        { lock: true },
      );

      if (!account) {
        throw new AppError('The authenticated account no longer exists', {
          code: 'INVALID_TOKEN',
          statusCode: 401,
        });
      }
      assertActiveAccount(account);

      const currentMatches = await this.passwordHasher.compare(
        currentPassword,
        account.MatKhauHash,
      );
      if (!currentMatches) {
        throw new AppError('The current password is incorrect', {
          code: 'CURRENT_PASSWORD_INCORRECT',
          statusCode: 400,
        });
      }

      if (await this.passwordHasher.compare(newPassword, account.MatKhauHash)) {
        throw validationError('newPassword must be different from the current password');
      }

      const passwordHash = await this.passwordHasher.hash(
        newPassword,
        this.settingsProvider().bcryptRounds,
      );
      await this.authRepository.updatePassword(identity.accountId, passwordHash, transaction);
      await this.authRepository.writePasswordChangeAudit(
        identity.accountId,
        ipAddress,
        transaction,
      );

      return { changed: true };
    });
  }
}

module.exports = {
  AuthService,
  CUSTOMER_ROLE,
  createCustomerId,
};
