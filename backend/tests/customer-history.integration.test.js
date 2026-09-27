'use strict';

process.env.JWT_SECRET ||= 'c09-integration-test-secret-with-at-least-32-bytes';
process.env.JWT_EXPIRES_IN ||= '15m';
process.env.BCRYPT_ROUNDS ||= '4';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const { after, test } = require('node:test');
const app = require('../src/app');
const { getDatabaseSettings } = require('../src/config/database.config');
const { getSqlDriver } = require('../src/config/database.driver');
const { closePool } = require('../src/config/database.pool');
const { BaseRepository } = require('../src/repositories/base.repository');

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === 'true' ? test : test.skip;
const TEST_PHONE_PREFIX = '08290';

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
  return { payload: await response.json(), response };
}

async function cleanupTestRows() {
  if (process.env.RUN_DB_INTEGRATION_TESTS !== 'true') return;

  try {
    const repository = new BaseRepository();
    await repository.query({
      text: `
        DELETE FROM dbo.CHI_TIET_HOA_DON WHERE MaHD LIKE 'C09%';
        DELETE FROM dbo.HOA_DON WHERE MaHD LIKE 'C09%';
        DELETE FROM dbo.CA_LAM_VIEC WHERE MaNV = 'C09CASH';

        DELETE account
        FROM dbo.TAI_KHOAN AS account
        JOIN dbo.KHACH_HANG AS customer ON customer.MaKH = account.MaKH
        WHERE customer.SDT LIKE '08290%';

        DELETE FROM dbo.KHACH_HANG WHERE SDT LIKE '08290%';
        DELETE FROM dbo.NHAN_VIEN WHERE MaNV = 'C09CASH';
        DELETE FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C09P%';
        DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'C09CAT';
      `,
    });
  } finally {
    await closePool();
  }
}

after(cleanupTestRows);

integrationTest('customer history, ownership, pagination, date filters and loyalty work end to end', async (testContext) => {
  const baseUrl = await startServer(testContext);
  const sql = getSqlDriver(getDatabaseSettings().driver);
  const repository = new BaseRepository();

  await cleanupTestRows();

  const registrations = [
    {
      fullName: 'C09 Customer A',
      phone: `${TEST_PHONE_PREFIX}00001`,
      email: 'c09.a@example.com',
      password: 'Customer-A-pass-09',
      passwordConfirmation: 'Customer-A-pass-09',
    },
    {
      fullName: 'C09 Customer B',
      phone: `${TEST_PHONE_PREFIX}00002`,
      email: 'c09.b@example.com',
      password: 'Customer-B-pass-09',
      passwordConfirmation: 'Customer-B-pass-09',
    },
  ];

  const registeredCustomers = [];
  for (const registration of registrations) {
    const result = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: registration,
    });
    assert.equal(result.response.status, 201);
    registeredCustomers.push(result.payload.data.customer.customerId);
  }
  const [customerAId, customerBId] = registeredCustomers;

  await repository.query({
    text: `
      UPDATE dbo.KHACH_HANG
      SET DiemTichLuy = CASE MaKH WHEN @CustomerAId THEN 37 ELSE 99 END,
          HangThanhVien = CASE MaKH WHEN @CustomerAId THEN 'SILVER' ELSE 'GOLD' END
      WHERE MaKH IN (@CustomerAId, @CustomerBId);

      INSERT INTO dbo.NHAN_VIEN (MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai)
      VALUES ('C09CASH', N'C09 Cashier', '0829010001', '2026-01-01', 0, 'ACTIVE');

      DECLARE @Shift TABLE (MaCa BIGINT);
      INSERT INTO dbo.CA_LAM_VIEC (MaNV, GioBatDau, GioKetThuc, TrangThai)
      OUTPUT inserted.MaCa INTO @Shift
      VALUES ('C09CASH', '2026-01-01T07:00:00', '2026-02-02T17:00:00', 'CLOSED');

      INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, TrangThai)
      VALUES ('C09CAT', N'C09 Category', 'ACTIVE');

      INSERT INTO dbo.SAN_PHAM (MaSP, TenSP, DonViTinh, GiaBan, MaLoai, TrangThai)
      VALUES
        ('C09P1', N'C09 Product One', N'Cái', 10000, 'C09CAT', 'ACTIVE'),
        ('C09P2', N'C09 Product Two', N'Chai', 20000, 'C09CAT', 'ACTIVE');

      DECLARE @ShiftId BIGINT = (SELECT TOP (1) MaCa FROM @Shift);
      INSERT INTO dbo.HOA_DON
        (MaHD, NgayLap, MaCa, MaKH, TongTienHang, TongGiamGia, TongThanhToan, TrangThai)
      VALUES
        ('C09A0001', '2026-01-05T09:00:00', @ShiftId, @CustomerAId, 10000, 0, 10000, 'PAID'),
        ('C09A0002', '2026-01-15T10:00:00', @ShiftId, @CustomerAId, 20000, 0, 20000, 'REFUNDED'),
        ('C09A0003', '2026-02-01T11:00:00', @ShiftId, @CustomerAId, 30000, 0, 30000, 'PAID'),
        ('C09A0004', '2026-01-20T12:00:00', @ShiftId, @CustomerAId, 10000, 0, 10000, 'DRAFT'),
        ('C09B0001', '2026-01-10T09:30:00', @ShiftId, @CustomerBId, 20000, 0, 20000, 'PAID');

      INSERT INTO dbo.CHI_TIET_HOA_DON
        (MaHD, MaSP, SoLuong, DonGiaBan, TienGiam)
      VALUES
        ('C09A0001', 'C09P1', 1, 10000, 0),
        ('C09A0002', 'C09P2', 1, 20000, 0),
        ('C09A0003', 'C09P1', 3, 10000, 0),
        ('C09A0004', 'C09P1', 1, 10000, 0),
        ('C09B0001', 'C09P2', 1, 20000, 0);
    `,
    parameters: {
      CustomerAId: { type: sql.VarChar(10), value: customerAId },
      CustomerBId: { type: sql.VarChar(10), value: customerBId },
    },
  });

  let result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: {
      identifier: registrations[0].email,
      password: registrations[0].password,
    },
  });
  assert.equal(result.response.status, 200);
  const customerAToken = result.payload.data.accessToken;

  result = await requestJson(
    baseUrl,
    '/api/customers/me/invoices?from=2026-01-01&to=2026-01-31&page=1&pageSize=1',
    { token: customerAToken },
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.pagination, {
    page: 1,
    pageSize: 1,
    totalItems: 2,
    totalPages: 2,
  });
  assert.equal(result.payload.data.items[0].invoiceId, 'C09A0002');
  assert.equal(result.payload.data.items[0].status, 'REFUNDED');

  result = await requestJson(
    baseUrl,
    '/api/customers/me/invoices?from=2026-01-01&to=2026-01-31&page=2&pageSize=1',
    { token: customerAToken },
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.items[0].invoiceId, 'C09A0001');

  result = await requestJson(baseUrl, '/api/customers/me/invoices/C09A0001', {
    token: customerAToken,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.invoiceId, 'C09A0001');
  assert.deepEqual(result.payload.data.items[0], {
    discountAmount: 0,
    lineTotal: 10000,
    productId: 'C09P1',
    productName: 'C09 Product One',
    quantity: 1,
    unitPrice: 10000,
  });
  assert.equal(Object.hasOwn(result.payload.data, 'inventory'), false);
  assert.equal(Object.hasOwn(result.payload.data.items[0], 'lot'), false);

  result = await requestJson(baseUrl, '/api/customers/me/invoices/C09B0001', {
    token: customerAToken,
  });
  assert.equal(result.response.status, 404);
  assert.equal(result.payload.error.code, 'INVOICE_NOT_FOUND');

  result = await requestJson(baseUrl, '/api/customers/me/invoices/C09A0004', {
    token: customerAToken,
  });
  assert.equal(result.response.status, 404);

  result = await requestJson(
    baseUrl,
    `/api/customers/me/invoices?customerId=${encodeURIComponent(customerBId)}`,
    { token: customerAToken },
  );
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'VALIDATION_ERROR');

  result = await requestJson(baseUrl, '/api/customers/me/loyalty', {
    token: customerAToken,
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data, {
    loyaltyPoints: 37,
    membershipTier: 'SILVER',
  });

  result = await requestJson(baseUrl, '/api/customers/me/loyalty', {
    method: 'PATCH',
    token: customerAToken,
    body: { loyaltyPoints: 999999 },
  });
  assert.equal(result.response.status, 404);

  const storedPoints = await repository.query({
    text: 'SELECT DiemTichLuy FROM dbo.KHACH_HANG WHERE MaKH = @CustomerId',
    parameters: {
      CustomerId: { type: sql.VarChar(10), value: customerAId },
    },
  });
  assert.equal(storedPoints.recordset[0].DiemTichLuy, 37);
});
