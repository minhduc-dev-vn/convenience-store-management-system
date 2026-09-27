'use strict';

process.env.JWT_SECRET ||= 'c13-integration-test-secret-with-at-least-32-bytes';
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
const TEST_PHONE_PREFIX = '08213';

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
        WHERE actor.TenDangNhap LIKE 'c13.%'
           OR audit_log.MaBanGhi IN (
             SELECT CONVERT(VARCHAR(100), account.MaTK)
             FROM dbo.TAI_KHOAN AS account
             LEFT JOIN dbo.KHACH_HANG AS customer ON customer.MaKH = account.MaKH
             WHERE account.TenDangNhap LIKE 'c13.%'
                OR customer.SDT LIKE '08213%'
           );

        DELETE FROM dbo.CHI_TIET_HOA_DON WHERE MaHD LIKE 'C13%';
        DELETE FROM dbo.HOA_DON WHERE MaHD LIKE 'C13%';
        DELETE FROM dbo.CA_LAM_VIEC WHERE MaNV = 'C13CASH';

        DELETE account
        FROM dbo.TAI_KHOAN AS account
        LEFT JOIN dbo.KHACH_HANG AS customer ON customer.MaKH = account.MaKH
        WHERE account.TenDangNhap LIKE 'c13.%'
           OR customer.SDT LIKE '08213%';

        DELETE FROM dbo.KHACH_HANG WHERE SDT LIKE '08213%';
        DELETE FROM dbo.NHAN_VIEN WHERE MaNV IN ('C13MGR', 'C13CASH');
      `,
    });
  } finally {
    await closePool();
  }
}

after(cleanupTestRows);

integrationTest('manager customer member API enforces RBAC, history and audited account lock', async (testContext) => {
  const baseUrl = await startServer(testContext);
  const sql = getSqlDriver(getDatabaseSettings().driver);
  const repository = new BaseRepository();
  await cleanupTestRows();

  const managerPassword = 'C13-manager-pass';
  const cashierPassword = 'C13-cashier-pass';
  const [managerHash, cashierHash] = await Promise.all([
    bcrypt.hash(managerPassword, 4),
    bcrypt.hash(cashierPassword, 4),
  ]);
  await repository.query({
    text: `
      INSERT INTO dbo.NHAN_VIEN (MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai)
      VALUES
        ('C13MGR', N'C13 Manager', '0821310001', '2026-01-01', 0, 'ACTIVE'),
        ('C13CASH', N'C13 Cashier', '0821310002', '2026-01-01', 0, 'ACTIVE');

      INSERT INTO dbo.TAI_KHOAN (TenDangNhap, MatKhauHash, MaVaiTro, MaNV, TrangThai)
      VALUES
        ('c13.manager', @ManagerHash, 'MANAGER', 'C13MGR', 'ACTIVE'),
        ('c13.cashier', @CashierHash, 'CASHIER', 'C13CASH', 'ACTIVE');
    `,
    parameters: {
      CashierHash: { type: sql.VarChar(255), value: cashierHash },
      ManagerHash: { type: sql.VarChar(255), value: managerHash },
    },
  });

  let result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST', body: { identifier: 'c13.manager', password: managerPassword },
  });
  assert.equal(result.response.status, 200);
  const managerToken = result.payload.data.accessToken;

  result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST', body: { identifier: 'c13.cashier', password: cashierPassword },
  });
  assert.equal(result.response.status, 200);
  const cashierToken = result.payload.data.accessToken;

  const registrations = [
    {
      fullName: 'C13 Gold Member',
      phone: `${TEST_PHONE_PREFIX}00001`,
      email: 'c13.gold@example.test',
      password: 'C13-customer-pass',
      passwordConfirmation: 'C13-customer-pass',
    },
    {
      fullName: 'C13 Silver Member',
      phone: `${TEST_PHONE_PREFIX}00002`,
      email: 'c13.silver@example.test',
      password: 'C13-customer-two-pass',
      passwordConfirmation: 'C13-customer-two-pass',
    },
  ];
  const customerIds = [];
  for (const registration of registrations) {
    result = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST', body: registration,
    });
    assert.equal(result.response.status, 201);
    customerIds.push(result.payload.data.customer.customerId);
  }
  const [goldCustomerId, silverCustomerId] = customerIds;

  await repository.query({
    text: `
      UPDATE dbo.KHACH_HANG
      SET DiemTichLuy = CASE MaKH WHEN @GoldCustomerId THEN 850 ELSE 120 END,
          HangThanhVien = CASE MaKH WHEN @GoldCustomerId THEN 'GOLD' ELSE 'SILVER' END
      WHERE MaKH IN (@GoldCustomerId, @SilverCustomerId);

      DECLARE @Shift TABLE (MaCa BIGINT);
      INSERT INTO dbo.CA_LAM_VIEC (MaNV, GioBatDau, GioKetThuc, TrangThai)
      OUTPUT inserted.MaCa INTO @Shift
      VALUES ('C13CASH', '2026-09-01T07:00:00', '2026-09-30T17:00:00', 'CLOSED');

      DECLARE @ShiftId BIGINT = (SELECT TOP (1) MaCa FROM @Shift);
      INSERT INTO dbo.HOA_DON
        (MaHD, NgayLap, MaCa, MaKH, TongTienHang, TongGiamGia, TongThanhToan, TrangThai)
      VALUES
        ('C13HD001', '2026-09-10T09:00:00', @ShiftId, @GoldCustomerId, 20000, 0, 20000, 'PAID'),
        ('C13HD002', '2026-09-20T10:00:00', @ShiftId, @GoldCustomerId, 10000, 0, 10000, 'REFUNDED'),
        ('C13HD003', '2026-09-21T11:00:00', @ShiftId, @GoldCustomerId, 10000, 0, 10000, 'DRAFT'),
        ('C13HD004', '2026-09-22T12:00:00', @ShiftId, @SilverCustomerId, 10000, 0, 10000, 'PAID');

      INSERT INTO dbo.CHI_TIET_HOA_DON (MaHD, MaSP, SoLuong, DonGiaBan, TienGiam)
      VALUES
        ('C13HD001', 'SPDEV001', 2, 10000, 0),
        ('C13HD002', 'SPDEV001', 1, 10000, 0),
        ('C13HD003', 'SPDEV001', 1, 10000, 0),
        ('C13HD004', 'SPDEV001', 1, 10000, 0);
    `,
    parameters: {
      GoldCustomerId: { type: sql.VarChar(10), value: goldCustomerId },
      SilverCustomerId: { type: sql.VarChar(10), value: silverCustomerId },
    },
  });

  result = await requestJson(baseUrl, '/api/admin/customers', { token: cashierToken });
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.error.code, 'FORBIDDEN');

  result = await requestJson(
    baseUrl,
    '/api/admin/customers?page=1&pageSize=1&search=c13.gold&membershipTier=GOLD&status=ACTIVE',
    { token: managerToken },
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.pagination, {
    page: 1, pageSize: 1, totalItems: 1, totalPages: 1,
  });
  assert.equal(result.payload.data.items[0].customerId, goldCustomerId);
  assert.equal(result.payload.data.items[0].loyaltyPoints, 850);
  assert.equal(result.payload.data.items[0].account.status, 'ACTIVE');
  assert.equal(JSON.stringify(result.payload.data).toLowerCase().includes('password'), false);

  result = await requestJson(baseUrl, `/api/admin/customers/${goldCustomerId}`, {
    token: managerToken,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.membershipTier, 'GOLD');
  assert.equal(result.payload.data.account.role, 'CUSTOMER');

  result = await requestJson(
    baseUrl,
    `/api/admin/customers/${goldCustomerId}/invoices?from=2026-09-01&to=2026-09-30&page=1&pageSize=1`,
    { token: managerToken },
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.pagination, {
    page: 1, pageSize: 1, totalItems: 2, totalPages: 2,
  });
  assert.equal(result.payload.data.items[0].invoiceId, 'C13HD002');

  result = await requestJson(
    baseUrl,
    `/api/admin/customers/${goldCustomerId}/invoices/C13HD001`,
    { token: managerToken },
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.invoiceId, 'C13HD001');
  assert.equal(result.payload.data.items[0].productId, 'SPDEV001');
  assert.equal(Object.hasOwn(result.payload.data.items[0], 'lot'), false);

  result = await requestJson(
    baseUrl,
    `/api/admin/customers/${goldCustomerId}/invoices/C13HD004`,
    { token: managerToken },
  );
  assert.equal(result.response.status, 404);
  assert.equal(result.payload.error.code, 'INVOICE_NOT_FOUND');

  result = await requestJson(baseUrl, `/api/admin/customers/${goldCustomerId}`, {
    method: 'PATCH', token: managerToken, body: { loyaltyPoints: 999999 },
  });
  assert.equal(result.response.status, 404);

  result = await requestJson(
    baseUrl,
    `/api/admin/customers/${goldCustomerId}/account/status`,
    { method: 'PATCH', token: managerToken, body: { status: 'LOCKED' } },
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.owner.type, 'CUSTOMER');
  assert.equal(result.payload.data.status, 'LOCKED');
  const customerAccountId = result.payload.data.accountId;

  result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { identifier: registrations[0].phone, password: registrations[0].password },
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.error.code, 'ACCOUNT_LOCKED');

  result = await requestJson(
    baseUrl,
    `/api/admin/customers/${goldCustomerId}/account/status`,
    { method: 'PATCH', token: managerToken, body: { status: 'ACTIVE' } },
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.status, 'ACTIVE');

  result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { identifier: registrations[0].phone, password: registrations[0].password },
  });
  assert.equal(result.response.status, 200);

  const auditResult = await repository.query({
    text: `
      SELECT HanhDong, TenBang, MaBanGhi, DuLieuCu, DuLieuMoi
      FROM dbo.NHAT_KY_HE_THONG
      WHERE MaTK = (SELECT MaTK FROM dbo.TAI_KHOAN WHERE TenDangNhap = 'c13.manager')
        AND MaBanGhi = @CustomerAccountId
        AND HanhDong IN ('ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED')
    `,
    parameters: {
      CustomerAccountId: { type: sql.VarChar(100), value: String(customerAccountId) },
    },
  });
  assert.deepEqual(
    new Set(auditResult.recordset.map((row) => row.HanhDong)),
    new Set(['ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED']),
  );
  const auditPayload = JSON.stringify(auditResult.recordset).toLowerCase();
  assert.equal(auditPayload.includes('password'), false);
  assert.equal(auditPayload.includes('token'), false);
});
