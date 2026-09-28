'use strict';

process.env.JWT_SECRET ||= 'c16-integration-test-secret-with-at-least-32-bytes';
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
        DELETE FROM dbo.NHAT_KY_HE_THONG
        WHERE MaBanGhi LIKE 'C16%'
           OR MaTK IN (
             SELECT MaTK FROM dbo.TAI_KHOAN WHERE TenDangNhap LIKE 'c16.%'
           );
        DELETE FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C16%';
        DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai LIKE 'C16%';
        DELETE account
        FROM dbo.TAI_KHOAN AS account
        LEFT JOIN dbo.KHACH_HANG AS customer ON customer.MaKH = account.MaKH
        WHERE account.TenDangNhap LIKE 'c16.%'
           OR customer.SDT LIKE '08316%';
        DELETE FROM dbo.KHACH_HANG WHERE SDT LIKE '08316%';
        DELETE FROM dbo.NHAN_VIEN WHERE MaNV = 'C16MGR';
      `,
    });
  } finally {
    await closePool();
  }
}

after(cleanupTestRows);

integrationTest('public catalog and manager product, category and price APIs enforce C16 rules', async (testContext) => {
  const baseUrl = await startServer(testContext);
  const sql = getSqlDriver(getDatabaseSettings().driver);
  const repository = new BaseRepository();
  await cleanupTestRows();

  const managerPassword = 'C16-manager-pass';
  const customerPassword = 'C16-customer-pass';
  const managerHash = await bcrypt.hash(managerPassword, 4);
  await repository.query({
    text: `
      INSERT INTO dbo.NHAN_VIEN (
        MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai
      ) VALUES ('C16MGR', N'C16 Manager', '0831600001', '2026-01-01', 0, 'ACTIVE');

      INSERT INTO dbo.TAI_KHOAN (
        TenDangNhap, MatKhauHash, MaVaiTro, MaNV, TrangThai
      ) VALUES ('c16.manager', @ManagerHash, 'MANAGER', 'C16MGR', 'ACTIVE');
    `,
    parameters: {
      ManagerHash: { type: sql.VarChar(255), value: managerHash },
    },
  });

  let result = await requestJson(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: {
      fullName: 'C16 Customer',
      phone: '0831600002',
      email: 'c16.customer@example.test',
      password: customerPassword,
      passwordConfirmation: customerPassword,
    },
  });
  assert.equal(result.response.status, 201);

  result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST', body: { identifier: 'c16.manager', password: managerPassword },
  });
  assert.equal(result.response.status, 200);
  const managerToken = result.payload.data.accessToken;

  result = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST', body: { identifier: '0831600002', password: customerPassword },
  });
  assert.equal(result.response.status, 200);
  const customerToken = result.payload.data.accessToken;

  result = await requestJson(baseUrl, '/api/admin/categories', {
    method: 'POST',
    token: managerToken,
    body: {
      categoryId: 'C16CAT01',
      name: 'C16 Drinks',
      description: 'C16 integration category',
    },
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.payload.data.status, 'ACTIVE');

  result = await requestJson(baseUrl, '/api/admin/categories', {
    method: 'POST',
    token: managerToken,
    body: { categoryId: 'C16CAT02', name: 'C16 Inactive', status: 'INACTIVE' },
  });
  assert.equal(result.response.status, 201);

  result = await requestJson(baseUrl, '/api/admin/categories', {
    method: 'POST',
    token: managerToken,
    body: { categoryId: 'C16CAT03', name: 'C16 Drinks' },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'CATEGORY_NAME_CONFLICT');

  result = await requestJson(baseUrl, '/api/admin/products', {
    method: 'POST',
    token: managerToken,
    body: {
      barcode: 'C16-BAR-0001',
      categoryId: 'C16CAT01',
      minimumStock: 5,
      name: 'C16 Coffee',
      price: 25000,
      productId: 'C16P0001',
      unit: 'Can',
    },
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.payload.data.barcode, 'C16-BAR-0001');
  assert.equal(result.payload.data.minimumStock, 5);

  result = await requestJson(baseUrl, '/api/admin/products', {
    method: 'POST',
    token: managerToken,
    body: {
      barcode: 'C16-BAR-0002',
      categoryId: 'C16CAT02',
      minimumStock: 0,
      name: 'C16 Hidden Product',
      price: 10000,
      productId: 'C16P0002',
      unit: 'Box',
    },
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'CATEGORY_INACTIVE');

  result = await requestJson(baseUrl, '/api/admin/products', {
    method: 'POST',
    token: managerToken,
    body: {
      barcode: 'C16-BAR-0001',
      categoryId: 'C16CAT01',
      minimumStock: 0,
      name: 'C16 Duplicate Barcode',
      price: 10000,
      productId: 'C16P0002',
      unit: 'Box',
    },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'PRODUCT_BARCODE_CONFLICT');

  result = await requestJson(
    baseUrl,
    '/api/products?page=1&pageSize=1&search=C16%20Coffee&categoryId=C16CAT01',
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.pagination, {
    page: 1, pageSize: 1, totalItems: 1, totalPages: 1,
  });
  assert.equal(result.payload.data.items[0].productId, 'C16P0001');
  assert.equal(result.payload.data.items[0].price, 25000);
  assert.equal(Object.hasOwn(result.payload.data.items[0], 'barcode'), false);
  assert.equal(Object.hasOwn(result.payload.data.items[0], 'minimumStock'), false);
  assert.equal(Object.hasOwn(result.payload.data.items[0], 'status'), false);

  result = await requestJson(baseUrl, '/api/products/C16P0001');
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.unit, 'Can');
  assert.equal(Object.hasOwn(result.payload.data, 'barcode'), false);

  result = await requestJson(
    baseUrl,
    '/api/admin/products?page=1&pageSize=1&search=C16-BAR-0001&status=ACTIVE',
    { token: managerToken },
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.items[0].barcode, 'C16-BAR-0001');
  assert.equal(result.payload.data.items[0].minimumStock, 5);

  result = await requestJson(baseUrl, '/api/admin/products/C16P0001', {
    method: 'PATCH', token: customerToken, body: { name: 'Forbidden customer update' },
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.error.code, 'FORBIDDEN');

  result = await requestJson(baseUrl, '/api/admin/products/C16P0001', {
    method: 'PATCH', token: managerToken, body: { price: 30000 },
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'VALIDATION_ERROR');

  result = await requestJson(baseUrl, '/api/admin/products/C16P0001', {
    method: 'PATCH',
    token: managerToken,
    body: { minimumStock: 8, name: 'C16 Coffee Updated', unit: 'Bottle' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.minimumStock, 8);
  assert.equal(result.payload.data.name, 'C16 Coffee Updated');

  result = await requestJson(baseUrl, '/api/admin/products/C16P0001/price', {
    method: 'PATCH', token: managerToken, body: { newPrice: 0, reason: 'Invalid' },
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'VALIDATION_ERROR');

  result = await requestJson(baseUrl, '/api/admin/products/C16P0001/price', {
    method: 'PATCH',
    token: managerToken,
    body: { newPrice: 27500, reason: 'C16 market adjustment' },
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data, {
    newPrice: 27500,
    oldPrice: 25000,
    productId: 'C16P0001',
    reason: 'C16 market adjustment',
  });

  result = await requestJson(
    baseUrl,
    '/api/admin/products/C16P0001/price-history?page=1&pageSize=10',
    { token: managerToken },
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.pagination.totalItems, 1);
  assert.equal(result.payload.data.items[0].oldPrice, 25000);
  assert.equal(result.payload.data.items[0].newPrice, 27500);
  assert.equal(result.payload.data.items[0].reason, 'C16 market adjustment');
  assert.equal(result.payload.data.items[0].changedBy.username, 'c16.manager');
  assert.equal(JSON.stringify(result.payload.data).includes('DuLieuCu'), false);

  const auditResult = await repository.query({
    text: `
      SELECT HanhDong, TenBang, MaBanGhi, DuLieuCu, DuLieuMoi, MaTK, ThoiGian
      FROM dbo.NHAT_KY_HE_THONG
      WHERE HanhDong = 'UPDATE_PRICE' AND MaBanGhi = 'C16P0001'
    `,
  });
  assert.equal(auditResult.recordset.length, 1);
  assert.equal(auditResult.recordset[0].TenBang, 'SAN_PHAM');
  assert.equal(JSON.parse(auditResult.recordset[0].DuLieuCu).price, 25000);
  assert.equal(JSON.parse(auditResult.recordset[0].DuLieuMoi).price, 27500);
  assert.ok(auditResult.recordset[0].MaTK);
  assert.ok(auditResult.recordset[0].ThoiGian);

  result = await requestJson(baseUrl, '/api/admin/products/C16P0001/status', {
    method: 'PATCH', token: managerToken, body: { status: 'INACTIVE' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.status, 'INACTIVE');

  result = await requestJson(baseUrl, '/api/products/C16P0001');
  assert.equal(result.response.status, 404);
  assert.equal(result.payload.error.code, 'PRODUCT_NOT_FOUND');

  result = await requestJson(baseUrl, '/api/admin/products/C16P0001/status', {
    method: 'PATCH', token: managerToken, body: { status: 'ACTIVE' },
  });
  assert.equal(result.response.status, 200);

  result = await requestJson(
    baseUrl,
    '/api/admin/categories?page=1&pageSize=1&search=C16&status=ACTIVE',
    { token: managerToken },
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.pagination.totalItems, 1);
  assert.equal(result.payload.data.items[0].categoryId, 'C16CAT01');

  result = await requestJson(baseUrl, '/api/admin/categories/C16CAT01', {
    method: 'PATCH', token: managerToken, body: { description: 'Updated C16 description' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.description, 'Updated C16 description');

  result = await requestJson(baseUrl, '/api/admin/categories/C16CAT01/status', {
    method: 'PATCH', token: managerToken, body: { status: 'INACTIVE' },
  });
  assert.equal(result.response.status, 200);

  result = await requestJson(baseUrl, '/api/products/C16P0001');
  assert.equal(result.response.status, 404);

  result = await requestJson(baseUrl, '/api/products/categories');
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.some((item) => item.categoryId === 'C16CAT01'), false);

  result = await requestJson(baseUrl, '/api/admin/categories/C16CAT01/status', {
    method: 'PATCH', token: managerToken, body: { status: 'ACTIVE' },
  });
  assert.equal(result.response.status, 200);

  result = await requestJson(baseUrl, '/api/products/C16P0001');
  assert.equal(result.response.status, 200);
});
