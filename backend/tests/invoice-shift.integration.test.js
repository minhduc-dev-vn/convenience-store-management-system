'use strict';

process.env.JWT_SECRET ||= 'c34-integration-test-secret-with-at-least-32-bytes';
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
        DELETE return_line
        FROM dbo.CHI_TIET_PHIEU_TRA AS return_line
        JOIN dbo.PHIEU_TRA AS return_header ON return_header.MaPT = return_line.MaPT
        WHERE return_header.MaHD LIKE 'C34%';
        DELETE FROM dbo.PHIEU_TRA WHERE MaHD LIKE 'C34%';
        DELETE FROM dbo.THANH_TOAN WHERE MaHD LIKE 'C34%';
        DELETE lot_output
        FROM dbo.CHI_TIET_XUAT_LO AS lot_output
        JOIN dbo.CHI_TIET_HOA_DON AS detail ON detail.MaCTHD = lot_output.MaCTHD
        WHERE detail.MaHD LIKE 'C34%';
        DELETE FROM dbo.CHI_TIET_HOA_DON WHERE MaHD LIKE 'C34%';
        DELETE FROM dbo.HOA_DON WHERE MaHD LIKE 'C34%';
        DELETE FROM dbo.CA_LAM_VIEC WHERE MaNV LIKE 'C34%';
        DELETE FROM dbo.LO_HANG WHERE MaLo LIKE 'C34%';
        DELETE FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C34%';
        DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai LIKE 'C34%';
        DELETE FROM dbo.TAI_KHOAN WHERE TenDangNhap LIKE 'c34.%';
        DELETE FROM dbo.KHACH_HANG WHERE MaKH LIKE 'C34%';
        DELETE FROM dbo.NHAN_VIEN WHERE MaNV LIKE 'C34%';
      `,
    });
  } finally {
    await closePool();
  }
}

after(cleanupTestRows);

integrationTest('invoice search/detail and close-shift reconciliation enforce C34', async (testContext) => {
  const baseUrl = await startServer(testContext);
  const repository = new BaseRepository();
  const sql = getSqlDriver(getDatabaseSettings().driver);
  await cleanupTestRows();

  const password = 'C34-role-pass';
  const passwordHash = await bcrypt.hash(password, 4);
  const fixture = await repository.query({
    text: `
      DECLARE @FixtureDate DATE = CONVERT(DATE, SYSDATETIME());
      DECLARE @FixtureTime DATETIME2(0) =
        DATEADD(HOUR, 12, CONVERT(DATETIME2(0), @FixtureDate));

      INSERT INTO dbo.NHAN_VIEN (
        MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai
      ) VALUES
        ('C34CASH1', N'C34 Cashier One', '0833400101', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE'),
        ('C34CASH2', N'C34 Cashier Two', '0833400102', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE'),
        ('C34MGR', N'C34 Manager', '0833400103', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE'),
        ('C34WARE', N'C34 Warehouse', '0833400104', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE');

      INSERT INTO dbo.KHACH_HANG (
        MaKH, HoTen, SDT, DiemTichLuy, NgayDangKy, TrangThai
      ) VALUES ('C34CUST', N'C34 Customer', '0833400105', 0, SYSDATETIME(), 'ACTIVE');

      INSERT INTO dbo.TAI_KHOAN (
        TenDangNhap, MatKhauHash, MaVaiTro, MaNV, MaKH, TrangThai
      ) VALUES
        ('c34.cashier1', @PasswordHash, 'CASHIER', 'C34CASH1', NULL, 'ACTIVE'),
        ('c34.cashier2', @PasswordHash, 'CASHIER', 'C34CASH2', NULL, 'ACTIVE'),
        ('c34.manager', @PasswordHash, 'MANAGER', 'C34MGR', NULL, 'ACTIVE'),
        ('c34.warehouse', @PasswordHash, 'WAREHOUSE', 'C34WARE', NULL, 'ACTIVE'),
        ('c34.customer', @PasswordHash, 'CUSTOMER', NULL, 'C34CUST', 'ACTIVE');

      INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, TrangThai)
      VALUES ('C34CAT', N'C34 Category', 'ACTIVE');
      INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, MaVach, DonViTinh, GiaBan, MucTonToiThieu, MaLoai, TrangThai
      ) VALUES ('C34P001', N'C34 Product', 'C3400001', N'Cai', 10000, 0, 'C34CAT', 'ACTIVE');
      INSERT INTO dbo.LO_HANG (
        MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
      ) VALUES (
        'C34LOT001', 'C34P001', 'C34-BATCH-1', DATEADD(DAY, -10, CONVERT(DATE, SYSDATETIME())),
        DATEADD(DAY, 30, CONVERT(DATE, SYSDATETIME())), 5000, 10, 'ACTIVE'
      );

      INSERT INTO dbo.CA_LAM_VIEC (MaNV, GioBatDau, TienDauCa, TrangThai, GhiChu)
      VALUES ('C34CASH1', DATEADD(HOUR, -2, SYSDATETIME()), 100000, 'OPEN', N'Ca C34');
      DECLARE @ShiftOne BIGINT = SCOPE_IDENTITY();
      INSERT INTO dbo.CA_LAM_VIEC (MaNV, GioBatDau, TienDauCa, TrangThai)
      VALUES ('C34CASH2', DATEADD(HOUR, -1, SYSDATETIME()), 50000, 'OPEN');
      DECLARE @ShiftTwo BIGINT = SCOPE_IDENTITY();

      INSERT INTO dbo.HOA_DON (
        MaHD, NgayLap, MaCa, MaKH, TongTienHang, TongGiamGia,
        TongThanhToan, DiemSuDung, DiemTichLuy, TrangThai, GhiChu
      ) VALUES
        ('C34PAID001', DATEADD(MINUTE, -90, @FixtureTime), @ShiftOne, 'C34CUST', 30000, 0, 30000, 0, 3, 'PAID', N'C34 cash sale'),
        ('C34CARD001', DATEADD(MINUTE, -60, @FixtureTime), @ShiftOne, NULL, 20000, 0, 20000, 0, 0, 'PAID', N'C34 card sale'),
        ('C34CANCEL1', DATEADD(MINUTE, -40, @FixtureTime), @ShiftOne, NULL, 0, 0, 0, 0, 0, 'CANCELLED', NULL),
        ('C34DRAFT01', DATEADD(MINUTE, -20, @FixtureTime), @ShiftOne, NULL, 0, 0, 0, 0, 0, 'DRAFT', NULL),
        ('C34OTHER01', DATEADD(MINUTE, -10, @FixtureTime), @ShiftTwo, NULL, 10000, 0, 10000, 0, 0, 'PAID', NULL);

      INSERT INTO dbo.CHI_TIET_HOA_DON (MaHD, MaSP, SoLuong, DonGiaBan, TienGiam)
      VALUES ('C34PAID001', 'C34P001', 3, 10000, 0);
      DECLARE @LineId BIGINT = SCOPE_IDENTITY();
      INSERT INTO dbo.CHI_TIET_XUAT_LO (MaCTHD, MaLo, SoLuong)
      VALUES (@LineId, 'C34LOT001', 3);

      INSERT INTO dbo.THANH_TOAN (MaHD, PhuongThuc, SoTien, TrangThai)
      VALUES
        ('C34PAID001', 'CASH', 30000, 'SUCCESS'),
        ('C34CARD001', 'CARD', 20000, 'SUCCESS'),
        ('C34OTHER01', 'CASH', 10000, 'SUCCESS');

      SELECT @ShiftOne AS ShiftOne, @ShiftTwo AS ShiftTwo,
        CONVERT(VARCHAR(10), @FixtureDate, 23) AS FixtureDate;
    `,
    parameters: {
      PasswordHash: { type: sql.VarChar(255), value: passwordHash },
    },
  });
  const shiftOne = String(fixture.recordset[0].ShiftOne);
  const shiftTwo = String(fixture.recordset[0].ShiftTwo);
  const fixtureDate = fixture.recordset[0].FixtureDate;

  const tokens = {};
  for (const role of ['cashier1', 'cashier2', 'manager', 'warehouse', 'customer']) {
    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: `c34.${role}`, password },
    });
    assert.equal(login.response.status, 200);
    tokens[role] = login.payload.data.accessToken;
  }

  let result = await requestJson(baseUrl, '/api/invoices');
  assert.equal(result.response.status, 401);
  for (const role of ['warehouse', 'customer']) {
    result = await requestJson(baseUrl, '/api/invoices', { token: tokens[role] });
    assert.equal(result.response.status, 403);
    assert.equal(result.payload.error.code, 'FORBIDDEN');
  }

  result = await requestJson(
    baseUrl,
    `/api/invoices?page=1&pageSize=2&cashierId=C34CASH1&from=${fixtureDate}&to=${fixtureDate}`,
    { token: tokens.manager },
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.pagination, {
    page: 1, pageSize: 2, totalItems: 4, totalPages: 2,
  });
  assert.equal(result.payload.data.items.every(
    (invoice) => invoice.cashier.employeeId === 'C34CASH1',
  ), true);

  result = await requestJson(baseUrl, '/api/invoices?invoiceId=C34PAID001', {
    token: tokens.cashier1,
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.items.map((invoice) => invoice.invoiceId), ['C34PAID001']);

  result = await requestJson(baseUrl, '/api/invoices/C34PAID001', {
    token: tokens.manager,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.invoice.items[0].quantity, 3);
  assert.equal(result.payload.data.invoice.items[0].quantityReturned, 0);
  assert.equal(result.payload.data.invoice.items[0].quantityReturnable, 3);
  assert.equal(result.payload.data.invoice.items[0].lotAllocations[0].lotId, 'C34LOT001');
  assert.equal(result.payload.data.invoice.payments[0].method, 'CASH');

  result = await requestJson(baseUrl, '/api/invoices/C34PAID001', {
    method: 'DELETE', token: tokens.manager,
  });
  assert.equal(result.response.status, 404);
  const persistedInvoice = await repository.query({
    text: `SELECT COUNT(*) AS InvoiceCount FROM dbo.HOA_DON WHERE MaHD = 'C34PAID001'`,
  });
  assert.equal(Number(persistedInvoice.recordset[0].InvoiceCount), 1);

  result = await requestJson(baseUrl, `/api/pos/shifts/${shiftOne}/reconciliation`, {
    token: tokens.cashier1,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.reconciliation.grossRevenue, 50000);
  assert.equal(result.payload.data.reconciliation.cashRevenue, 30000);
  assert.equal(result.payload.data.reconciliation.nonCashRevenue, 20000);
  assert.equal(result.payload.data.reconciliation.expectedCash, 130000);
  assert.equal(result.payload.data.reconciliation.unfinishedInvoiceCount, 1);

  result = await requestJson(baseUrl, `/api/pos/shifts/${shiftTwo}/reconciliation`, {
    token: tokens.cashier1,
  });
  assert.equal(result.response.status, 404);
  assert.equal(result.payload.error.code, 'SHIFT_NOT_FOUND');

  result = await requestJson(baseUrl, `/api/pos/shifts/${shiftOne}/close`, {
    method: 'POST', token: tokens.manager, body: { closingCash: 130000 },
  });
  assert.equal(result.response.status, 403);

  result = await requestJson(baseUrl, `/api/pos/shifts/${shiftOne}/close`, {
    method: 'POST', token: tokens.cashier1, body: { closingCash: 130000 },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'SHIFT_HAS_UNFINISHED_INVOICES');

  await repository.query({
    text: `UPDATE dbo.HOA_DON SET TrangThai = 'CANCELLED' WHERE MaHD = 'C34DRAFT01'`,
  });
  result = await requestJson(baseUrl, `/api/pos/shifts/${shiftOne}/close`, {
    method: 'POST',
    token: tokens.cashier1,
    body: { closingCash: 129000, note: 'Thiếu 1.000' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.reconciliation.status, 'CLOSED');
  assert.equal(result.payload.data.reconciliation.closingCash, 129000);
  assert.equal(result.payload.data.reconciliation.expectedCash, 130000);
  assert.equal(result.payload.data.reconciliation.difference, -1000);
  assert.match(result.payload.data.reconciliation.closedAt, /^\d{4}-\d{2}-\d{2}T/);

  result = await requestJson(baseUrl, `/api/pos/shifts/${shiftOne}/close`, {
    method: 'POST', token: tokens.cashier1, body: { closingCash: 129000 },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'SHIFT_ALREADY_CLOSED');

  result = await requestJson(baseUrl, '/api/pos/shifts/current', {
    token: tokens.cashier1,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.shift, null);
});
