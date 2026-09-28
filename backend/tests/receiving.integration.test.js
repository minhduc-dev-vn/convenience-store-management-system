'use strict';

process.env.JWT_SECRET ||= 'c23-integration-test-secret-with-at-least-32-bytes';
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
    await repository.query({ text: 'DROP TRIGGER IF EXISTS dbo.trg_C23_ForceAuditFailure;' });
    await repository.query({
      text: `
        DELETE FROM dbo.NHAT_KY_HE_THONG
        WHERE MaTK IN (
          SELECT MaTK FROM dbo.TAI_KHOAN WHERE TenDangNhap LIKE 'c23.%'
        )
           OR (
             HanhDong = 'RECEIPT_CONFIRMED'
             AND MaBanGhi IN (
               SELECT MaPN FROM dbo.PHIEU_NHAP
               WHERE MaNV IN ('C23WARE', 'C23MGR') OR MaNCC LIKE 'C23%'
             )
           );

        DELETE FROM dbo.GIAO_DICH_KHO
        WHERE MaThamChieu IN (
          SELECT MaPN FROM dbo.PHIEU_NHAP
          WHERE MaNV IN ('C23WARE', 'C23MGR') OR MaNCC LIKE 'C23%'
        );

        DELETE detail
        FROM dbo.CHI_TIET_PHIEU_NHAP AS detail
        JOIN dbo.PHIEU_NHAP AS receipt ON receipt.MaPN = detail.MaPN
        WHERE receipt.MaNV IN ('C23WARE', 'C23MGR') OR receipt.MaNCC LIKE 'C23%';

        DELETE FROM dbo.PHIEU_NHAP
        WHERE MaNV IN ('C23WARE', 'C23MGR') OR MaNCC LIKE 'C23%';
        DELETE FROM dbo.LO_HANG WHERE SoLo LIKE 'C23-%';
        DELETE FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C23%';
        DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai LIKE 'C23%';
        DELETE FROM dbo.NHA_CUNG_CAP WHERE MaNCC LIKE 'C23%';
        DELETE FROM dbo.TAI_KHOAN WHERE TenDangNhap LIKE 'c23.%';
        DELETE FROM dbo.NHAN_VIEN WHERE MaNV IN ('C23WARE', 'C23MGR');
      `,
    });
  } finally {
    await closePool();
  }
}

async function queryOne(repository, text, parameters = {}) {
  const result = await repository.query({ text, parameters });
  return result.recordset[0] ?? null;
}

after(cleanupTestRows);

integrationTest('WAREHOUSE receiving APIs preserve validation, confirmation and rollback invariants', async (testContext) => {
  const baseUrl = await startServer(testContext);
  const sql = getSqlDriver(getDatabaseSettings().driver);
  const repository = new BaseRepository();
  await cleanupTestRows();

  const password = 'C23-role-pass';
  const passwordHash = await bcrypt.hash(password, 4);
  await repository.query({
    text: `
      INSERT INTO dbo.NHAN_VIEN (
        MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai
      ) VALUES
        ('C23WARE', N'C23 Warehouse', '0832300001', '2026-01-01', 0, 'ACTIVE'),
        ('C23MGR', N'C23 Manager', '0832300002', '2026-01-01', 0, 'ACTIVE');

      INSERT INTO dbo.TAI_KHOAN (
        TenDangNhap, MatKhauHash, MaVaiTro, MaNV, TrangThai
      ) VALUES
        ('c23.warehouse', @PasswordHash, 'WAREHOUSE', 'C23WARE', 'ACTIVE'),
        ('c23.manager', @PasswordHash, 'MANAGER', 'C23MGR', 'ACTIVE');

      INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, TrangThai)
      VALUES ('C23CAT', N'C23 Receiving Category', 'ACTIVE');

      INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, MaVach, DonViTinh, GiaBan, MucTonToiThieu, MaLoai, TrangThai
      ) VALUES (
        'C23PROD1', N'C23 Receiving Product', 'C23-BAR-001', N'Unit', 12000, 0, 'C23CAT', 'ACTIVE'
      );

      INSERT INTO dbo.NHA_CUNG_CAP (
        MaNCC, TenNCC, SDT, Email, MaSoThue, TrangThai
      ) VALUES
        ('C23SUP01', N'C23 Main Supplier', '0832300101', 'main.c23@example.test', 'C23-TAX-001', 'ACTIVE'),
        ('C23SUPRB', N'C23 Rollback Supplier', '0832300102', 'rollback.c23@example.test', 'C23-TAX-002', 'ACTIVE');
    `,
    parameters: {
      PasswordHash: { type: sql.VarChar(255), value: passwordHash },
    },
  });

  const tokens = {};
  for (const role of ['warehouse', 'manager']) {
    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: `c23.${role}`, password },
    });
    assert.equal(login.response.status, 200);
    tokens[role] = login.payload.data.accessToken;
  }

  let result = await requestJson(baseUrl, '/api/warehouse/receiving/receipts', {
    token: tokens.manager,
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.error.code, 'FORBIDDEN');

  result = await requestJson(
    baseUrl,
    '/api/warehouse/receiving/suppliers?page=1&pageSize=10&search=C23',
    { token: tokens.warehouse },
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.pagination.totalItems, 2);

  result = await requestJson(
    baseUrl,
    '/api/warehouse/receiving/products?page=1&pageSize=10&search=C23',
    { token: tokens.warehouse },
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(
    result.payload.data.items.map((item) => item.productId),
    ['C23PROD1'],
  );

  result = await requestJson(baseUrl, '/api/warehouse/receiving/receipts', {
    method: 'POST',
    token: tokens.warehouse,
    body: {
      supplierId: 'C23SUP01',
      receivedAt: '2026-09-28T08:00:00Z',
      note: 'C23 draft',
    },
  });
  assert.equal(result.response.status, 201);
  const receiptId = result.payload.data.receiptId;
  assert.match(receiptId, /^PN[A-F0-9]{13}$/);
  assert.equal(result.payload.data.employee.employeeId, 'C23WARE');
  assert.equal(result.payload.data.status, 'DRAFT');

  result = await requestJson(
    baseUrl,
    `/api/warehouse/receiving/receipts/${receiptId}/lines`,
    {
      method: 'POST',
      token: tokens.warehouse,
      body: {
        productId: 'C23PROD1',
        manufacturerLot: 'C23-INVALID-DATES',
        manufactureDate: '2027-01-02',
        expiryDate: '2027-01-01',
        quantity: 2,
        unitCost: 6000,
      },
    },
  );
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'VALIDATION_ERROR');

  let state = await queryOne(repository, `
    SELECT
      (SELECT COUNT_BIG(*) FROM dbo.LO_HANG WHERE SoLo = 'C23-INVALID-DATES') AS LotCount,
      (SELECT COUNT_BIG(*) FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = @ReceiptId) AS TransactionCount,
      (SELECT TongTien FROM dbo.PHIEU_NHAP WHERE MaPN = @ReceiptId) AS ReceiptTotal
  `, {
    ReceiptId: { type: sql.VarChar(15), value: receiptId },
  });
  assert.equal(Number(state.LotCount), 0);
  assert.equal(Number(state.TransactionCount), 0);
  assert.equal(Number(state.ReceiptTotal), 0);

  result = await requestJson(
    baseUrl,
    `/api/warehouse/receiving/receipts/${receiptId}/lines`,
    {
      method: 'POST',
      token: tokens.warehouse,
      body: {
        productId: 'C23PROD1',
        manufacturerLot: 'C23-MAIN-LOT',
        manufactureDate: '2026-09-01',
        expiryDate: '2027-09-01',
        quantity: 2,
        unitCost: 5000,
      },
    },
  );
  assert.equal(result.response.status, 201);
  const firstLineId = result.payload.data.lines[0].detailId;

  result = await requestJson(
    baseUrl,
    `/api/warehouse/receiving/receipts/${receiptId}/lines`,
    {
      method: 'POST',
      token: tokens.warehouse,
      body: {
        productId: 'C23PROD1',
        manufacturerLot: 'C23-DELETE-LOT',
        quantity: 1,
        unitCost: 1000,
      },
    },
  );
  assert.equal(result.response.status, 201);
  const secondLine = result.payload.data.lines.find(
    (line) => line.manufacturerLot === 'C23-DELETE-LOT',
  );
  assert.ok(secondLine);

  result = await requestJson(
    baseUrl,
    `/api/warehouse/receiving/receipts/${receiptId}/lines/${secondLine.detailId}`,
    { method: 'DELETE', token: tokens.warehouse },
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.lines.length, 1);

  result = await requestJson(
    baseUrl,
    `/api/warehouse/receiving/receipts/${receiptId}/lines/${firstLineId}`,
    {
      method: 'PATCH',
      token: tokens.warehouse,
      body: { expiryDate: '2028-09-01', quantity: 3, unitCost: 6000 },
    },
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.lines[0].expiryDate, '2028-09-01');
  assert.equal(result.payload.data.total, 18000);

  result = await requestJson(
    baseUrl,
    `/api/warehouse/receiving/receipts?page=1&pageSize=1&search=${receiptId}&status=DRAFT`,
    { token: tokens.warehouse },
  );
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.pagination, {
    page: 1, pageSize: 1, totalItems: 1, totalPages: 1,
  });

  result = await requestJson(
    baseUrl,
    `/api/warehouse/receiving/receipts/${receiptId}/confirm`,
    { method: 'POST', token: tokens.warehouse },
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.status, 'CONFIRMED');
  assert.equal(result.payload.data.lines[0].quantity, 3);

  state = await queryOne(repository, `
    SELECT
      lot.SoLuongTon,
      (SELECT COUNT_BIG(*) FROM dbo.GIAO_DICH_KHO
       WHERE MaThamChieu = @ReceiptId AND LoaiGiaoDich = 'IMPORT') AS ImportCount,
      (SELECT COUNT_BIG(*) FROM dbo.NHAT_KY_HE_THONG
       WHERE MaBanGhi = @ReceiptId AND HanhDong = 'RECEIPT_CONFIRMED') AS AuditCount,
      (SELECT TOP (1) CONCAT(COALESCE(DuLieuCu, N''), N' ', COALESCE(DuLieuMoi, N''))
       FROM dbo.NHAT_KY_HE_THONG
       WHERE MaBanGhi = @ReceiptId AND HanhDong = 'RECEIPT_CONFIRMED') AS AuditPayload
    FROM dbo.LO_HANG AS lot
    WHERE lot.SoLo = 'C23-MAIN-LOT'
  `, {
    ReceiptId: { type: sql.VarChar(15), value: receiptId },
  });
  assert.equal(Number(state.SoLuongTon), 3);
  assert.equal(Number(state.ImportCount), 1);
  assert.equal(Number(state.AuditCount), 1);
  assert.doesNotMatch(String(state.AuditPayload), /password|token|secret|jwt/i);

  result = await requestJson(
    baseUrl,
    `/api/warehouse/receiving/receipts/${receiptId}/confirm`,
    { method: 'POST', token: tokens.warehouse },
  );
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'RECEIPT_ALREADY_CONFIRMED');

  state = await queryOne(repository, `
    SELECT
      (SELECT SoLuongTon FROM dbo.LO_HANG WHERE SoLo = 'C23-MAIN-LOT') AS Stock,
      (SELECT COUNT_BIG(*) FROM dbo.GIAO_DICH_KHO
       WHERE MaThamChieu = @ReceiptId AND LoaiGiaoDich = 'IMPORT') AS ImportCount,
      (SELECT COUNT_BIG(*) FROM dbo.NHAT_KY_HE_THONG
       WHERE MaBanGhi = @ReceiptId AND HanhDong = 'RECEIPT_CONFIRMED') AS AuditCount
  `, {
    ReceiptId: { type: sql.VarChar(15), value: receiptId },
  });
  assert.equal(Number(state.Stock), 3);
  assert.equal(Number(state.ImportCount), 1);
  assert.equal(Number(state.AuditCount), 1);

  result = await requestJson(
    baseUrl,
    `/api/warehouse/receiving/receipts/${receiptId}/lines/${firstLineId}`,
    { method: 'PATCH', token: tokens.warehouse, body: { quantity: 4 } },
  );
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'RECEIPT_NOT_DRAFT');

  result = await requestJson(baseUrl, '/api/warehouse/receiving/receipts', {
    method: 'POST', token: tokens.warehouse, body: { supplierId: 'C23SUP01' },
  });
  assert.equal(result.response.status, 201);
  const emptyReceiptId = result.payload.data.receiptId;

  result = await requestJson(
    baseUrl,
    `/api/warehouse/receiving/receipts/${emptyReceiptId}/confirm`,
    { method: 'POST', token: tokens.warehouse },
  );
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'RECEIPT_EMPTY');

  result = await requestJson(
    baseUrl,
    `/api/warehouse/receiving/receipts/${emptyReceiptId}/cancel`,
    { method: 'POST', token: tokens.warehouse },
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.status, 'CANCELLED');

  result = await requestJson(baseUrl, '/api/warehouse/receiving/receipts', {
    method: 'POST', token: tokens.warehouse, body: { supplierId: 'C23SUPRB' },
  });
  assert.equal(result.response.status, 201);
  const rollbackReceiptId = result.payload.data.receiptId;

  result = await requestJson(
    baseUrl,
    `/api/warehouse/receiving/receipts/${rollbackReceiptId}/lines`,
    {
      method: 'POST',
      token: tokens.warehouse,
      body: {
        productId: 'C23PROD1',
        manufacturerLot: 'C23-ROLLBACK-LOT',
        quantity: 5,
        unitCost: 7000,
      },
    },
  );
  assert.equal(result.response.status, 201);

  await repository.query({
    text: `
      CREATE OR ALTER TRIGGER dbo.trg_C23_ForceAuditFailure
      ON dbo.NHAT_KY_HE_THONG
      AFTER INSERT
      AS
      BEGIN
        SET NOCOUNT ON;
        IF EXISTS (
          SELECT 1
          FROM inserted AS audit_log
          JOIN dbo.PHIEU_NHAP AS receipt ON receipt.MaPN = audit_log.MaBanGhi
          WHERE audit_log.HanhDong = 'RECEIPT_CONFIRMED'
            AND receipt.MaNCC = 'C23SUPRB'
        )
          THROW 52391, 'C23 forced audit failure.', 1;
      END;
    `,
  });

  result = await requestJson(
    baseUrl,
    `/api/warehouse/receiving/receipts/${rollbackReceiptId}/confirm`,
    { method: 'POST', token: tokens.warehouse },
  );
  assert.equal(result.response.status, 500);
  assert.equal(result.payload.error.code, 'INTERNAL_SERVER_ERROR');

  state = await queryOne(repository, `
    SELECT
      receipt.TrangThai,
      lot.SoLuongTon,
      (SELECT COUNT_BIG(*) FROM dbo.GIAO_DICH_KHO
       WHERE MaThamChieu = @ReceiptId AND LoaiGiaoDich = 'IMPORT') AS ImportCount,
      (SELECT COUNT_BIG(*) FROM dbo.NHAT_KY_HE_THONG
       WHERE MaBanGhi = @ReceiptId AND HanhDong = 'RECEIPT_CONFIRMED') AS AuditCount
    FROM dbo.PHIEU_NHAP AS receipt
    JOIN dbo.CHI_TIET_PHIEU_NHAP AS detail ON detail.MaPN = receipt.MaPN
    JOIN dbo.LO_HANG AS lot ON lot.MaLo = detail.MaLo
    WHERE receipt.MaPN = @ReceiptId
  `, {
    ReceiptId: { type: sql.VarChar(15), value: rollbackReceiptId },
  });
  assert.equal(state.TrangThai, 'DRAFT');
  assert.equal(Number(state.SoLuongTon), 0);
  assert.equal(Number(state.ImportCount), 0);
  assert.equal(Number(state.AuditCount), 0);

  await repository.query({ text: 'DROP TRIGGER IF EXISTS dbo.trg_C23_ForceAuditFailure;' });
});
