'use strict';

process.env.JWT_SECRET ||= 'c31-integration-test-secret-with-at-least-32-bytes';
process.env.JWT_EXPIRES_IN ||= '15m';
process.env.BCRYPT_ROUNDS ||= '4';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const { after, test } = require('node:test');
const bcrypt = require('bcrypt');
const app = require('../../src/app');
const { getDatabaseSettings } = require('../../src/config/database.config');
const { getSqlDriver } = require('../../src/config/database.driver');
const { closePool } = require('../../src/config/database.pool');
const { BaseRepository } = require('../../src/repositories/base.repository');

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
        DROP TRIGGER IF EXISTS dbo.trg_C31_ForcePaymentFailure;
        DELETE FROM dbo.THANH_TOAN WHERE MaHD LIKE 'C31%';
        DELETE lot_output
        FROM dbo.CHI_TIET_XUAT_LO AS lot_output
        JOIN dbo.CHI_TIET_HOA_DON AS detail ON detail.MaCTHD = lot_output.MaCTHD
        WHERE detail.MaHD LIKE 'C31%';
        DELETE FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu LIKE 'C31%';
        DELETE FROM dbo.CHI_TIET_HOA_DON WHERE MaHD LIKE 'C31%';
        DELETE FROM dbo.HOA_DON WHERE MaHD LIKE 'C31%';
        DELETE FROM dbo.KHUYEN_MAI_SAN_PHAM WHERE MaKM LIKE 'C31%';
        DELETE FROM dbo.KHUYEN_MAI WHERE MaKM LIKE 'C31%';
        DELETE FROM dbo.CA_LAM_VIEC WHERE MaNV LIKE 'C31%';
        DELETE FROM dbo.LO_HANG WHERE MaLo LIKE 'C31%';
        DELETE FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C31%';
        DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai LIKE 'C31%';
        DELETE FROM dbo.TAI_KHOAN WHERE TenDangNhap LIKE 'c31.%';
        DELETE FROM dbo.KHACH_HANG WHERE MaKH LIKE 'C31%';
        DELETE FROM dbo.NHAN_VIEN WHERE MaNV LIKE 'C31%';
      `,
    });
  } finally {
    await closePool();
  }
}

after(cleanupTestRows);

integrationTest('checkout finalizes FEFO sale atomically and makes invoice id idempotent', async (testContext) => {
  const baseUrl = await startServer(testContext);
  const sql = getSqlDriver(getDatabaseSettings().driver);
  const repository = new BaseRepository();
  await cleanupTestRows();

  const password = 'C31-role-pass';
  const passwordHash = await bcrypt.hash(password, 4);
  await repository.query({
    text: `
      INSERT INTO dbo.NHAN_VIEN (
        MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai
      ) VALUES
        ('C31CASH', N'C31 Cashier', '0833100101', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE'),
        ('C31OTHER', N'C31 Other Cashier', '0833100102', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE'),
        ('C31MGR', N'C31 Manager', '0833100103', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE');

      INSERT INTO dbo.KHACH_HANG (
        MaKH, HoTen, SDT, DiemTichLuy, HangThanhVien, NgayDangKy, TrangThai
      ) VALUES
        ('C31CUST', N'C31 Member', '0833100104', 100, 'SILVER', SYSDATETIME(), 'ACTIVE');

      INSERT INTO dbo.TAI_KHOAN (
        TenDangNhap, MatKhauHash, MaVaiTro, MaNV, MaKH, TrangThai
      ) VALUES
        ('c31.cashier', @PasswordHash, 'CASHIER', 'C31CASH', NULL, 'ACTIVE'),
        ('c31.other', @PasswordHash, 'CASHIER', 'C31OTHER', NULL, 'ACTIVE'),
        ('c31.manager', @PasswordHash, 'MANAGER', 'C31MGR', NULL, 'ACTIVE');

      INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, MoTa, TrangThai)
      VALUES ('C31CAT', N'C31 Category', N'C31 checkout fixture', 'ACTIVE');

      INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, MaVach, DonViTinh, GiaBan,
        MucTonToiThieu, MaLoai, TrangThai
      ) VALUES
        ('C31P001', N'C31 Alpha', 'C3100001', N'Chai', 10000, 1, 'C31CAT', 'ACTIVE'),
        ('C31P002', N'C31 Beta', 'C3100002', N'Hop', 20000, 1, 'C31CAT', 'ACTIVE'),
        ('C31P003', N'C31 Rollback', 'C3100003', N'Cai', 15000, 1, 'C31CAT', 'ACTIVE');

      DECLARE @Today DATE = CONVERT(DATE, SYSDATETIME());
      INSERT INTO dbo.LO_HANG (
        MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
      ) VALUES
        ('C31LOTEXP', 'C31P001', 'C31-EXPIRED', DATEADD(DAY, -60, @Today), DATEADD(DAY, -1, @Today), 5000, 100, 'ACTIVE'),
        ('C31LOTNEAR', 'C31P001', 'C31-NEAR', DATEADD(DAY, -20, @Today), DATEADD(DAY, 10, @Today), 6000, 2, 'ACTIVE'),
        ('C31LOTLATE', 'C31P001', 'C31-LATE', DATEADD(DAY, -10, @Today), DATEADD(DAY, 30, @Today), 6500, 3, 'ACTIVE'),
        ('C31LOTBETA', 'C31P002', 'C31-BETA', DATEADD(DAY, -10, @Today), NULL, 12000, 2, 'ACTIVE'),
        ('C31LOTROLL', 'C31P003', 'C31-ROLLBACK', DATEADD(DAY, -10, @Today), DATEADD(DAY, 20, @Today), 8000, 2, 'ACTIVE');

      DECLARE @Now DATETIME2(0) = SYSDATETIME();
      INSERT INTO dbo.KHUYEN_MAI (
        MaKM, TenKM, LoaiKM, GiaTri, GiaTriDonToiThieu,
        MucGiamToiDa, NgayBatDau, NgayKetThuc, TrangThai
      ) VALUES (
        'C31PROMO', N'C31 Promotion', 'PERCENT', 10, 0,
        5000, DATEADD(DAY, -1, @Now), DATEADD(DAY, 1, @Now), 'ACTIVE'
      );

      INSERT INTO dbo.KHUYEN_MAI_SAN_PHAM (MaKM, MaSP) VALUES
        ('C31PROMO', 'C31P001'),
        ('C31PROMO', 'C31P002');
    `,
    parameters: {
      PasswordHash: { type: sql.VarChar(255), value: passwordHash },
    },
  });

  const tokens = {};
  for (const role of ['cashier', 'other', 'manager']) {
    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: `c31.${role}`, password },
    });
    assert.equal(login.response.status, 200);
    tokens[role] = login.payload.data.accessToken;
  }

  const checkoutBody = {
    customerPhone: '0833100104',
    invoiceId: 'C31INV0001',
    items: [
      { productId: 'C31P001', quantity: 4 },
      { productId: 'C31P002', quantity: 1 },
    ],
    note: 'C31 persisted receipt',
    payment: {
      amount: 55000,
      externalTransactionId: 'C31-GATEWAY-001',
      method: 'CARD',
    },
    promotionId: 'C31PROMO',
  };

  let result = await requestJson(baseUrl, '/api/pos/checkouts', {
    method: 'POST', body: checkoutBody,
  });
  assert.equal(result.response.status, 401);

  result = await requestJson(baseUrl, '/api/pos/checkouts', {
    method: 'POST', token: tokens.manager, body: checkoutBody,
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.error.code, 'FORBIDDEN');

  result = await requestJson(baseUrl, '/api/pos/checkouts', {
    method: 'POST', token: tokens.cashier, body: checkoutBody,
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'SHIFT_REQUIRED');

  result = await requestJson(baseUrl, '/api/pos/shifts/open', {
    method: 'POST', token: tokens.cashier, body: { openingCash: 300000 },
  });
  assert.equal(result.response.status, 201);

  result = await requestJson(baseUrl, '/api/pos/checkouts', {
    method: 'POST',
    token: tokens.cashier,
    body: { ...checkoutBody, pointsToRedeem: 10 },
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'VALIDATION_ERROR');

  result = await requestJson(baseUrl, '/api/pos/checkouts', {
    method: 'POST',
    token: tokens.cashier,
    body: {
      ...checkoutBody,
      invoiceId: 'C31PAY0001',
      payment: { ...checkoutBody.payment, amount: 1 },
    },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'PAYMENT_AMOUNT_MISMATCH');

  result = await requestJson(baseUrl, '/api/pos/checkouts', {
    method: 'POST',
    token: tokens.cashier,
    body: { ...checkoutBody, invoiceId: 'C31PROMOERR', promotionId: 'C31MISSING' },
  });
  assert.equal(result.response.status, 404);
  assert.equal(result.payload.error.code, 'PROMOTION_NOT_FOUND');

  const concurrent = await Promise.all([
    requestJson(baseUrl, '/api/pos/checkouts', {
      method: 'POST', token: tokens.cashier, body: checkoutBody,
    }),
    requestJson(baseUrl, '/api/pos/checkouts', {
      method: 'POST', token: tokens.cashier, body: checkoutBody,
    }),
  ]);
  assert.deepEqual(
    concurrent.map((entry) => entry.response.status).sort(),
    [200, 201],
  );
  assert.deepEqual(
    concurrent.map((entry) => entry.payload.data.idempotentReplay).sort(),
    [false, true],
  );

  const created = concurrent.find((entry) => entry.response.status === 201).payload.data;
  assert.equal(created.receipt.invoiceId, 'C31INV0001');
  assert.equal(created.receipt.status, 'PAID');
  assert.deepEqual(created.receipt.totals, {
    subtotal: 60000,
    totalAmount: 55000,
    totalDiscount: 5000,
  });
  assert.deepEqual(created.receipt.loyalty, { pointsEarned: 5, pointsUsed: 0 });
  assert.equal(created.receipt.payment.method, 'CARD');
  assert.equal(created.receipt.payment.amount, 55000);
  assert.equal(created.receipt.payment.status, 'SUCCESS');
  assert.equal(created.receipt.payment.externalTransactionId, 'C31-GATEWAY-001');
  assert.deepEqual(
    created.receipt.items.map((item) => ({
      discountAmount: item.discountAmount,
      lineTotal: item.lineTotal,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    [
      {
        discountAmount: 3333.33,
        lineTotal: 36666.67,
        productId: 'C31P001',
        quantity: 4,
        unitPrice: 10000,
      },
      {
        discountAmount: 1666.67,
        lineTotal: 18333.33,
        productId: 'C31P002',
        quantity: 1,
        unitPrice: 20000,
      },
    ],
  );

  result = await requestJson(baseUrl, '/api/pos/checkouts', {
    method: 'POST', token: tokens.cashier, body: checkoutBody,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.idempotentReplay, true);

  result = await requestJson(baseUrl, '/api/pos/checkouts', {
    method: 'POST',
    token: tokens.cashier,
    body: { ...checkoutBody, note: 'different request' },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'CHECKOUT_ID_CONFLICT');

  result = await requestJson(baseUrl, '/api/pos/invoices/C31INV0001', {
    token: tokens.cashier,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.receipt.invoiceId, 'C31INV0001');

  result = await requestJson(baseUrl, '/api/pos/invoices/C31INV0001', {
    token: tokens.other,
  });
  assert.equal(result.response.status, 404);
  assert.equal(result.payload.error.code, 'INVOICE_NOT_FOUND');

  result = await requestJson(baseUrl, '/api/pos/invoices/C31INV0001', {
    token: tokens.manager,
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.error.code, 'FORBIDDEN');

  result = await requestJson(baseUrl, '/api/pos/checkouts', {
    method: 'POST',
    token: tokens.cashier,
    body: {
      invoiceId: 'C31STOCK01',
      items: [{ productId: 'C31P001', quantity: 2 }],
      payment: { amount: 20000, method: 'CASH' },
    },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'INSUFFICIENT_STOCK');

  const persisted = await repository.query({
    text: `
      SELECT MaLo, SoLuongTon
      FROM dbo.LO_HANG
      WHERE MaLo IN ('C31LOTEXP', 'C31LOTNEAR', 'C31LOTLATE', 'C31LOTBETA')
      ORDER BY MaLo;
      SELECT COUNT(*) AS InvoiceCount FROM dbo.HOA_DON WHERE MaHD = 'C31INV0001';
      SELECT COUNT(*) AS PaymentCount FROM dbo.THANH_TOAN WHERE MaHD = 'C31INV0001';
      SELECT COUNT(*) AS OutputCount
      FROM dbo.CHI_TIET_XUAT_LO AS lot_output
      JOIN dbo.CHI_TIET_HOA_DON AS detail ON detail.MaCTHD = lot_output.MaCTHD
      WHERE detail.MaHD = 'C31INV0001';
      SELECT COUNT(*) AS StockTransactionCount
      FROM dbo.GIAO_DICH_KHO
      WHERE MaThamChieu = 'C31INV0001' AND LoaiGiaoDich = 'SALE';
      SELECT DiemTichLuy FROM dbo.KHACH_HANG WHERE MaKH = 'C31CUST';
    `,
  });
  assert.deepEqual(
    persisted.recordsets[0].map((row) => ({ lotId: row.MaLo, stock: row.SoLuongTon })),
    [
      { lotId: 'C31LOTBETA', stock: 1 },
      { lotId: 'C31LOTEXP', stock: 100 },
      { lotId: 'C31LOTLATE', stock: 1 },
      { lotId: 'C31LOTNEAR', stock: 0 },
    ],
  );
  assert.equal(Number(persisted.recordsets[1][0].InvoiceCount), 1);
  assert.equal(Number(persisted.recordsets[2][0].PaymentCount), 1);
  assert.equal(Number(persisted.recordsets[3][0].OutputCount), 3);
  assert.equal(Number(persisted.recordsets[4][0].StockTransactionCount), 3);
  assert.equal(persisted.recordsets[5][0].DiemTichLuy, 105);

  await repository.query({
    text: `
      CREATE TRIGGER dbo.trg_C31_ForcePaymentFailure
      ON dbo.THANH_TOAN
      AFTER INSERT
      AS
      BEGIN
        SET NOCOUNT ON;
        THROW 51991, 'C31 forced payment failure containing internal test detail.', 1;
      END;
    `,
  });

  result = await requestJson(baseUrl, '/api/pos/checkouts', {
    method: 'POST',
    token: tokens.cashier,
    body: {
      invoiceId: 'C31ROLL001',
      items: [{ productId: 'C31P003', quantity: 1 }],
      payment: { amount: 15000, method: 'EWALLET' },
    },
  });
  assert.equal(result.response.status, 500);
  assert.equal(result.payload.error.code, 'INTERNAL_SERVER_ERROR');
  assert.equal(result.payload.error.message, 'An unexpected error occurred');
  assert.doesNotMatch(JSON.stringify(result.payload), /internal test detail/i);

  await repository.query({ text: 'DROP TRIGGER IF EXISTS dbo.trg_C31_ForcePaymentFailure;' });
  const rollback = await repository.query({
    text: `
      SELECT COUNT(*) AS InvoiceCount FROM dbo.HOA_DON WHERE MaHD = 'C31ROLL001';
      SELECT COUNT(*) AS PaymentCount FROM dbo.THANH_TOAN WHERE MaHD = 'C31ROLL001';
      SELECT COUNT(*) AS OutputCount
      FROM dbo.CHI_TIET_XUAT_LO AS lot_output
      JOIN dbo.CHI_TIET_HOA_DON AS detail ON detail.MaCTHD = lot_output.MaCTHD
      WHERE detail.MaHD = 'C31ROLL001';
      SELECT COUNT(*) AS StockTransactionCount
      FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'C31ROLL001';
      SELECT SoLuongTon FROM dbo.LO_HANG WHERE MaLo = 'C31LOTROLL';
      SELECT DiemTichLuy FROM dbo.KHACH_HANG WHERE MaKH = 'C31CUST';
    `,
  });
  assert.equal(Number(rollback.recordsets[0][0].InvoiceCount), 0);
  assert.equal(Number(rollback.recordsets[1][0].PaymentCount), 0);
  assert.equal(Number(rollback.recordsets[2][0].OutputCount), 0);
  assert.equal(Number(rollback.recordsets[3][0].StockTransactionCount), 0);
  assert.equal(rollback.recordsets[4][0].SoLuongTon, 2);
  assert.equal(rollback.recordsets[5][0].DiemTichLuy, 105);
});
