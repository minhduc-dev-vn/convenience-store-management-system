'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { getAuthSettings } = require('../config/auth.config');
const { AdminRepository } = require('../repositories/admin.repository');
const { CustomerRepository } = require('../repositories/customer.repository');
const {
  normalizeInvoiceListQuery,
  serializeInvoiceDetail,
  serializeInvoiceSummary,
} = require('./customer.service');
const { AppError } = require('../utils/app-error');
const {
  assertPasswordsMatch,
  normalizeDate,
  normalizeEmail,
  normalizeFullName,
  normalizeOptionalText,
  normalizePassword,
  normalizePhone,
  requireString,
  validationError,
} = require('../utils/input-validation');
const { isUniqueConstraintError } = require('../utils/sql-error');
const { withTransaction } = require('../utils/transaction');

const ACCOUNT_ROLES = Object.freeze(['CUSTOMER', 'CASHIER', 'WAREHOUSE', 'MANAGER']);
const EMPLOYEE_ROLES = Object.freeze(['CASHIER', 'WAREHOUSE', 'MANAGER']);
const ACCOUNT_STATUSES = Object.freeze(['ACTIVE', 'LOCKED', 'INACTIVE']);
const EMPLOYEE_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE']);
const CUSTOMER_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE']);
const MEMBERSHIP_TIERS = Object.freeze(['BRONZE', 'SILVER', 'GOLD', 'DIAMOND']);
const GENDERS = Object.freeze(['MALE', 'FEMALE', 'OTHER']);
const OWNER_TYPES = Object.freeze(['CUSTOMER', 'EMPLOYEE']);
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function createEmployeeId() {
  return `NV${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function timestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeEnum(value, fieldName, allowed, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const normalized = requireString(value, fieldName, { maxLength: 20 }).toUpperCase();
  if (!allowed.includes(normalized)) {
    throw validationError(`${fieldName} must be one of: ${allowed.join(', ')}`);
  }
  return normalized;
}

function normalizeBaseSalary(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw validationError('baseSalary must be a non-negative number');
  }
  if (value > Number.MAX_SAFE_INTEGER / 100) {
    throw validationError('baseSalary is too large');
  }
  if (Math.abs((value * 100) - Math.round(value * 100)) > Number.EPSILON * 100) {
    throw validationError('baseSalary must not have more than two decimal places');
  }
  return value;
}

function parsePositiveInteger(value, fieldName, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw validationError(`${fieldName} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw validationError(`${fieldName} must be between 1 and ${maximum}`);
  }
  return parsed;
}

function normalizeId(value, fieldName, maxLength = 10) {
  return requireString(value, fieldName, { maxLength });
}

function normalizeAccountId(value) {
  const rawValue = typeof value === 'number' ? String(value) : value;
  if (typeof rawValue !== 'string' || !/^\d+$/.test(rawValue)) {
    throw validationError('accountId must be a positive integer');
  }
  const accountId = Number(rawValue);
  if (!Number.isSafeInteger(accountId) || accountId < 1 || accountId > 2_147_483_647) {
    throw validationError('accountId must be a valid SQL integer');
  }
  return accountId;
}

function escapeLike(value) {
  return value.replace(/~/g, '~~').replace(/%/g, '~%').replace(/_/g, '~_').replace(/\[/g, '~[');
}

function normalizeListQuery(query, filters = {}) {
  const page = parsePositiveInteger(query.page, 'page', DEFAULT_PAGE, 2_147_483_647);
  const pageSize = parsePositiveInteger(query.pageSize, 'pageSize', DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  if ((page - 1) * pageSize > 2_147_483_647) {
    throw validationError('page is too large for the selected pageSize');
  }
  const search = query.search === undefined
    ? null
    : requireString(query.search, 'search', { maxLength: 100 });

  return {
    ...filters,
    page,
    pageSize,
    searchPattern: search ? `%${escapeLike(search)}%` : null,
  };
}

function serializeEmployee(row) {
  return {
    address: row.DiaChi,
    baseSalary: Number(row.LuongCoBan),
    dateOfBirth: dateOnly(row.NgaySinh),
    email: row.Email,
    employeeId: row.MaNV,
    fullName: row.HoTen,
    gender: row.GioiTinh,
    phone: row.SDT,
    startDate: dateOnly(row.NgayVaoLam),
    status: row.TrangThai,
  };
}

function serializeAccount(row) {
  return {
    accountId: Number(row.MaTK),
    createdAt: timestamp(row.NgayTao),
    lastLoginAt: timestamp(row.LanDangNhapCuoi),
    owner: {
      id: row.MaChuSoHuu,
      name: row.TenChuSoHuu,
      status: row.TrangThaiChuSoHuu,
      type: row.LoaiChuSoHuu,
    },
    role: row.MaVaiTro,
    roleName: row.TenVaiTro,
    status: row.TrangThai,
    username: row.TenDangNhap,
  };
}

function serializeManagedCustomer(row) {
  return {
    account: row.MaTK == null ? null : {
      accountId: Number(row.MaTK),
      createdAt: timestamp(row.NgayTao),
      lastLoginAt: timestamp(row.LanDangNhapCuoi),
      role: row.MaVaiTro,
      status: row.TrangThaiTaiKhoan,
      username: row.TenDangNhap,
    },
    address: row.DiaChi,
    customerId: row.MaKH,
    dateOfBirth: dateOnly(row.NgaySinh),
    email: row.Email,
    fullName: row.HoTen,
    loyaltyPoints: row.DiemTichLuy,
    membershipTier: row.HangThanhVien,
    phone: row.SDT,
    registeredAt: timestamp(row.NgayDangKy),
    status: row.TrangThai,
  };
}

function paginationResult(items, page, pageSize, totalItems) {
  return {
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    },
  };
}

function notFound(resource) {
  return new AppError(`${resource} was not found`, {
    code: `${resource.toUpperCase()}_NOT_FOUND`,
    statusCode: 404,
  });
}

function conflict(code, message) {
  return new AppError(message, { code, statusCode: 409 });
}

function normalizeIpAddress(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().slice(0, 45);
}

function accountRoleForOwner(ownerType, role) {
  if (ownerType === 'CUSTOMER' && role !== 'CUSTOMER') {
    throw validationError('CUSTOMER owners must use the CUSTOMER role');
  }
  if (ownerType === 'EMPLOYEE' && !EMPLOYEE_ROLES.includes(role)) {
    throw validationError('EMPLOYEE owners must use CASHIER, WAREHOUSE or MANAGER role');
  }
  return role;
}

class AdminService {
  constructor({
    adminRepository = new AdminRepository(),
    customerRepository = new CustomerRepository(),
    employeeIdGenerator = createEmployeeId,
    passwordHasher = bcrypt,
    settingsProvider = getAuthSettings,
    transactionRunner = withTransaction,
  } = {}) {
    this.adminRepository = adminRepository;
    this.customerRepository = customerRepository;
    this.employeeIdGenerator = employeeIdGenerator;
    this.passwordHasher = passwordHasher;
    this.settingsProvider = settingsProvider;
    this.transactionRunner = transactionRunner;
  }

  async listEmployees(query = {}) {
    const filters = normalizeListQuery(query, {
      status: normalizeEnum(query.status, 'status', EMPLOYEE_STATUSES, { optional: true }),
    });
    const result = await this.adminRepository.listEmployees(filters);
    return paginationResult(
      result.items.map(serializeEmployee),
      filters.page,
      filters.pageSize,
      result.totalItems,
    );
  }

  async getEmployee(employeeIdInput) {
    const employeeId = normalizeId(employeeIdInput, 'employeeId');
    const employee = await this.adminRepository.findEmployeeById(employeeId);
    if (!employee) throw notFound('EMPLOYEE');
    return serializeEmployee(employee);
  }

  async listCustomers(query = {}) {
    const filters = normalizeListQuery(query, {
      membershipTier: normalizeEnum(
        query.membershipTier,
        'membershipTier',
        MEMBERSHIP_TIERS,
        { optional: true },
      ),
      status: normalizeEnum(query.status, 'status', CUSTOMER_STATUSES, { optional: true }),
    });
    const result = await this.adminRepository.listCustomers(filters);
    return paginationResult(
      result.items.map(serializeManagedCustomer),
      filters.page,
      filters.pageSize,
      result.totalItems,
    );
  }

  async getCustomer(customerIdInput) {
    const customerId = normalizeId(customerIdInput, 'customerId');
    const customer = await this.adminRepository.findCustomerById(customerId);
    if (!customer) throw notFound('CUSTOMER');
    return serializeManagedCustomer(customer);
  }

  async listCustomerInvoices(customerIdInput, query = {}) {
    const customerId = normalizeId(customerIdInput, 'customerId');
    if (!await this.adminRepository.findCustomerById(customerId)) {
      throw notFound('CUSTOMER');
    }
    const filters = normalizeInvoiceListQuery(query);
    const result = await this.customerRepository.listInvoices({ customerId, ...filters });
    return paginationResult(
      result.items.map(serializeInvoiceSummary),
      filters.page,
      filters.pageSize,
      result.totalItems,
    );
  }

  async getCustomerInvoiceDetail(customerIdInput, invoiceIdInput) {
    const customerId = normalizeId(customerIdInput, 'customerId');
    const invoiceId = requireString(invoiceIdInput, 'invoiceId', { maxLength: 15 });
    if (!await this.adminRepository.findCustomerById(customerId)) {
      throw notFound('CUSTOMER');
    }
    const result = await this.customerRepository.findInvoiceDetail(customerId, invoiceId);
    if (!result) throw notFound('INVOICE');
    return serializeInvoiceDetail(result);
  }

  async createEmployee(identity, input, ipAddress = null) {
    const employee = {
      address: normalizeOptionalText(input.address, 'address', 255),
      baseSalary: input.baseSalary === undefined ? 0 : normalizeBaseSalary(input.baseSalary),
      dateOfBirth: normalizeDate(input.dateOfBirth, 'dateOfBirth'),
      email: normalizeEmail(input.email),
      employeeId: this.employeeIdGenerator(),
      fullName: normalizeFullName(input.fullName),
      gender: input.gender === undefined || input.gender === null || input.gender === ''
        ? null
        : normalizeEnum(input.gender, 'gender', GENDERS),
      phone: normalizePhone(input.phone),
      startDate: input.startDate === undefined
        ? new Date().toISOString().slice(0, 10)
        : normalizeDate(input.startDate, 'startDate'),
      status: input.status === undefined
        ? 'ACTIVE'
        : normalizeEnum(input.status, 'status', EMPLOYEE_STATUSES),
    };

    try {
      return await this.transactionRunner(async (transaction) => {
        const identifiers = await this.adminRepository.findEmployeeIdentifierConflicts(
          employee,
          transaction,
        );
        if (identifiers.phoneExists) {
          throw conflict('EMPLOYEE_CONFLICT', 'The phone number is already in use');
        }
        if (identifiers.emailExists) {
          throw conflict('EMPLOYEE_CONFLICT', 'The email address is already in use');
        }

        const created = await this.adminRepository.createEmployee(employee, transaction);
        const response = serializeEmployee(created);
        await this.adminRepository.writeAudit({
          action: 'EMPLOYEE_CREATED',
          actorAccountId: identity.accountId,
          ipAddress: normalizeIpAddress(ipAddress),
          newData: JSON.stringify(response),
          oldData: null,
          recordId: response.employeeId,
          tableName: 'NHAN_VIEN',
        }, transaction);
        return response;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw conflict('EMPLOYEE_CONFLICT', 'The employee identifier is already in use');
      }
      throw error;
    }
  }

  async updateEmployee(identity, employeeIdInput, input, ipAddress = null) {
    const employeeId = normalizeId(employeeIdInput, 'employeeId');
    const changes = {};
    if (Object.hasOwn(input, 'address')) {
      changes.address = normalizeOptionalText(input.address, 'address', 255);
    }
    if (Object.hasOwn(input, 'baseSalary')) changes.baseSalary = normalizeBaseSalary(input.baseSalary);
    if (Object.hasOwn(input, 'dateOfBirth')) {
      changes.dateOfBirth = normalizeDate(input.dateOfBirth, 'dateOfBirth');
    }
    if (Object.hasOwn(input, 'email')) changes.email = normalizeEmail(input.email);
    if (Object.hasOwn(input, 'fullName')) changes.fullName = normalizeFullName(input.fullName);
    if (Object.hasOwn(input, 'gender')) {
      changes.gender = input.gender === null || input.gender === ''
        ? null
        : normalizeEnum(input.gender, 'gender', GENDERS);
    }
    if (Object.hasOwn(input, 'phone')) changes.phone = normalizePhone(input.phone);
    if (Object.hasOwn(input, 'startDate')) {
      changes.startDate = normalizeDate(input.startDate, 'startDate');
    }
    if (Object.hasOwn(input, 'status')) {
      changes.status = normalizeEnum(input.status, 'status', EMPLOYEE_STATUSES);
    }

    try {
      return await this.transactionRunner(async (transaction) => {
        const current = await this.adminRepository.findEmployeeById(
          employeeId,
          transaction,
          { lock: true },
        );
        if (!current) throw notFound('EMPLOYEE');

        const identifiers = await this.adminRepository.findEmployeeIdentifierConflicts({
          email: Object.hasOwn(changes, 'email') ? changes.email : current.Email,
          employeeId,
          phone: Object.hasOwn(changes, 'phone') ? changes.phone : current.SDT,
        }, transaction);
        if (identifiers.phoneExists) {
          throw conflict('EMPLOYEE_CONFLICT', 'The phone number is already in use');
        }
        if (identifiers.emailExists) {
          throw conflict('EMPLOYEE_CONFLICT', 'The email address is already in use');
        }

        const updated = await this.adminRepository.updateEmployee(employeeId, changes, transaction);
        const oldData = serializeEmployee(current);
        const newData = serializeEmployee(updated);
        await this.adminRepository.writeAudit({
          action: 'EMPLOYEE_UPDATED',
          actorAccountId: identity.accountId,
          ipAddress: normalizeIpAddress(ipAddress),
          newData: JSON.stringify(newData),
          oldData: JSON.stringify(oldData),
          recordId: employeeId,
          tableName: 'NHAN_VIEN',
        }, transaction);
        return newData;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw conflict('EMPLOYEE_CONFLICT', 'The employee identifier is already in use');
      }
      throw error;
    }
  }

  async listAccounts(query = {}) {
    const filters = normalizeListQuery(query, {
      ownerType: normalizeEnum(query.ownerType, 'ownerType', OWNER_TYPES, { optional: true }),
      role: normalizeEnum(query.role, 'role', ACCOUNT_ROLES, { optional: true }),
      status: normalizeEnum(query.status, 'status', ACCOUNT_STATUSES, { optional: true }),
    });
    const result = await this.adminRepository.listAccounts(filters);
    return paginationResult(
      result.items.map(serializeAccount),
      filters.page,
      filters.pageSize,
      result.totalItems,
    );
  }

  async getAccount(accountIdInput) {
    const accountId = normalizeAccountId(accountIdInput);
    const account = await this.adminRepository.findAccountById(accountId);
    if (!account) throw notFound('ACCOUNT');
    return serializeAccount(account);
  }

  async createAccount(identity, input, ipAddress = null) {
    const ownerType = normalizeEnum(input.ownerType, 'ownerType', OWNER_TYPES);
    const ownerId = normalizeId(input.ownerId, 'ownerId');
    const role = accountRoleForOwner(
      ownerType,
      normalizeEnum(input.role, 'role', ACCOUNT_ROLES),
    );
    const username = requireString(input.username, 'username', { maxLength: 50 });
    const password = normalizePassword(input.password);
    const confirmation = normalizePassword(input.passwordConfirmation, 'passwordConfirmation');
    assertPasswordsMatch(password, confirmation, 'passwordConfirmation');
    const passwordHash = await this.passwordHasher.hash(
      password,
      this.settingsProvider().bcryptRounds,
    );

    try {
      return await this.transactionRunner(async (transaction) => {
        const owner = await this.adminRepository.findOwner(ownerType, ownerId, transaction);
        if (!owner) throw notFound('ACCOUNT_OWNER');
        if (owner.TrangThai !== 'ACTIVE') {
          throw conflict('ACCOUNT_OWNER_INACTIVE', 'The account owner is inactive');
        }
        if (await this.adminRepository.usernameHasConflict(
          { ownerId, ownerType, username },
          transaction,
        )) {
          throw conflict('ACCOUNT_CONFLICT', 'The username is already in use');
        }

        const accountId = await this.adminRepository.createAccount({
          ownerId,
          ownerType,
          passwordHash,
          role,
          username,
        }, transaction);
        const created = await this.adminRepository.findAccountById(accountId, transaction);
        const response = serializeAccount(created);
        await this.adminRepository.writeAudit({
          action: 'ACCOUNT_CREATED',
          actorAccountId: identity.accountId,
          ipAddress: normalizeIpAddress(ipAddress),
          newData: JSON.stringify(response),
          oldData: null,
          recordId: accountId,
          tableName: 'TAI_KHOAN',
        }, transaction);
        return response;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw conflict('ACCOUNT_CONFLICT', 'The username or owner already has an account');
      }
      throw error;
    }
  }

  async updateAccountRole(identity, accountIdInput, input, ipAddress = null) {
    const accountId = normalizeAccountId(accountIdInput);
    const role = normalizeEnum(input.role, 'role', ACCOUNT_ROLES);
    return this.transactionRunner(async (transaction) => {
      const account = await this.adminRepository.findAccountForUpdate(accountId, transaction);
      if (!account) throw notFound('ACCOUNT');
      accountRoleForOwner(account.LoaiChuSoHuu, role);
      if (account.MaVaiTro === role) return serializeAccount(await this.adminRepository.findAccountById(accountId, transaction));

      await this.adminRepository.updateAccountRole(accountId, role, transaction);
      await this.adminRepository.writeAudit({
        action: 'ACCOUNT_ROLE_CHANGED',
        actorAccountId: identity.accountId,
        ipAddress: normalizeIpAddress(ipAddress),
        newData: JSON.stringify({ role }),
        oldData: JSON.stringify({ role: account.MaVaiTro }),
        recordId: accountId,
        tableName: 'TAI_KHOAN',
      }, transaction);
      return serializeAccount(await this.adminRepository.findAccountById(accountId, transaction));
    });
  }

  async updateAccountStatus(identity, accountIdInput, input, ipAddress = null) {
    const accountId = normalizeAccountId(accountIdInput);
    const status = normalizeEnum(input.status, 'status', ['ACTIVE', 'LOCKED']);
    return this.transactionRunner(async (transaction) => {
      const account = await this.adminRepository.findAccountForUpdate(accountId, transaction);
      if (!account) throw notFound('ACCOUNT');
      return this.applyAccountStatus(identity, account, status, ipAddress, transaction);
    });
  }

  async updateCustomerAccountStatus(
    identity,
    customerIdInput,
    input,
    ipAddress = null,
  ) {
    const customerId = normalizeId(customerIdInput, 'customerId');
    const status = normalizeEnum(input.status, 'status', ['ACTIVE', 'LOCKED']);
    return this.transactionRunner(async (transaction) => {
      const account = await this.adminRepository.findCustomerAccountForUpdate(
        customerId,
        transaction,
      );
      if (!account) throw notFound('CUSTOMER_ACCOUNT');
      return this.applyAccountStatus(identity, account, status, ipAddress, transaction);
    });
  }

  async applyAccountStatus(identity, account, status, ipAddress, transaction) {
    const accountId = Number(account.MaTK);
    if (account.TrangThai === status) {
      return serializeAccount(await this.adminRepository.findAccountById(accountId, transaction));
    }

    await this.adminRepository.updateAccountStatus(accountId, status, transaction);
    await this.adminRepository.writeAudit({
      action: status === 'LOCKED' ? 'ACCOUNT_LOCKED' : 'ACCOUNT_UNLOCKED',
      actorAccountId: identity.accountId,
      ipAddress: normalizeIpAddress(ipAddress),
      newData: JSON.stringify({ status }),
      oldData: JSON.stringify({ status: account.TrangThai }),
      recordId: accountId,
      tableName: 'TAI_KHOAN',
    }, transaction);
    return serializeAccount(await this.adminRepository.findAccountById(accountId, transaction));
  }

  async resetEmployeePassword(identity, accountIdInput, input, ipAddress = null) {
    const accountId = normalizeAccountId(accountIdInput);
    const newPassword = normalizePassword(input.newPassword, 'newPassword');
    const confirmation = normalizePassword(
      input.newPasswordConfirmation,
      'newPasswordConfirmation',
    );
    assertPasswordsMatch(newPassword, confirmation, 'newPasswordConfirmation');
    const passwordHash = await this.passwordHasher.hash(
      newPassword,
      this.settingsProvider().bcryptRounds,
    );

    return this.transactionRunner(async (transaction) => {
      const account = await this.adminRepository.findAccountForUpdate(accountId, transaction);
      if (!account) throw notFound('ACCOUNT');
      if (account.LoaiChuSoHuu !== 'EMPLOYEE') {
        throw validationError('Only employee account passwords can be reset by this endpoint');
      }

      await this.adminRepository.updateAccountPassword(accountId, passwordHash, transaction);
      await this.adminRepository.writeAudit({
        action: 'EMPLOYEE_PASSWORD_RESET',
        actorAccountId: identity.accountId,
        ipAddress: normalizeIpAddress(ipAddress),
        newData: null,
        oldData: null,
        recordId: accountId,
        tableName: 'TAI_KHOAN',
      }, transaction);
      return { reset: true };
    });
  }
}

module.exports = {
  ACCOUNT_ROLES,
  AdminService,
  EMPLOYEE_ROLES,
  MEMBERSHIP_TIERS,
  createEmployeeId,
  normalizeListQuery,
  serializeAccount,
  serializeEmployee,
  serializeManagedCustomer,
};
