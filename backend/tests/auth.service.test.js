'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { AuthService } = require('../src/services/auth.service');

function createPasswordHasher() {
  return {
    async hash(value, rounds) {
      return `hash:${rounds}:${value}`;
    },
    async compare(value, hash) {
      return hash.endsWith(`:${value}`) || (value === 'current-pass' && hash === 'current-hash');
    },
  };
}

test('registration derives CUSTOMER username from required phone and uses one transaction', async () => {
  const events = [];
  const transaction = { id: 'tx' };
  const repository = {
    async findRegistrationConflict(input, receivedTransaction) {
      assert.deepEqual(input, { email: 'member@example.com', phone: '0901234567' });
      assert.equal(receivedTransaction, transaction);
      events.push('check');
      return { emailExists: false, phoneExists: false };
    },
    async createCustomer(input, receivedTransaction) {
      assert.equal(receivedTransaction, transaction);
      assert.equal(input.customerId, 'KHC08UNIT');
      events.push('customer');
      return {
        MaKH: input.customerId,
        HoTen: input.fullName,
        SDT: input.phone,
        Email: input.email,
        NgaySinh: input.dateOfBirth,
        HangThanhVien: 'BRONZE',
      };
    },
    async createCustomerAccount(input, receivedTransaction) {
      assert.equal(receivedTransaction, transaction);
      assert.equal(input.username, '0901234567');
      events.push('account');
      return {
        MaTK: 21,
        TenDangNhap: input.username,
        MaVaiTro: 'CUSTOMER',
        TrangThai: 'ACTIVE',
      };
    },
  };
  const service = new AuthService({
    authRepository: repository,
    customerIdGenerator: () => 'KHC08UNIT',
    passwordHasher: createPasswordHasher(),
    settingsProvider: () => ({ bcryptRounds: 4 }),
    transactionRunner: async (work) => work(transaction),
  });

  const result = await service.register({
    fullName: '  Test   Member ',
    phone: '0901234567',
    email: 'MEMBER@example.com',
    dateOfBirth: '2000-01-02',
    password: 'sample-password',
    passwordConfirmation: 'sample-password',
  });

  assert.deepEqual(events, ['check', 'customer', 'account']);
  assert.equal(result.account.role, 'CUSTOMER');
  assert.equal(result.customer.fullName, 'Test Member');
});

test('login returns 401 for bad credentials and 403 for locked or inactive accounts', async () => {
  const baseAccount = {
    MaTK: 2,
    TenDangNhap: 'cashier',
    MatKhauHash: 'hash:4:correct-pass',
    MaVaiTro: 'CASHIER',
    TenVaiTro: 'Thu ngân',
    LoaiChuSoHuu: 'EMPLOYEE',
    MaChuSoHuu: 'NV01',
    TenChuSoHuu: 'Cashier',
    TrangThaiChuSoHuu: 'ACTIVE',
  };
  const repository = {
    async findForAuthentication() {
      return { ...baseAccount, TrangThai: 'ACTIVE' };
    },
    async updateLastLogin() {},
  };
  const service = new AuthService({
    authRepository: repository,
    passwordHasher: createPasswordHasher(),
    tokenService: { sign: () => 'token' },
  });

  await assert.rejects(
    service.login({ identifier: 'cashier', password: 'wrong-pass' }),
    (error) => error.statusCode === 401 && error.code === 'INVALID_CREDENTIALS',
  );

  repository.findForAuthentication = async () => ({ ...baseAccount, TrangThai: 'LOCKED' });
  await assert.rejects(
    service.login({ identifier: 'cashier', password: 'correct-pass' }),
    (error) => error.statusCode === 403 && error.code === 'ACCOUNT_LOCKED',
  );

  repository.findForAuthentication = async () => ({
    ...baseAccount,
    TrangThai: 'ACTIVE',
    TrangThaiChuSoHuu: 'INACTIVE',
  });
  await assert.rejects(
    service.login({ identifier: 'cashier', password: 'correct-pass' }),
    (error) => error.statusCode === 403 && error.code === 'ACCOUNT_INACTIVE',
  );
});

test('password values are not trimmed during registration or login', async () => {
  const passwordHasher = {
    async hash(value) {
      assert.equal(value, '  pass  ');
      return 'spaced-hash';
    },
    async compare(value, hash) {
      assert.equal(value, '  pass  ');
      return hash === 'spaced-hash';
    },
  };
  const repository = {
    async findRegistrationConflict() {
      return { emailExists: false, phoneExists: false };
    },
    async createCustomer(input) {
      return {
        MaKH: input.customerId,
        HoTen: input.fullName,
        SDT: input.phone,
        Email: null,
        NgaySinh: null,
        HangThanhVien: 'BRONZE',
      };
    },
    async createCustomerAccount(input) {
      return {
        MaTK: 22,
        TenDangNhap: input.username,
        MaVaiTro: 'CUSTOMER',
        TrangThai: 'ACTIVE',
      };
    },
    async findForAuthentication() {
      return {
        MaTK: 22,
        TenDangNhap: '0901234568',
        MatKhauHash: 'spaced-hash',
        MaVaiTro: 'CUSTOMER',
        TenVaiTro: 'Khach hang',
        LoaiChuSoHuu: 'CUSTOMER',
        MaChuSoHuu: 'KHC08SPACE',
        TenChuSoHuu: 'Space Password',
        TrangThai: 'ACTIVE',
        TrangThaiChuSoHuu: 'ACTIVE',
      };
    },
    async updateLastLogin() {},
  };
  const service = new AuthService({
    authRepository: repository,
    customerIdGenerator: () => 'KHC08SPACE',
    passwordHasher,
    settingsProvider: () => ({ bcryptRounds: 4 }),
    tokenService: { sign: () => 'token' },
    transactionRunner: async (work) => work({ id: 'tx' }),
  });

  await service.register({
    fullName: 'Space Password',
    phone: '0901234568',
    password: '  pass  ',
    passwordConfirmation: '  pass  ',
  });
  await service.login({ identifier: '0901234568', password: '  pass  ' });
});

test('change password is common to every authenticated role and audits without password data', async () => {
  for (const role of ['CUSTOMER', 'CASHIER', 'WAREHOUSE', 'MANAGER']) {
    const events = [];
    const repository = {
      async findSecretById() {
        return {
          MaTK: 8,
          MatKhauHash: 'current-hash',
          MaVaiTro: role,
          TrangThai: 'ACTIVE',
          TrangThaiChuSoHuu: 'ACTIVE',
        };
      },
      async updatePassword(accountId, hash) {
        events.push(['update', accountId, hash]);
      },
      async writePasswordChangeAudit(accountId, ipAddress) {
        events.push(['audit', accountId, ipAddress]);
      },
    };
    const service = new AuthService({
      auditService: {
        async record(audit) {
          events.push(['audit', audit.actorAccountId, audit.ipAddress]);
        },
      },
      authRepository: repository,
      passwordHasher: createPasswordHasher(),
      settingsProvider: () => ({ bcryptRounds: 4 }),
      transactionRunner: async (work) => work({ id: 'tx' }),
    });

    const result = await service.changePassword(
      { accountId: 8, role },
      {
        currentPassword: 'current-pass',
        newPassword: 'new-pass-value',
        newPasswordConfirmation: 'new-pass-value',
      },
      '127.0.0.1',
    );

    assert.deepEqual(result, { changed: true });
    assert.deepEqual(events, [
      ['update', 8, 'hash:4:new-pass-value'],
      ['audit', 8, '127.0.0.1'],
    ]);
  }
});
