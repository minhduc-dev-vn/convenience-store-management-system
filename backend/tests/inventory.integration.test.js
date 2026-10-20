'use strict';

process.env.JWT_SECRET ||= 'c26-integration-test-secret-with-at-least-32-bytes';
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
        DELETE FROM dbo.LO_HANG WHERE MaLo LIKE 'C26%';
        DELETE FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C26%';
        DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai LIKE 'C26%';
        DELETE FROM dbo.TAI_KHOAN WHERE TenDangNhap LIKE 'c26.%';
        DELETE FROM dbo.KHACH_HANG WHERE MaKH = 'C26CUST';
        DELETE FROM dbo.NHAN_VIEN WHERE MaNV IN ('C26MGR', 'C26WARE', 'C26CASH');
      `,
    });
  } finally {
    await closePool();
  }
}

after(cleanupTestRows);

integrationTest('inventory summary, lot drill-down, alerts and RBAC enforce C26 rules', async (testContext) => {
  const baseUrl = await startServer(testContext);
  const sql = getSqlDriver(getDatabaseSettings().driver);
  const repository = new BaseRepository();
  await cleanupTestRows();

  const password = 'C26-role-pass';
  const passwordHash = await bcrypt.hash(password, 4);
  await repository.query({
    text: `
      INSERT INTO dbo.NHAN_VIEN (
        MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai
      ) VALUES
        ('C26MGR', N'C26 Manager', '0832600101', '2026-01-01', 0, 'ACTIVE'),
        ('C26WARE', N'C26 Warehouse', '0832600102', '2026-01-01', 0, 'ACTIVE'),
        ('C26CASH', N'C26 Cashier', '0832600103', '2026-01-01', 0, 'ACTIVE');

      INSERT INTO dbo.KHACH_HANG (
        MaKH, HoTen, SDT, DiemTichLuy, NgayDangKy, TrangThai
      ) VALUES ('C26CUST', N'C26 Customer', '0832600104', 0, '2026-01-01', 'ACTIVE');

      INSERT INTO dbo.TAI_KHOAN (
        TenDangNhap, MatKhauHash, MaVaiTro, MaNV, MaKH, TrangThai
      ) VALUES
        ('c26.manager', @PasswordHash, 'MANAGER', 'C26MGR', NULL, 'ACTIVE'),
        ('c26.warehouse', @PasswordHash, 'WAREHOUSE', 'C26WARE', NULL, 'ACTIVE'),
        ('c26.cashier', @PasswordHash, 'CASHIER', 'C26CASH', NULL, 'ACTIVE'),
        ('c26.customer', @PasswordHash, 'CUSTOMER', NULL, 'C26CUST', 'ACTIVE');

      INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, MoTa, TrangThai)
      VALUES ('C26CAT', N'C26 Category', N'C26 integration fixture', 'ACTIVE');

      INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, MaVach, DonViTinh, GiaBan,
        MucTonToiThieu, MaLoai, TrangThai
      ) VALUES
        ('C26P001', N'C26 Alpha', 'C2600001', N'Chai', 20000, 10, 'C26CAT', 'ACTIVE'),
        ('C26P002', N'C26 Beta', 'C2600002', N'Gói', 15000, 1, 'C26CAT', 'ACTIVE');

      INSERT INTO dbo.LO_HANG (
        MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
      ) VALUES
        ('C26LOT001', 'C26P001', 'C26-BATCH-1', '2026-08-01', '2026-10-10', 15000, 3, 'ACTIVE'),
        ('C26LOT002', 'C26P001', 'C26-BATCH-2', '2026-08-01', '2026-12-01', 15000, 2, 'BLOCKED'),
        ('C26LOT003', 'C26P001', 'C26-BATCH-3', '2026-07-01', '2026-09-20', 15000, 1, 'EXPIRED'),
        ('C26LOT004', 'C26P002', 'C26-BATCH-4', '2026-08-01', '2027-01-01', 10000, 5, 'ACTIVE');
    `,
    parameters: {
      PasswordHash: { type: sql.VarChar(255), value: passwordHash },
    },
  });

  const tokens = {};
  for (const role of ['manager', 'warehouse', 'cashier', 'customer']) {
    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: `c26.${role}`, password },
    });
    assert.equal(login.response.status, 200);
    tokens[role] = login.payload.data.accessToken;
  }

  let result = await requestJson(baseUrl, '/api/inventory/products');
  assert.equal(result.response.status, 401);

  for (const role of ['cashier', 'customer']) {
    result = await requestJson(baseUrl, '/api/inventory/products', { token: tokens[role] });
    assert.equal(result.response.status, 403);
    assert.equal(result.payload.error.code, 'FORBIDDEN');
  }

  result = await requestJson(
    baseUrl,
    '/api/inventory/products?page=1&pageSize=1&search=C26&categoryId=C26CAT&mode=ALL&referenceDate=2026-09-29&nearExpiryDays=30',
    { token: tokens.warehouse },
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.pagination, {
    page: 1, pageSize: 1, totalItems: 2, totalPages: 2,
  });
  assert.equal(result.payload.data.items[0].productId, 'C26P001');
  assert.equal(result.payload.data.items[0].totalStock, 6);
  assert.equal(result.payload.data.items[0].availableStock, 3);
  assert.equal(result.payload.data.items[0].blockedStock, 2);
  assert.equal(result.payload.data.items[0].expiredStock, 1);
  assert.deepEqual(result.payload.data.items[0].alerts, {
    expired: true, lowStock: true, nearExpiry: true,
  });

  result = await requestJson(
    baseUrl,
    '/api/inventory/products?search=C26P002&referenceDate=2026-09-29',
    { token: tokens.manager },
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.items.map((item) => item.productId), ['C26P002']);

  for (const mode of ['LOW_STOCK', 'NEAR_EXPIRY', 'EXPIRED']) {
    result = await requestJson(
      baseUrl,
      `/api/inventory/products?categoryId=C26CAT&mode=${mode}&referenceDate=2026-09-29&nearExpiryDays=30`,
      { token: tokens.manager },
    );
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.payload.data.items.map((item) => item.productId), ['C26P001']);
  }

  result = await requestJson(
    baseUrl,
    '/api/inventory/lots?categoryId=C26CAT&expiryStatus=NEAR_EXPIRY&referenceDate=2026-09-29&nearExpiryDays=30',
    { token: tokens.manager },
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.items.map((item) => item.lotId), ['C26LOT001']);
  assert.equal(result.payload.data.items[0].expiryStatus, 'NEAR_EXPIRY');
  assert.equal(Object.hasOwn(result.payload.data.items[0], 'unitCost'), false);
  assert.equal(Object.hasOwn(result.payload.data.items[0], 'GiaNhap'), false);

  result = await requestJson(
    baseUrl,
    '/api/inventory/products/C26P001/lots?page=1&pageSize=2&referenceDate=2026-09-29&nearExpiryDays=30',
    { token: tokens.warehouse },
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.pagination, {
    page: 1, pageSize: 2, totalItems: 3, totalPages: 2,
  });
  assert.ok(result.payload.data.items.every((item) => item.product.productId === 'C26P001'));
  assert.deepEqual(
    result.payload.data.items.map((item) => item.expiryStatus),
    ['EXPIRED', 'NEAR_EXPIRY'],
  );

  result = await requestJson(
    baseUrl,
    '/api/inventory/products/C26NONE/lots?referenceDate=2026-09-29',
    { token: tokens.manager },
  );
  assert.equal(result.response.status, 404);
  assert.equal(result.payload.error.code, 'PRODUCT_NOT_FOUND');

  result = await requestJson(
    baseUrl,
    '/api/inventory/products?mode=UNKNOWN',
    { token: tokens.manager },
  );
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'VALIDATION_ERROR');

  result = await requestJson(
    baseUrl,
    '/api/inventory/lots?nearExpiryDays=3651',
    { token: tokens.warehouse },
  );
  assert.equal(result.response.status, 400);

  result = await requestJson(baseUrl, '/api/inventory/products', {
    method: 'POST', token: tokens.manager, body: { totalStock: 999 },
  });
  assert.equal(result.response.status, 404);
  assert.equal(result.payload.error.code, 'NOT_FOUND');
});
