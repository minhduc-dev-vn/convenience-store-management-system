'use strict';

process.env.JWT_SECRET ||= 'c20-integration-test-secret-with-at-least-32-bytes';
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
        DELETE FROM dbo.NHA_CUNG_CAP WHERE MaNCC LIKE 'C20%';
        DELETE FROM dbo.TAI_KHOAN WHERE TenDangNhap LIKE 'c20.%';
        DELETE FROM dbo.KHACH_HANG WHERE MaKH = 'C20CUST';
        DELETE FROM dbo.NHAN_VIEN WHERE MaNV IN ('C20MGR', 'C20WARE', 'C20CASH');
      `,
    });
  } finally {
    await closePool();
  }
}

after(cleanupTestRows);

integrationTest('supplier CRUD, search, pagination and RBAC enforce C20 rules', async (testContext) => {
  const baseUrl = await startServer(testContext);
  const sql = getSqlDriver(getDatabaseSettings().driver);
  const repository = new BaseRepository();
  await cleanupTestRows();

  const password = 'C20-role-pass';
  const passwordHash = await bcrypt.hash(password, 4);
  await repository.query({
    text: `
      INSERT INTO dbo.NHAN_VIEN (
        MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai
      ) VALUES
        ('C20MGR', N'C20 Manager', '0832000101', '2026-01-01', 0, 'ACTIVE'),
        ('C20WARE', N'C20 Warehouse', '0832000102', '2026-01-01', 0, 'ACTIVE'),
        ('C20CASH', N'C20 Cashier', '0832000103', '2026-01-01', 0, 'ACTIVE');

      INSERT INTO dbo.KHACH_HANG (
        MaKH, HoTen, SDT, DiemTichLuy, NgayDangKy, TrangThai
      ) VALUES ('C20CUST', N'C20 Customer', '0832000104', 0, '2026-01-01', 'ACTIVE');

      INSERT INTO dbo.TAI_KHOAN (
        TenDangNhap, MatKhauHash, MaVaiTro, MaNV, MaKH, TrangThai
      ) VALUES
        ('c20.manager', @PasswordHash, 'MANAGER', 'C20MGR', NULL, 'ACTIVE'),
        ('c20.warehouse', @PasswordHash, 'WAREHOUSE', 'C20WARE', NULL, 'ACTIVE'),
        ('c20.cashier', @PasswordHash, 'CASHIER', 'C20CASH', NULL, 'ACTIVE'),
        ('c20.customer', @PasswordHash, 'CUSTOMER', NULL, 'C20CUST', 'ACTIVE');
    `,
    parameters: {
      PasswordHash: { type: sql.VarChar(255), value: passwordHash },
    },
  });

  const tokens = {};
  for (const role of ['manager', 'warehouse', 'cashier', 'customer']) {
    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST', body: { identifier: `c20.${role}`, password },
    });
    assert.equal(login.response.status, 200);
    tokens[role] = login.payload.data.accessToken;
  }

  let result = await requestJson(baseUrl, '/api/admin/suppliers', {
    method: 'POST',
    token: tokens.manager,
    body: {
      supplierId: 'C20SUP01',
      name: 'C20 Alpha Supplier',
      phone: '0832000201',
      email: 'alpha@example.com',
      address: 'Alpha address',
      taxCode: 'C20-TAX-001',
    },
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.payload.data.status, 'ACTIVE');
  assert.equal(Object.hasOwn(result.payload.data, 'passwordHash'), false);

  result = await requestJson(baseUrl, '/api/admin/suppliers', {
    method: 'POST',
    token: tokens.manager,
    body: {
      supplierId: 'C20SUP02',
      name: 'C20 Beta Supplier',
      phone: '0832000202',
      taxCode: 'C20-TAX-002',
    },
  });
  assert.equal(result.response.status, 201);

  result = await requestJson(
    baseUrl,
    '/api/admin/suppliers?page=1&pageSize=1&search=C20&status=ACTIVE',
    { token: tokens.manager },
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.pagination, {
    page: 1, pageSize: 1, totalItems: 2, totalPages: 2,
  });
  assert.equal(result.payload.data.items.length, 1);

  result = await requestJson(
    baseUrl,
    '/api/admin/suppliers?page=1&pageSize=20&search=0832000202',
    { token: tokens.manager },
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.items.map((item) => item.supplierId), ['C20SUP02']);

  result = await requestJson(baseUrl, '/api/admin/suppliers/C20SUP01', {
    token: tokens.manager,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.name, 'C20 Alpha Supplier');

  result = await requestJson(baseUrl, '/api/admin/suppliers/C20SUP01', {
    method: 'PATCH',
    token: tokens.manager,
    body: {
      name: 'C20 Alpha Updated',
      phone: '0832000299',
      email: null,
      address: 'Updated address',
      taxCode: 'C20-TAX-099',
    },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.name, 'C20 Alpha Updated');
  assert.equal(result.payload.data.phone, '0832000299');
  assert.equal(result.payload.data.email, null);

  result = await requestJson(baseUrl, '/api/admin/suppliers', {
    method: 'POST',
    token: tokens.manager,
    body: { supplierId: 'C20SUP03', name: 'Duplicate Phone', phone: '0832000299' },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'SUPPLIER_PHONE_CONFLICT');

  result = await requestJson(baseUrl, '/api/admin/suppliers', {
    method: 'POST',
    token: tokens.manager,
    body: {
      supplierId: 'C20SUP04', name: 'Duplicate Tax', phone: '0832000204',
      taxCode: 'C20-TAX-099',
    },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'SUPPLIER_TAX_CODE_CONFLICT');

  result = await requestJson(baseUrl, '/api/admin/suppliers', {
    method: 'POST',
    token: tokens.manager,
    body: { supplierId: 'C20SUP01', name: 'Duplicate Id', phone: '0832000205' },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'SUPPLIER_ID_CONFLICT');

  result = await requestJson(baseUrl, '/api/admin/suppliers/C20SUP01/status', {
    method: 'PATCH', token: tokens.manager, body: { status: 'INACTIVE' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.status, 'INACTIVE');

  for (const role of ['warehouse', 'cashier', 'customer']) {
    result = await requestJson(baseUrl, '/api/admin/suppliers', { token: tokens[role] });
    assert.equal(result.response.status, 403);
    assert.equal(result.payload.error.code, 'FORBIDDEN');
  }

  result = await requestJson(baseUrl, '/api/admin/suppliers', {
    method: 'POST',
    token: tokens.warehouse,
    body: { supplierId: 'C20NOAUTH', name: 'Forbidden', phone: '0832000210' },
  });
  assert.equal(result.response.status, 403);

  result = await requestJson(baseUrl, '/api/admin/suppliers/C20SUP01', {
    method: 'DELETE', token: tokens.manager,
  });
  assert.equal(result.response.status, 404);
  assert.equal(result.payload.error.code, 'NOT_FOUND');
});
