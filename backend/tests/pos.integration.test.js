'use strict';

process.env.JWT_SECRET ||= 'c29-integration-test-secret-with-at-least-32-bytes';
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
        DELETE FROM dbo.CA_LAM_VIEC WHERE MaNV IN ('C29CASH', 'C29MGR', 'C29WARE');
        DELETE FROM dbo.LO_HANG WHERE MaLo LIKE 'C29%';
        DELETE FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C29%';
        DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai LIKE 'C29%';
        DELETE FROM dbo.TAI_KHOAN WHERE TenDangNhap LIKE 'c29.%';
        DELETE FROM dbo.KHACH_HANG WHERE MaKH = 'C29CUST';
        DELETE FROM dbo.NHAN_VIEN WHERE MaNV IN ('C29CASH', 'C29MGR', 'C29WARE');
      `,
    });
  } finally {
    await closePool();
  }
}

after(cleanupTestRows);

integrationTest('shift opening, current shift, sellable lookup and RBAC enforce C29 rules', async (testContext) => {
  const baseUrl = await startServer(testContext);
  const sql = getSqlDriver(getDatabaseSettings().driver);
  const repository = new BaseRepository();
  await cleanupTestRows();

  const password = 'C29-role-pass';
  const passwordHash = await bcrypt.hash(password, 4);
  await repository.query({
    text: `
      INSERT INTO dbo.NHAN_VIEN (
        MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai
      ) VALUES
        ('C29CASH', N'C29 Cashier', '0832900101', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE'),
        ('C29MGR', N'C29 Manager', '0832900102', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE'),
        ('C29WARE', N'C29 Warehouse', '0832900103', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE');

      INSERT INTO dbo.KHACH_HANG (
        MaKH, HoTen, SDT, DiemTichLuy, NgayDangKy, TrangThai
      ) VALUES ('C29CUST', N'C29 Customer', '0832900104', 0, SYSDATETIME(), 'ACTIVE');

      INSERT INTO dbo.TAI_KHOAN (
        TenDangNhap, MatKhauHash, MaVaiTro, MaNV, MaKH, TrangThai
      ) VALUES
        ('c29.cashier', @PasswordHash, 'CASHIER', 'C29CASH', NULL, 'ACTIVE'),
        ('c29.manager', @PasswordHash, 'MANAGER', 'C29MGR', NULL, 'ACTIVE'),
        ('c29.warehouse', @PasswordHash, 'WAREHOUSE', 'C29WARE', NULL, 'ACTIVE'),
        ('c29.customer', @PasswordHash, 'CUSTOMER', NULL, 'C29CUST', 'ACTIVE');

      INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, MoTa, TrangThai)
      VALUES
        ('C29CAT', N'C29 Active Category', N'C29 integration fixture', 'ACTIVE'),
        ('C29OFFCAT', N'C29 Inactive Category', N'C29 integration fixture', 'INACTIVE');

      INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, MaVach, DonViTinh, GiaBan,
        MucTonToiThieu, MaLoai, TrangThai
      ) VALUES
        ('C29P001', N'C29 Alpha', 'C2900001', N'Chai', 20000, 1, 'C29CAT', 'ACTIVE'),
        ('C29P002', N'C29 Expired Only', 'C2900002', N'Goi', 15000, 1, 'C29CAT', 'ACTIVE'),
        ('C29P003', N'C29 Inactive Product', 'C2900003', N'Hop', 12000, 1, 'C29CAT', 'INACTIVE'),
        ('C29P004', N'C29 Blocked Only', 'C2900004', N'Lon', 17000, 1, 'C29CAT', 'ACTIVE'),
        ('C29P005', N'C29 No Expiry', 'C2900005', N'Cai', 9000, 1, 'C29CAT', 'ACTIVE'),
        ('C29P006', N'C29 Inactive Category Product', 'C2900006', N'Cai', 8000, 1, 'C29OFFCAT', 'ACTIVE');

      DECLARE @Today DATE = CONVERT(DATE, SYSDATETIME());
      INSERT INTO dbo.LO_HANG (
        MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
      ) VALUES
        ('C29LOT001', 'C29P001', 'C29-BATCH-1', DATEADD(DAY, -30, @Today), DATEADD(DAY, 30, @Today), 10000, 3, 'ACTIVE'),
        ('C29LOT002', 'C29P001', 'C29-BATCH-2', DATEADD(DAY, -20, @Today), DATEADD(DAY, 60, @Today), 11000, 5, 'ACTIVE'),
        ('C29LOT003', 'C29P002', 'C29-BATCH-3', DATEADD(DAY, -30, @Today), DATEADD(DAY, -1, @Today), 9000, 4, 'ACTIVE'),
        ('C29LOT004', 'C29P003', 'C29-BATCH-4', DATEADD(DAY, -10, @Today), DATEADD(DAY, 50, @Today), 7000, 4, 'ACTIVE'),
        ('C29LOT005', 'C29P004', 'C29-BATCH-5', DATEADD(DAY, -10, @Today), DATEADD(DAY, 50, @Today), 10000, 4, 'BLOCKED'),
        ('C29LOT006', 'C29P005', 'C29-BATCH-6', DATEADD(DAY, -10, @Today), NULL, 5000, 2, 'ACTIVE'),
        ('C29LOT007', 'C29P006', 'C29-BATCH-7', DATEADD(DAY, -10, @Today), DATEADD(DAY, 50, @Today), 5000, 2, 'ACTIVE');
    `,
    parameters: {
      PasswordHash: { type: sql.VarChar(255), value: passwordHash },
    },
  });

  const tokens = {};
  for (const role of ['cashier', 'manager', 'warehouse', 'customer']) {
    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: `c29.${role}`, password },
    });
    assert.equal(login.response.status, 200);
    tokens[role] = login.payload.data.accessToken;
  }

  let result = await requestJson(baseUrl, '/api/pos/shifts/current');
  assert.equal(result.response.status, 401);

  for (const role of ['manager', 'warehouse', 'customer']) {
    result = await requestJson(baseUrl, '/api/pos/shifts/current', { token: tokens[role] });
    assert.equal(result.response.status, 403);
    assert.equal(result.payload.error.code, 'FORBIDDEN');
  }

  result = await requestJson(baseUrl, '/api/pos/shifts/current', { token: tokens.cashier });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.shift, null);

  result = await requestJson(baseUrl, '/api/pos/products?search=C29', { token: tokens.cashier });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'SHIFT_REQUIRED');

  result = await requestJson(baseUrl, '/api/pos/shifts/open', {
    method: 'POST', token: tokens.cashier, body: { openingCash: -1 },
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'VALIDATION_ERROR');

  result = await requestJson(baseUrl, '/api/pos/shifts/open', {
    method: 'POST',
    token: tokens.cashier,
    body: { employeeId: 'C29MGR', openingCash: 500000 },
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'VALIDATION_ERROR');

  result = await requestJson(baseUrl, '/api/pos/shifts/open', {
    method: 'POST',
    token: tokens.cashier,
    body: { openingCash: 500000.5, note: 'Ca C29' },
  });
  assert.equal(result.response.status, 201);
  const openedShift = result.payload.data.shift;
  assert.equal(openedShift.employee.employeeId, 'C29CASH');
  assert.equal(openedShift.openingCash, 500000.5);
  assert.equal(openedShift.status, 'OPEN');
  assert.equal(openedShift.note, 'Ca C29');
  assert.match(openedShift.startedAt, /^\d{4}-\d{2}-\d{2}T/);

  result = await requestJson(baseUrl, '/api/pos/shifts/current', { token: tokens.cashier });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.shift.shiftId, openedShift.shiftId);
  assert.equal(result.payload.data.shift.status, 'OPEN');

  result = await requestJson(baseUrl, '/api/pos/shifts/open', {
    method: 'POST', token: tokens.cashier, body: { openingCash: 0 },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'SHIFT_ALREADY_OPEN');

  result = await requestJson(
    baseUrl,
    '/api/pos/products?page=1&pageSize=1&search=C29',
    { token: tokens.cashier },
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.pagination, {
    page: 1, pageSize: 1, totalItems: 2, totalPages: 2,
  });
  assert.equal(result.payload.data.items[0].productId, 'C29P001');
  assert.equal(result.payload.data.items[0].availableStock, 8);

  result = await requestJson(
    baseUrl,
    '/api/pos/products?page=2&pageSize=1&search=C29',
    { token: tokens.cashier },
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.items.map((item) => item.productId), ['C29P005']);
  assert.equal(result.payload.data.items[0].availableStock, 2);

  result = await requestJson(baseUrl, '/api/pos/products/barcode/C2900001', {
    token: tokens.cashier,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.product.productId, 'C29P001');
  assert.equal(result.payload.data.product.availableStock, 8);

  for (const barcode of ['C2900002', 'C2900003', 'C2900004', 'C2900006']) {
    result = await requestJson(baseUrl, `/api/pos/products/barcode/${barcode}`, {
      token: tokens.cashier,
    });
    assert.equal(result.response.status, 404);
    assert.equal(result.payload.error.code, 'PRODUCT_NOT_SELLABLE');
  }

  result = await requestJson(baseUrl, '/api/pos/products?status=ACTIVE', {
    token: tokens.cashier,
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'VALIDATION_ERROR');

  const persisted = await repository.query({
    text: `
      SELECT MaCa, MaNV, TienDauCa, TrangThai, GhiChu
      FROM dbo.CA_LAM_VIEC
      WHERE MaNV = 'C29CASH' AND TrangThai = 'OPEN'
    `,
  });
  assert.equal(persisted.recordset.length, 1);
  assert.equal(String(persisted.recordset[0].MaCa), openedShift.shiftId);
  assert.equal(persisted.recordset[0].MaNV, 'C29CASH');
  assert.equal(Number(persisted.recordset[0].TienDauCa), 500000.5);
  assert.equal(persisted.recordset[0].GhiChu, 'Ca C29');
});
