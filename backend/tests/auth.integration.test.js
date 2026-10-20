'use strict';

process.env.JWT_SECRET ||= 'c08-integration-test-secret-with-at-least-32-bytes';
process.env.JWT_EXPIRES_IN ||= '15m';
process.env.BCRYPT_ROUNDS ||= '4';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const { after, test } = require('node:test');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const { getDatabaseSettings } = require('../src/config/database.config');
const { getSqlDriver } = require('../src/config/database.driver');
const { closePool } = require('../src/config/database.pool');
const { AuthRepository } = require('../src/repositories/auth.repository');
const { BaseRepository } = require('../src/repositories/base.repository');
const { AuthService } = require('../src/services/auth.service');
const { withTransaction } = require('../src/utils/transaction');

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === 'true' ? test : test.skip;
const TEST_PHONE_PREFIX = '08180';
const TEST_USER_PREFIX = 'c08.';

async function startServer(testContext) {
  const server = app.listen(0);
  await once(server, 'listening');
  testContext.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

async function requestJson(baseUrl, path, { body, method = 'GET', token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { payload, response };
}

async function cleanupTestRows() {
  if (process.env.RUN_DB_INTEGRATION_TESTS !== 'true') return;

  try {
    const repository = new BaseRepository();
    await repository.query({
      text: `
        DELETE audit_log
        FROM dbo.NHAT_KY_HE_THONG AS audit_log
        JOIN dbo.TAI_KHOAN AS account ON account.MaTK = audit_log.MaTK
        LEFT JOIN dbo.KHACH_HANG AS customer ON customer.MaKH = account.MaKH
        WHERE account.TenDangNhap LIKE 'c08.%'
           OR customer.SDT LIKE '08180%';

        DELETE account
        FROM dbo.TAI_KHOAN AS account
        LEFT JOIN dbo.KHACH_HANG AS customer ON customer.MaKH = account.MaKH
        WHERE account.TenDangNhap LIKE 'c08.%'
           OR customer.SDT LIKE '08180%';

        DELETE FROM dbo.KHACH_HANG WHERE SDT LIKE '08180%';
        DELETE FROM dbo.NHAN_VIEN WHERE MaNV LIKE 'C08%';
      `,
    });
  } finally {
    await closePool();
  }
}

after(cleanupTestRows);

integrationTest('registration, login, profile ownership, four-role password change and rollback work end to end', async (testContext) => {
  const baseUrl = await startServer(testContext);
  const sql = getSqlDriver(getDatabaseSettings().driver);
  const repository = new BaseRepository();

  await cleanupTestRows();

  const primaryRegistration = {
    fullName: 'C08 Primary Customer',
    phone: `${TEST_PHONE_PREFIX}00001`,
    email: 'c08.primary@example.com',
    dateOfBirth: '2000-01-02',
    password: 'Initial-pass-08',
    passwordConfirmation: 'Initial-pass-08',
  };
  let result = await requestJson(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: primaryRegistration,
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.payload.data.account.role, 'CUSTOMER');
  assert.equal(result.payload.data.account.username, primaryRegistration.phone);

  const primaryCustomerId = result.payload.data.customer.customerId;
  const storedRegistration = await repository.query({
    text: `
      SELECT customer.MaKH, customer.DiemTichLuy, customer.HangThanhVien,
             account.MaTK, account.MatKhauHash, account.MaVaiTro
      FROM dbo.KHACH_HANG AS customer
      JOIN dbo.TAI_KHOAN AS account ON account.MaKH = customer.MaKH
      WHERE customer.SDT = @Phone
    `,
    parameters: {
      Phone: { type: sql.VarChar(15), value: primaryRegistration.phone },
    },
  });
  assert.equal(storedRegistration.recordset.length, 1);
  assert.equal(storedRegistration.recordset[0].DiemTichLuy, 0);
  assert.equal(storedRegistration.recordset[0].HangThanhVien, 'BRONZE');
  assert.equal(storedRegistration.recordset[0].MaVaiTro, 'CUSTOMER');
  assert.notEqual(storedRegistration.recordset[0].MatKhauHash, primaryRegistration.password);
  assert.equal(
    await bcrypt.compare(primaryRegistration.password, storedRegistration.recordset[0].MatKhauHash),
    true,
  );

  result = await requestJson(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: {
      ...primaryRegistration,
      phone: `${TEST_PHONE_PREFIX}00002`,
    },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'REGISTRATION_CONFLICT');

  const duplicateEmailRollback = await repository.query({
    text: 'SELECT COUNT(*) AS [Count] FROM dbo.KHACH_HANG WHERE SDT = @Phone',
    parameters: {
      Phone: { type: sql.VarChar(15), value: `${TEST_PHONE_PREFIX}00002` },
    },
  });
  assert.equal(duplicateEmailRollback.recordset[0].Count, 0);

  result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { identifier: primaryRegistration.phone, password: 'wrong-password' },
  });
  assert.equal(result.response.status, 401);
  assert.equal(result.payload.error.code, 'INVALID_CREDENTIALS');

  result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { identifier: primaryRegistration.email, password: primaryRegistration.password },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.user.role, 'CUSTOMER');
  const primaryToken = result.payload.data.accessToken;

  result = await requestJson(baseUrl, '/api/customers/me', { token: primaryToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.customerId, primaryCustomerId);

  const secondaryRegistration = {
    fullName: 'C08 Secondary Customer',
    phone: `${TEST_PHONE_PREFIX}00003`,
    email: 'c08.secondary@example.com',
    password: 'Secondary-pass-08',
    passwordConfirmation: 'Secondary-pass-08',
  };
  result = await requestJson(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: secondaryRegistration,
  });
  assert.equal(result.response.status, 201);
  const secondaryCustomerId = result.payload.data.customer.customerId;

  result = await requestJson(baseUrl, '/api/customers/me', {
    method: 'PATCH',
    token: primaryToken,
    body: {
      customerId: secondaryCustomerId,
      fullName: 'Attempted Cross-owner Update',
    },
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'VALIDATION_ERROR');

  const secondaryAfterAttack = await repository.query({
    text: 'SELECT HoTen FROM dbo.KHACH_HANG WHERE MaKH = @CustomerId',
    parameters: {
      CustomerId: { type: sql.VarChar(10), value: secondaryCustomerId },
    },
  });
  assert.equal(secondaryAfterAttack.recordset[0].HoTen, secondaryRegistration.fullName);

  result = await requestJson(baseUrl, '/api/customers/me', {
    method: 'PATCH',
    token: primaryToken,
    body: {
      fullName: 'C08 Updated Customer',
      email: 'c08.updated@example.com',
      address: 'Integration test address',
    },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.customerId, primaryCustomerId);
  assert.equal(result.payload.data.loyaltyPoints, 0);
  assert.equal(result.payload.data.phone, primaryRegistration.phone);

  const initialStaffPassword = 'Staff-initial-08';
  const initialStaffHash = await bcrypt.hash(initialStaffPassword, 4);
  const staff = [
    { employeeId: 'C08CASH', phone: `${TEST_PHONE_PREFIX}10001`, role: 'CASHIER', username: 'c08.cashier' },
    { employeeId: 'C08WARE', phone: `${TEST_PHONE_PREFIX}10002`, role: 'WAREHOUSE', username: 'c08.warehouse' },
    {
      employeeId: 'C08MGR',
      phone: `${TEST_PHONE_PREFIX}10003`,
      role: 'MANAGER',
      username: 'c08.manager@example.com',
    },
  ];

  for (const member of staff) {
    await repository.query({
      text: `
        INSERT INTO dbo.NHAN_VIEN (MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai)
        VALUES (@EmployeeId, @FullName, @Phone, CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE');

        INSERT INTO dbo.TAI_KHOAN (TenDangNhap, MatKhauHash, MaVaiTro, MaNV, TrangThai)
        VALUES (@Username, @PasswordHash, @Role, @EmployeeId, 'ACTIVE');
      `,
      parameters: {
        EmployeeId: { type: sql.VarChar(10), value: member.employeeId },
        FullName: { type: sql.NVarChar(100), value: `C08 ${member.role}` },
        PasswordHash: { type: sql.VarChar(255), value: initialStaffHash },
        Phone: { type: sql.VarChar(15), value: member.phone },
        Role: { type: sql.VarChar(20), value: member.role },
        Username: { type: sql.VarChar(50), value: member.username },
      },
    });
  }

  result = await requestJson(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: {
      fullName: 'C08 Ambiguous Identifier',
      phone: `${TEST_PHONE_PREFIX}00004`,
      email: 'c08.manager@example.com',
      password: 'Ambiguous-pass-08',
      passwordConfirmation: 'Ambiguous-pass-08',
    },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'REGISTRATION_CONFLICT');

  result = await requestJson(baseUrl, '/api/customers/me', {
    method: 'PATCH',
    token: primaryToken,
    body: { email: 'c08.manager@example.com' },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'PROFILE_CONFLICT');

  const roleCredentials = [
    {
      identifier: primaryRegistration.phone,
      oldPassword: primaryRegistration.password,
      newPassword: 'Customer-new-pass-08',
      role: 'CUSTOMER',
      token: primaryToken,
    },
    ...staff.map((member, index) => ({
      identifier: member.username,
      oldPassword: initialStaffPassword,
      newPassword: `Staff-new-pass-${index + 1}-08`,
      role: member.role,
    })),
  ];

  for (const credentials of roleCredentials) {
    let token = credentials.token;
    if (!token) {
      const loginResult = await requestJson(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { identifier: credentials.identifier, password: credentials.oldPassword },
      });
      assert.equal(loginResult.response.status, 200, credentials.role);
      token = loginResult.payload.data.accessToken;
    }

    const changeResult = await requestJson(baseUrl, '/api/auth/password', {
      method: 'PATCH',
      token,
      body: {
        currentPassword: credentials.oldPassword,
        newPassword: credentials.newPassword,
        newPasswordConfirmation: credentials.newPassword,
      },
    });
    assert.equal(changeResult.response.status, 200, credentials.role);

    const reloginResult = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: credentials.identifier, password: credentials.newPassword },
    });
    assert.equal(reloginResult.response.status, 200, credentials.role);
    assert.equal(reloginResult.payload.data.user.role, credentials.role);

    const profileResult = await requestJson(baseUrl, '/api/customers/me', {
      token: reloginResult.payload.data.accessToken,
    });
    assert.equal(profileResult.response.status, credentials.role === 'CUSTOMER' ? 200 : 403);
  }

  const auditResult = await repository.query({
    text: `
      SELECT COUNT(*) AS [Count]
      FROM dbo.NHAT_KY_HE_THONG AS audit_log
      JOIN dbo.TAI_KHOAN AS account ON account.MaTK = audit_log.MaTK
      WHERE audit_log.HanhDong = 'PASSWORD_CHANGED'
        AND (
          account.TenDangNhap LIKE 'c08.%'
          OR account.TenDangNhap = @CustomerUsername
        )
        AND audit_log.DuLieuCu IS NULL
        AND audit_log.DuLieuMoi IS NULL
    `,
    parameters: {
      CustomerUsername: { type: sql.VarChar(50), value: primaryRegistration.phone },
    },
  });
  assert.equal(auditResult.recordset[0].Count, 4);

  await repository.query({
    text: "UPDATE dbo.TAI_KHOAN SET TrangThai = 'LOCKED' WHERE TenDangNhap = @Username",
    parameters: {
      Username: { type: sql.VarChar(50), value: 'c08.cashier' },
    },
  });
  result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { identifier: 'c08.cashier', password: 'Staff-new-pass-1-08' },
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.error.code, 'ACCOUNT_LOCKED');

  const realAuthRepository = new AuthRepository();
  const rollbackPhone = `${TEST_PHONE_PREFIX}00999`;
  const failingRepository = {
    findRegistrationConflict: (...args) => realAuthRepository.findRegistrationConflict(...args),
    createCustomer: (...args) => realAuthRepository.createCustomer(...args),
    async createCustomerAccount() {
      throw new Error('FORCED_ACCOUNT_INSERT_FAILURE');
    },
  };
  const rollbackService = new AuthService({
    authRepository: failingRepository,
    customerIdGenerator: () => 'C08RBK001',
    settingsProvider: () => ({ bcryptRounds: 4 }),
    transactionRunner: withTransaction,
  });

  await assert.rejects(
    rollbackService.register({
      fullName: 'C08 Rollback Customer',
      phone: rollbackPhone,
      email: 'c08.rollback@example.com',
      password: 'Rollback-pass-08',
      passwordConfirmation: 'Rollback-pass-08',
    }),
    /FORCED_ACCOUNT_INSERT_FAILURE/,
  );

  const rollbackResult = await repository.query({
    text: 'SELECT COUNT(*) AS [Count] FROM dbo.KHACH_HANG WHERE SDT = @Phone',
    parameters: {
      Phone: { type: sql.VarChar(15), value: rollbackPhone },
    },
  });
  assert.equal(rollbackResult.recordset[0].Count, 0);
});
