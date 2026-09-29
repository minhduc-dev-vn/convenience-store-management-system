'use strict';

process.env.JWT_SECRET ||= 'c30-integration-test-secret-with-at-least-32-bytes';
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
        DELETE FROM dbo.KHUYEN_MAI_SAN_PHAM WHERE MaKM LIKE 'C30%';
        DELETE FROM dbo.KHUYEN_MAI WHERE MaKM LIKE 'C30%';
        DELETE FROM dbo.CA_LAM_VIEC WHERE MaNV IN ('C30CASH', 'C30MGR');
        DELETE FROM dbo.LO_HANG WHERE MaLo LIKE 'C30%';
        DELETE FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C30%';
        DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai LIKE 'C30%';
        DELETE FROM dbo.TAI_KHOAN WHERE TenDangNhap LIKE 'c30.%';
        DELETE FROM dbo.KHACH_HANG WHERE MaKH IN ('C30CUST', 'C30OFF');
        DELETE FROM dbo.NHAN_VIEN WHERE MaNV IN ('C30CASH', 'C30MGR');
      `,
    });
  } finally {
    await closePool();
  }
}

after(cleanupTestRows);

integrationTest('invoice quote uses authoritative prices, promotion rules and no sale mutation', async (testContext) => {
  const baseUrl = await startServer(testContext);
  const sql = getSqlDriver(getDatabaseSettings().driver);
  const repository = new BaseRepository();
  await cleanupTestRows();

  const password = 'C30-role-pass';
  const passwordHash = await bcrypt.hash(password, 4);
  await repository.query({
    text: `
      INSERT INTO dbo.NHAN_VIEN (
        MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai
      ) VALUES
        ('C30CASH', N'C30 Cashier', '0833000101', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE'),
        ('C30MGR', N'C30 Manager', '0833000102', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE');

      INSERT INTO dbo.KHACH_HANG (
        MaKH, HoTen, SDT, DiemTichLuy, HangThanhVien, NgayDangKy, TrangThai
      ) VALUES
        ('C30CUST', N'C30 Active Member', '0833000103', 125, 'SILVER', SYSDATETIME(), 'ACTIVE'),
        ('C30OFF', N'C30 Inactive Member', '0833000104', 50, 'BRONZE', SYSDATETIME(), 'INACTIVE');

      INSERT INTO dbo.TAI_KHOAN (
        TenDangNhap, MatKhauHash, MaVaiTro, MaNV, MaKH, TrangThai
      ) VALUES
        ('c30.cashier', @PasswordHash, 'CASHIER', 'C30CASH', NULL, 'ACTIVE'),
        ('c30.manager', @PasswordHash, 'MANAGER', 'C30MGR', NULL, 'ACTIVE'),
        ('c30.customer', @PasswordHash, 'CUSTOMER', NULL, 'C30CUST', 'ACTIVE');

      INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, MoTa, TrangThai)
      VALUES ('C30CAT', N'C30 Category', N'C30 quote fixture', 'ACTIVE');

      INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, MaVach, DonViTinh, GiaBan,
        MucTonToiThieu, MaLoai, TrangThai
      ) VALUES
        ('C30P001', N'C30 Alpha', 'C3000001', N'Chai', 10000, 1, 'C30CAT', 'ACTIVE'),
        ('C30P002', N'C30 Beta', 'C3000002', N'Hop', 20000, 1, 'C30CAT', 'ACTIVE'),
        ('C30P003', N'C30 Inactive', 'C3000003', N'Cai', 15000, 1, 'C30CAT', 'INACTIVE'),
        ('C30P004', N'C30 Expired Stock', 'C3000004', N'Goi', 12000, 1, 'C30CAT', 'ACTIVE');

      DECLARE @Today DATE = CONVERT(DATE, SYSDATETIME());
      INSERT INTO dbo.LO_HANG (
        MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
      ) VALUES
        ('C30LOT001', 'C30P001', 'C30-BATCH-1', DATEADD(DAY, -30, @Today), DATEADD(DAY, 30, @Today), 6000, 4, 'ACTIVE'),
        ('C30LOT002', 'C30P001', 'C30-BATCH-2', DATEADD(DAY, -60, @Today), DATEADD(DAY, -1, @Today), 5000, 100, 'ACTIVE'),
        ('C30LOT003', 'C30P002', 'C30-BATCH-3', DATEADD(DAY, -10, @Today), NULL, 12000, 5, 'ACTIVE'),
        ('C30LOT004', 'C30P003', 'C30-BATCH-4', DATEADD(DAY, -10, @Today), DATEADD(DAY, 20, @Today), 8000, 5, 'ACTIVE'),
        ('C30LOT005', 'C30P004', 'C30-BATCH-5', DATEADD(DAY, -20, @Today), DATEADD(DAY, -1, @Today), 7000, 5, 'ACTIVE');

      DECLARE @Now DATETIME2(0) = SYSDATETIME();
      INSERT INTO dbo.KHUYEN_MAI (
        MaKM, TenKM, LoaiKM, GiaTri, GiaTriDonToiThieu,
        MucGiamToiDa, NgayBatDau, NgayKetThuc, TrangThai
      ) VALUES
        ('C30VALID', N'C30 Valid', 'PERCENT', 10, 0, 4000, DATEADD(DAY, -1, @Now), DATEADD(DAY, 1, @Now), 'ACTIVE'),
        ('C30EXPIRE', N'C30 Expired', 'PERCENT', 10, 0, 4000, DATEADD(DAY, -10, @Now), DATEADD(DAY, -1, @Now), 'ACTIVE'),
        ('C30MIN', N'C30 Minimum', 'PERCENT', 10, 100000, 4000, DATEADD(DAY, -1, @Now), DATEADD(DAY, 1, @Now), 'ACTIVE'),
        ('C30WRONG', N'C30 Wrong Product', 'AMOUNT', 5000, 0, NULL, DATEADD(DAY, -1, @Now), DATEADD(DAY, 1, @Now), 'ACTIVE'),
        ('C30INACT', N'C30 Inactive', 'PERCENT', 10, 0, 4000, DATEADD(DAY, -1, @Now), DATEADD(DAY, 1, @Now), 'INACTIVE');

      INSERT INTO dbo.KHUYEN_MAI_SAN_PHAM (MaKM, MaSP) VALUES
        ('C30VALID', 'C30P001'),
        ('C30VALID', 'C30P002'),
        ('C30EXPIRE', 'C30P001'),
        ('C30MIN', 'C30P001'),
        ('C30WRONG', 'C30P002'),
        ('C30INACT', 'C30P001');
    `,
    parameters: {
      PasswordHash: { type: sql.VarChar(255), value: passwordHash },
    },
  });

  const tokens = {};
  for (const role of ['cashier', 'manager', 'customer']) {
    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: `c30.${role}`, password },
    });
    assert.equal(login.response.status, 200);
    tokens[role] = login.payload.data.accessToken;
  }

  const quoteBody = {
    customerPhone: '0833000103',
    items: [
      { productId: 'C30P001', quantity: 2 },
      { productId: 'C30P002', quantity: 1 },
    ],
    promotionId: 'C30VALID',
  };

  let result = await requestJson(baseUrl, '/api/pos/quotes', {
    method: 'POST', body: quoteBody,
  });
  assert.equal(result.response.status, 401);

  for (const role of ['manager', 'customer']) {
    result = await requestJson(baseUrl, '/api/pos/quotes', {
      method: 'POST', token: tokens[role], body: quoteBody,
    });
    assert.equal(result.response.status, 403);
    assert.equal(result.payload.error.code, 'FORBIDDEN');
  }

  result = await requestJson(baseUrl, '/api/pos/quotes', {
    method: 'POST', token: tokens.cashier, body: quoteBody,
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'SHIFT_REQUIRED');

  result = await requestJson(baseUrl, '/api/pos/shifts/open', {
    method: 'POST', token: tokens.cashier, body: { openingCash: 300000 },
  });
  assert.equal(result.response.status, 201);

  for (const tamperedBody of [
    { ...quoteBody, price: 1 },
    { ...quoteBody, discount: 999999 },
    { ...quoteBody, total: 1 },
    { ...quoteBody, customerId: 'C30OFF' },
    { ...quoteBody, pointsToRedeem: 125 },
    {
      ...quoteBody,
      items: [{ productId: 'C30P001', quantity: 2, unitPrice: 1 }],
    },
  ]) {
    result = await requestJson(baseUrl, '/api/pos/quotes', {
      method: 'POST', token: tokens.cashier, body: tamperedBody,
    });
    assert.equal(result.response.status, 400);
    assert.equal(result.payload.error.code, 'VALIDATION_ERROR');
  }

  const stockBefore = await repository.query({
    text: `
      SELECT MaLo, SoLuongTon
      FROM dbo.LO_HANG
      WHERE MaLo LIKE 'C30%'
      ORDER BY MaLo
    `,
  });

  result = await requestJson(baseUrl, '/api/pos/quotes', {
    method: 'POST', token: tokens.cashier, body: quoteBody,
  });
  assert.equal(result.response.status, 200);
  const quote = result.payload.data;
  assert.equal(quote.shift.status, 'OPEN');
  assert.deepEqual(quote.customer, {
    customerId: 'C30CUST', name: 'C30 Active Member', phone: '0833000103',
  });
  assert.deepEqual(quote.loyalty, {
    currentPoints: 125, membershipTier: 'SILVER', pointsEarnedPreview: 3,
  });
  assert.deepEqual(quote.totals, {
    promotionDiscount: 4000,
    subtotal: 40000,
    totalAmount: 36000,
    totalDiscount: 4000,
  });
  assert.deepEqual(
    quote.items.map((item) => ({
      availableStock: item.availableStock,
      discountAmount: item.discountAmount,
      lineSubtotal: item.lineSubtotal,
      lineTotal: item.lineTotal,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    [
      {
        availableStock: 4,
        discountAmount: 2000,
        lineSubtotal: 20000,
        lineTotal: 18000,
        productId: 'C30P001',
        quantity: 2,
        unitPrice: 10000,
      },
      {
        availableStock: 5,
        discountAmount: 2000,
        lineSubtotal: 20000,
        lineTotal: 18000,
        productId: 'C30P002',
        quantity: 1,
        unitPrice: 20000,
      },
    ],
  );
  assert.equal(quote.promotion.eligible, true);
  assert.equal(quote.promotion.discountAmount, 4000);

  for (const [promotionId, reason] of [
    ['C30EXPIRE', 'PROMOTION_EXPIRED'],
    ['C30MIN', 'MINIMUM_ORDER_NOT_MET'],
    ['C30WRONG', 'NO_ELIGIBLE_PRODUCT'],
    ['C30INACT', 'PROMOTION_INACTIVE'],
  ]) {
    result = await requestJson(baseUrl, '/api/pos/quotes', {
      method: 'POST',
      token: tokens.cashier,
      body: {
        items: [{ productId: 'C30P001', quantity: 1 }],
        promotionId,
      },
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.payload.data.promotion.eligible, false);
    assert.equal(result.payload.data.promotion.reason, reason);
    assert.equal(result.payload.data.totals.promotionDiscount, 0);
    assert.equal(result.payload.data.totals.totalAmount, 10000);
  }

  result = await requestJson(baseUrl, '/api/pos/quotes', {
    method: 'POST',
    token: tokens.cashier,
    body: { items: [{ productId: 'C30P001', quantity: 1 }], promotionId: 'C30MISSING' },
  });
  assert.equal(result.response.status, 404);
  assert.equal(result.payload.error.code, 'PROMOTION_NOT_FOUND');

  result = await requestJson(baseUrl, '/api/pos/quotes', {
    method: 'POST',
    token: tokens.cashier,
    body: { items: [{ productId: 'C30P001', quantity: 5 }] },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'INSUFFICIENT_STOCK');

  result = await requestJson(baseUrl, '/api/pos/quotes', {
    method: 'POST',
    token: tokens.cashier,
    body: { items: [{ productId: 'C30P004', quantity: 1 }] },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'INSUFFICIENT_STOCK');

  result = await requestJson(baseUrl, '/api/pos/quotes', {
    method: 'POST',
    token: tokens.cashier,
    body: { items: [{ productId: 'C30P003', quantity: 1 }] },
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'PRODUCT_NOT_AVAILABLE');

  result = await requestJson(baseUrl, '/api/pos/quotes', {
    method: 'POST',
    token: tokens.cashier,
    body: {
      customerPhone: '0833000104',
      items: [{ productId: 'C30P001', quantity: 1 }],
    },
  });
  assert.equal(result.response.status, 404);
  assert.equal(result.payload.error.code, 'CUSTOMER_MEMBER_NOT_FOUND');

  const sideEffects = await repository.query({
    text: `
      SELECT COUNT(*) AS InvoiceCount FROM dbo.HOA_DON WHERE MaHD LIKE 'C30%';
      SELECT COUNT(*) AS PaymentCount
      FROM dbo.THANH_TOAN AS payment
      JOIN dbo.HOA_DON AS invoice ON invoice.MaHD = payment.MaHD
      WHERE invoice.MaHD LIKE 'C30%';
      SELECT MaLo, SoLuongTon
      FROM dbo.LO_HANG
      WHERE MaLo LIKE 'C30%'
      ORDER BY MaLo;
    `,
  });
  assert.equal(Number(sideEffects.recordsets[0][0].InvoiceCount), 0);
  assert.equal(Number(sideEffects.recordsets[1][0].PaymentCount), 0);
  assert.deepEqual(sideEffects.recordsets[2], stockBefore.recordset);
});
