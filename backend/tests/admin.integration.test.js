'use strict';

process.env.JWT_SECRET ||= 'c11-integration-test-secret-with-at-least-32-bytes';
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
const { BaseRepository } = require('../src/repositories/base.repository');

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === 'true' ? test : test.skip;
const TEST_PHONE_PREFIX = '08181';
const TEST_USER_PREFIX = 'c11.';

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
  return { response, payload: await response.json() };
}

async function cleanupTestRows() {
  if (process.env.RUN_DB_INTEGRATION_TESTS !== 'true') return;
  try {
    const repository = new BaseRepository();
    await repository.query({
      text: `
        DELETE audit_log
        FROM dbo.NHAT_KY_HE_THONG AS audit_log
        LEFT JOIN dbo.TAI_KHOAN AS actor ON actor.MaTK = audit_log.MaTK
        WHERE actor.TenDangNhap LIKE 'c11.%'
           OR audit_log.MaBanGhi LIKE 'C11%'
           OR audit_log.MaBanGhi IN (
             SELECT CONVERT(VARCHAR(100), MaTK)
             FROM dbo.TAI_KHOAN
             WHERE TenDangNhap LIKE 'c11.%'
           );

        DELETE account
        FROM dbo.TAI_KHOAN AS account
        LEFT JOIN dbo.KHACH_HANG AS customer ON customer.MaKH = account.MaKH
        WHERE account.TenDangNhap LIKE 'c11.%'
           OR customer.SDT LIKE '08181%';
        DELETE FROM dbo.KHACH_HANG WHERE SDT LIKE '08181%';
        DELETE FROM dbo.NHAN_VIEN
        WHERE MaNV LIKE 'C11%'
           OR SDT LIKE '08181%'
           OR Email LIKE 'c11.%@example.test';
      `,
    });
  } finally {
    await closePool();
  }
}

after(cleanupTestRows);

integrationTest('manager-only employee/account APIs enforce ownership, locking, reset and audit', async (testContext) => {
  const baseUrl = await startServer(testContext);
  const sql = getSqlDriver(getDatabaseSettings().driver);
  const repository = new BaseRepository();
  await cleanupTestRows();

  const managerPassword = 'C11-manager-pass';
  const cashierPassword = 'C11-cashier-pass';
  const [managerHash, cashierHash] = await Promise.all([
    bcrypt.hash(managerPassword, 4),
    bcrypt.hash(cashierPassword, 4),
  ]);
  await repository.query({
    text: `
      INSERT INTO dbo.NHAN_VIEN (
        MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai
      ) VALUES
        ('C11MGR', N'C11 Manager', '0818100001', '2026-01-01', 0, 'ACTIVE'),
        ('C11CASH', N'C11 Cashier', '0818100002', '2026-01-01', 0, 'ACTIVE');

      INSERT INTO dbo.TAI_KHOAN (
        TenDangNhap, MatKhauHash, MaVaiTro, MaNV, TrangThai
      ) VALUES
        ('c11.manager', @ManagerHash, 'MANAGER', 'C11MGR', 'ACTIVE'),
        ('c11.cashier', @CashierHash, 'CASHIER', 'C11CASH', 'ACTIVE');
    `,
    parameters: {
      CashierHash: { type: sql.VarChar(255), value: cashierHash },
      ManagerHash: { type: sql.VarChar(255), value: managerHash },
    },
  });

  let result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST', body: { identifier: 'c11.manager', password: managerPassword },
  });
  assert.equal(result.response.status, 200);
  const managerToken = result.payload.data.accessToken;

  result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST', body: { identifier: 'c11.cashier', password: cashierPassword },
  });
  assert.equal(result.response.status, 200);
  const cashierToken = result.payload.data.accessToken;

  result = await requestJson(baseUrl, '/api/admin/employees', { token: cashierToken });
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.error.code, 'FORBIDDEN');

  const employeeInput = {
    fullName: 'C11 Managed Employee',
    phone: `${TEST_PHONE_PREFIX}00003`,
    email: 'c11.employee@example.test',
    dateOfBirth: '1998-05-06',
    gender: 'OTHER',
    address: 'C11 test address',
    startDate: '2026-09-01',
    baseSalary: 7000000,
  };
  result = await requestJson(baseUrl, '/api/admin/employees', {
    method: 'POST', token: managerToken, body: employeeInput,
  });
  assert.equal(result.response.status, 201);
  const employeeId = result.payload.data.employeeId;
  assert.match(employeeId, /^NV[A-F0-9]{8}$/);

  result = await requestJson(baseUrl, '/api/admin/employees', {
    method: 'POST', token: managerToken, body: { ...employeeInput, email: 'other@example.test' },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'EMPLOYEE_CONFLICT');

  result = await requestJson(
    baseUrl,
    '/api/admin/employees?page=1&pageSize=1&search=C11%20Managed&status=ACTIVE',
    { token: managerToken },
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.items.length, 1);
  assert.ok(result.payload.data.pagination.totalItems >= 1);

  result = await requestJson(baseUrl, `/api/admin/employees/${employeeId}`, {
    method: 'PATCH', token: managerToken, body: { fullName: 'C11 Updated Employee' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.fullName, 'C11 Updated Employee');

  const employeeUsername = 'c11.employee';
  const employeePassword = 'C11-employee-pass';
  result = await requestJson(baseUrl, '/api/admin/accounts', {
    method: 'POST',
    token: managerToken,
    body: {
      ownerType: 'EMPLOYEE',
      ownerId: employeeId,
      username: employeeUsername,
      role: 'CASHIER',
      password: employeePassword,
      passwordConfirmation: employeePassword,
    },
  });
  assert.equal(result.response.status, 201);
  const employeeAccountId = result.payload.data.accountId;
  assert.equal(result.payload.data.owner.type, 'EMPLOYEE');
  assert.equal(Object.hasOwn(result.payload.data, 'passwordHash'), false);

  result = await requestJson(baseUrl, '/api/admin/accounts', {
    method: 'POST',
    token: managerToken,
    body: {
      ownerType: 'EMPLOYEE',
      ownerId: employeeId,
      username: employeeUsername,
      role: 'CASHIER',
      password: employeePassword,
      passwordConfirmation: employeePassword,
    },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'ACCOUNT_CONFLICT');

  result = await requestJson(baseUrl, `/api/admin/accounts/${employeeAccountId}/role`, {
    method: 'PATCH', token: managerToken, body: { role: 'WAREHOUSE' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.role, 'WAREHOUSE');

  result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST', body: { identifier: employeeUsername, password: employeePassword },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.user.role, 'WAREHOUSE');

  result = await requestJson(baseUrl, `/api/admin/accounts/${employeeAccountId}/status`, {
    method: 'PATCH', token: managerToken, body: { status: 'LOCKED' },
  });
  assert.equal(result.response.status, 200);
  result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST', body: { identifier: employeeUsername, password: employeePassword },
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.error.code, 'ACCOUNT_LOCKED');

  result = await requestJson(baseUrl, `/api/admin/accounts/${employeeAccountId}/status`, {
    method: 'PATCH', token: managerToken, body: { status: 'ACTIVE' },
  });
  assert.equal(result.response.status, 200);

  const replacementPassword = 'C11-replacement-pass';
  result = await requestJson(baseUrl, `/api/admin/accounts/${employeeAccountId}/reset-password`, {
    method: 'POST',
    token: managerToken,
    body: { newPassword: replacementPassword, newPasswordConfirmation: replacementPassword },
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data, { reset: true });

  result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST', body: { identifier: employeeUsername, password: employeePassword },
  });
  assert.equal(result.response.status, 401);
  result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST', body: { identifier: employeeUsername, password: replacementPassword },
  });
  assert.equal(result.response.status, 200);

  const customerRegistration = {
    fullName: 'C11 Customer Owner',
    phone: `${TEST_PHONE_PREFIX}00004`,
    email: 'c11.customer@example.test',
    password: 'C11-customer-pass',
    passwordConfirmation: 'C11-customer-pass',
  };
  result = await requestJson(baseUrl, '/api/auth/register', {
    method: 'POST', body: customerRegistration,
  });
  assert.equal(result.response.status, 201);

  result = await requestJson(
    baseUrl,
    `/api/admin/accounts?ownerType=CUSTOMER&search=${encodeURIComponent(customerRegistration.phone)}`,
    { token: managerToken },
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.items.length, 1);
  const customerAccountId = result.payload.data.items[0].accountId;
  assert.equal(result.payload.data.items[0].owner.type, 'CUSTOMER');
  assert.equal(JSON.stringify(result.payload.data).includes('MatKhauHash'), false);

  result = await requestJson(baseUrl, `/api/admin/accounts/${customerAccountId}`, {
    token: managerToken,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.owner.type, 'CUSTOMER');

  result = await requestJson(baseUrl, `/api/admin/accounts/${customerAccountId}/status`, {
    method: 'PATCH', token: managerToken, body: { status: 'LOCKED' },
  });
  assert.equal(result.response.status, 200);
  result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { identifier: customerRegistration.phone, password: customerRegistration.password },
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.error.code, 'ACCOUNT_LOCKED');
  result = await requestJson(baseUrl, `/api/admin/accounts/${customerAccountId}/status`, {
    method: 'PATCH', token: managerToken, body: { status: 'ACTIVE' },
  });
  assert.equal(result.response.status, 200);

  result = await requestJson(baseUrl, `/api/admin/accounts/${customerAccountId}/reset-password`, {
    method: 'POST',
    token: managerToken,
    body: { newPassword: 'not-allowed-11', newPasswordConfirmation: 'not-allowed-11' },
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'VALIDATION_ERROR');

  result = await requestJson(baseUrl, `/api/admin/employees/${employeeId}`, {
    method: 'PATCH', token: managerToken, body: { status: 'INACTIVE' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.status, 'INACTIVE');
  result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST', body: { identifier: employeeUsername, password: replacementPassword },
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.error.code, 'ACCOUNT_INACTIVE');

  const auditResult = await repository.query({
    text: `
      SELECT HanhDong, DuLieuCu, DuLieuMoi
      FROM dbo.NHAT_KY_HE_THONG
      WHERE MaTK = (SELECT MaTK FROM dbo.TAI_KHOAN WHERE TenDangNhap = 'c11.manager')
        AND HanhDong IN (
          'EMPLOYEE_CREATED', 'EMPLOYEE_UPDATED', 'ACCOUNT_CREATED',
          'ACCOUNT_ROLE_CHANGED', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED',
          'EMPLOYEE_PASSWORD_RESET'
        )
    `,
  });
  const auditActions = new Set(auditResult.recordset.map((row) => row.HanhDong));
  for (const action of [
    'EMPLOYEE_CREATED', 'EMPLOYEE_UPDATED', 'ACCOUNT_CREATED',
    'ACCOUNT_ROLE_CHANGED', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED',
    'EMPLOYEE_PASSWORD_RESET',
  ]) {
    assert.equal(auditActions.has(action), true, action);
  }
  const auditPayload = JSON.stringify(auditResult.recordset).toLowerCase();
  assert.equal(auditPayload.includes(replacementPassword.toLowerCase()), false);
  assert.equal(auditPayload.includes('hashed:'), false);
});
