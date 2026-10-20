'use strict';

process.env.JWT_SECRET ||= 'c18-integration-test-secret-with-at-least-32-bytes';
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
        DELETE FROM dbo.KHUYEN_MAI_SAN_PHAM WHERE MaKM LIKE 'C18%';
        DELETE FROM dbo.KHUYEN_MAI WHERE MaKM LIKE 'C18%';
        DELETE FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C18%';
        DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai LIKE 'C18%';
        DELETE FROM dbo.TAI_KHOAN WHERE TenDangNhap LIKE 'c18.%';
        DELETE FROM dbo.NHAN_VIEN WHERE MaNV IN ('C18MGR', 'C18CASH');
      `,
    });
  } finally {
    await closePool();
  }
}

after(cleanupTestRows);

integrationTest('promotion CRUD, public read and authoritative evaluation enforce C18 rules', async (testContext) => {
  const baseUrl = await startServer(testContext);
  const sql = getSqlDriver(getDatabaseSettings().driver);
  const repository = new BaseRepository();
  await cleanupTestRows();

  const managerPassword = 'C18-manager-pass';
  const cashierPassword = 'C18-cashier-pass';
  const [managerHash, cashierHash] = await Promise.all([
    bcrypt.hash(managerPassword, 4),
    bcrypt.hash(cashierPassword, 4),
  ]);
  await repository.query({
    text: `
      INSERT INTO dbo.NHAN_VIEN (
        MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai
      ) VALUES
        ('C18MGR', N'C18 Manager', '0831800001', '2026-01-01', 0, 'ACTIVE'),
        ('C18CASH', N'C18 Cashier', '0831800002', '2026-01-01', 0, 'ACTIVE');

      INSERT INTO dbo.TAI_KHOAN (
        TenDangNhap, MatKhauHash, MaVaiTro, MaNV, TrangThai
      ) VALUES
        ('c18.manager', @ManagerHash, 'MANAGER', 'C18MGR', 'ACTIVE'),
        ('c18.cashier', @CashierHash, 'CASHIER', 'C18CASH', 'ACTIVE');

      INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, MoTa, TrangThai)
      VALUES ('C18CAT', N'C18 Category', N'C18 integration category', 'ACTIVE');

      INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, MaVach, DonViTinh, GiaBan, MucTonToiThieu, MaLoai, TrangThai
      ) VALUES
        ('C18P001', N'C18 Eligible Product', 'C18-BAR-001', N'Hộp', 20000, 0, 'C18CAT', 'ACTIVE'),
        ('C18P002', N'C18 Other Product', 'C18-BAR-002', N'Chai', 10000, 0, 'C18CAT', 'ACTIVE');
    `,
    parameters: {
      CashierHash: { type: sql.VarChar(255), value: cashierHash },
      ManagerHash: { type: sql.VarChar(255), value: managerHash },
    },
  });

  let result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST', body: { identifier: 'c18.manager', password: managerPassword },
  });
  assert.equal(result.response.status, 200);
  const managerToken = result.payload.data.accessToken;

  result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST', body: { identifier: 'c18.cashier', password: cashierPassword },
  });
  assert.equal(result.response.status, 200);
  const cashierToken = result.payload.data.accessToken;

  const now = Date.now();
  const activeStart = new Date(now - 60 * 60 * 1000).toISOString();
  const activeEnd = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const expiredStart = new Date(now - 3 * 60 * 60 * 1000).toISOString();
  const expiredEnd = new Date(now - 2 * 60 * 60 * 1000).toISOString();

  result = await requestJson(baseUrl, '/api/admin/promotions', {
    method: 'POST',
    token: managerToken,
    body: {
      promotionId: 'C18PCT001',
      name: 'C18 Twenty Percent',
      type: 'PERCENT',
      value: 20,
      minimumOrderValue: 25000,
      maximumDiscount: 3000,
      startAt: activeStart,
      endAt: activeEnd,
      productIds: ['C18P001'],
    },
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.payload.data.productCount, 1);
  assert.deepEqual(result.payload.data.products.map((item) => item.productId), ['C18P001']);

  result = await requestJson(baseUrl, '/api/admin/promotions', {
    method: 'POST',
    token: managerToken,
    body: {
      promotionId: 'C18EXP001',
      name: 'C18 Expired',
      type: 'AMOUNT',
      value: 5000,
      minimumOrderValue: 0,
      startAt: expiredStart,
      endAt: expiredEnd,
      productIds: ['C18P001'],
    },
  });
  assert.equal(result.response.status, 201);

  result = await requestJson(baseUrl, '/api/admin/promotions', {
    method: 'POST',
    token: cashierToken,
    body: {
      promotionId: 'C18NOAUTH', name: 'Forbidden', type: 'AMOUNT', value: 1,
      startAt: activeStart, endAt: activeEnd, productIds: ['C18P001'],
    },
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.error.code, 'FORBIDDEN');

  result = await requestJson(
    baseUrl,
    '/api/admin/promotions?page=1&pageSize=1&search=C18&type=PERCENT&status=ACTIVE',
    { token: managerToken },
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.pagination, {
    page: 1, pageSize: 1, totalItems: 1, totalPages: 1,
  });
  assert.equal(result.payload.data.items[0].promotionId, 'C18PCT001');

  result = await requestJson(baseUrl, '/api/promotions');
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.map((item) => item.promotionId), ['C18PCT001']);
  assert.equal(Object.hasOwn(result.payload.data[0], 'status'), false);
  assert.equal(Object.hasOwn(result.payload.data[0].products[0], 'status'), false);

  result = await requestJson(baseUrl, '/api/promotions?productId=C18P002');
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data, []);

  result = await requestJson(baseUrl, '/api/promotions/C18EXP001');
  assert.equal(result.response.status, 404);
  assert.equal(result.payload.error.code, 'PROMOTION_NOT_FOUND');

  result = await requestJson(baseUrl, '/api/promotions/evaluate', {
    method: 'POST',
    token: cashierToken,
    body: {
      promotionId: 'C18PCT001',
      items: [
        { productId: 'C18P001', quantity: 1 },
        { productId: 'C18P002', quantity: 1 },
      ],
    },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.eligible, true);
  assert.equal(result.payload.data.orderSubtotal, 30000);
  assert.equal(result.payload.data.eligibleSubtotal, 20000);
  assert.equal(result.payload.data.discountAmount, 3000);
  assert.deepEqual(
    result.payload.data.qualifyingItems.map((item) => item.productId),
    ['C18P001'],
  );

  result = await requestJson(baseUrl, '/api/promotions/evaluate', {
    method: 'POST',
    token: cashierToken,
    body: {
      promotionId: 'C18PCT001',
      items: [{ productId: 'C18P001', quantity: 1, unitPrice: 1 }],
    },
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'VALIDATION_ERROR');

  result = await requestJson(baseUrl, '/api/promotions/evaluate', {
    method: 'POST',
    token: cashierToken,
    body: {
      promotionId: 'C18PCT001',
      items: [{ productId: 'C18P002', quantity: 3 }],
    },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.eligible, false);
  assert.equal(result.payload.data.reason, 'NO_ELIGIBLE_PRODUCT');
  assert.equal(result.payload.data.discountAmount, 0);

  result = await requestJson(baseUrl, '/api/promotions/evaluate', {
    method: 'POST',
    token: cashierToken,
    body: {
      promotionId: 'C18EXP001',
      items: [{ productId: 'C18P001', quantity: 2 }],
    },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.reason, 'PROMOTION_EXPIRED');
  assert.equal(result.payload.data.discountAmount, 0);

  result = await requestJson(baseUrl, '/api/promotions/evaluate', {
    method: 'POST',
    token: managerToken,
    body: {
      promotionId: 'C18PCT001', items: [{ productId: 'C18P001', quantity: 2 }],
    },
  });
  assert.equal(result.response.status, 403);

  result = await requestJson(baseUrl, '/api/admin/promotions/C18PCT001', {
    method: 'PATCH',
    token: managerToken,
    body: {
      name: 'C18 Twenty Percent Updated',
      minimumOrderValue: 0,
      productIds: ['C18P001', 'C18P002'],
    },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.name, 'C18 Twenty Percent Updated');
  assert.equal(result.payload.data.productCount, 2);

  result = await requestJson(baseUrl, '/api/admin/promotions/C18PCT001/status', {
    method: 'PATCH', token: managerToken, body: { status: 'INACTIVE' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.status, 'INACTIVE');

  result = await requestJson(baseUrl, '/api/promotions');
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.some((item) => item.promotionId === 'C18PCT001'), false);

  result = await requestJson(baseUrl, '/api/promotions/evaluate', {
    method: 'POST',
    token: cashierToken,
    body: {
      promotionId: 'C18PCT001', items: [{ productId: 'C18P001', quantity: 2 }],
    },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.reason, 'PROMOTION_INACTIVE');
  assert.equal(result.payload.data.discountAmount, 0);
});
