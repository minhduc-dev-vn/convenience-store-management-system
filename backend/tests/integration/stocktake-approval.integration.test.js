'use strict';

process.env.JWT_SECRET ||= 'c40-integration-test-secret-with-at-least-32-bytes';
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
        DROP TRIGGER IF EXISTS dbo.trg_C40_ForceApprovalAuditFailure;
        DELETE FROM dbo.NHAT_KY_HE_THONG
        WHERE (TenBang = 'KIEM_KE'
               AND MaBanGhi IN (SELECT MaKK FROM dbo.KIEM_KE WHERE MaNV = 'C40WARE')
               AND HanhDong IN ('STOCKTAKE_PROPOSED', 'STOCKTAKE_RECOUNT_REQUESTED', 'STOCKTAKE_APPROVED'))
           OR MaTK IN (SELECT MaTK FROM dbo.TAI_KHOAN WHERE TenDangNhap LIKE 'c40.%');
        DELETE FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu IN (
          SELECT MaKK FROM dbo.KIEM_KE WHERE MaNV = 'C40WARE'
        );
        DELETE detail
        FROM dbo.CHI_TIET_KIEM_KE AS detail
        JOIN dbo.KIEM_KE AS stocktake ON stocktake.MaKK = detail.MaKK
        WHERE stocktake.MaNV = 'C40WARE';
        DELETE FROM dbo.KIEM_KE WHERE MaNV = 'C40WARE';
        DELETE FROM dbo.TAI_KHOAN WHERE TenDangNhap LIKE 'c40.%';
        DELETE FROM dbo.NHAN_VIEN WHERE MaNV LIKE 'C40%';
        DELETE FROM dbo.LO_HANG WHERE MaLo = 'C40LOT001';
        DELETE FROM dbo.SAN_PHAM WHERE MaSP = 'C40P001';
        DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'C40CAT';
      `,
    });
  } finally {
    await closePool();
  }
}

after(cleanupTestRows);

integrationTest('stocktake API enforces roles, proposal workflow, atomic approval and rollback', async (testContext) => {
  const baseUrl = await startServer(testContext);
  const sql = getSqlDriver(getDatabaseSettings().driver);
  const repository = new BaseRepository();
  await cleanupTestRows();

  const password = 'C40-role-pass';
  const passwordHash = await bcrypt.hash(password, 4);
  await repository.query({
    text: `
      INSERT INTO dbo.NHAN_VIEN (
        MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai
      ) VALUES
        ('C40WARE', N'C40 Warehouse', '0840000101', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE'),
        ('C40MGR', N'C40 Manager', '0840000102', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE'),
        ('C40CASH', N'C40 Cashier', '0840000103', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE');

      INSERT INTO dbo.TAI_KHOAN (
        TenDangNhap, MatKhauHash, MaVaiTro, MaNV, MaKH, TrangThai
      ) VALUES
        ('c40.warehouse', @PasswordHash, 'WAREHOUSE', 'C40WARE', NULL, 'ACTIVE'),
        ('c40.manager', @PasswordHash, 'MANAGER', 'C40MGR', NULL, 'ACTIVE'),
        ('c40.cashier', @PasswordHash, 'CASHIER', 'C40CASH', NULL, 'ACTIVE');

      INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, TrangThai)
      VALUES ('C40CAT', N'C40 Category', 'ACTIVE');
      INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, MaVach, DonViTinh, GiaBan, MucTonToiThieu, MaLoai, TrangThai
      ) VALUES ('C40P001', N'C40 Product', 'C4000001', N'Cai', 12000, 1, 'C40CAT', 'ACTIVE');
      INSERT INTO dbo.LO_HANG (
        MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
      ) VALUES (
        'C40LOT001', 'C40P001', 'C40-BATCH-1',
        DATEADD(DAY, -10, CONVERT(DATE, SYSDATETIME())),
        DATEADD(DAY, 40, CONVERT(DATE, SYSDATETIME())),
        7000, 10, 'ACTIVE'
      );
    `,
    parameters: {
      PasswordHash: { type: sql.VarChar(255), value: passwordHash },
    },
  });

  const tokens = {};
  for (const role of ['warehouse', 'manager', 'cashier']) {
    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: `c40.${role}`, password },
    });
    assert.equal(login.response.status, 200);
    tokens[role] = login.payload.data.accessToken;
  }

  let result = await requestJson(baseUrl, '/api/warehouse/stocktakes', {
    method: 'POST', body: { note: 'Kiem ke C40' },
  });
  assert.equal(result.response.status, 401);

  for (const role of ['manager', 'cashier']) {
    result = await requestJson(baseUrl, '/api/warehouse/stocktakes', {
      method: 'POST', token: tokens[role], body: { note: 'Forbidden' },
    });
    assert.equal(result.response.status, 403);
    assert.equal(result.payload.error.code, 'FORBIDDEN');
  }

  result = await requestJson(baseUrl, '/api/warehouse/stocktakes', {
    method: 'POST',
    token: tokens.warehouse,
    body: { note: 'Client cannot set stock', stock: 999 },
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'VALIDATION_ERROR');

  result = await requestJson(baseUrl, '/api/warehouse/stocktakes', {
    method: 'POST', token: tokens.warehouse, body: { note: 'Kiem ke C40' },
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.payload.data.stocktake.schemaStatus, 'DRAFT');
  assert.equal(result.payload.data.stocktake.workflow.state, 'DRAFT');
  const createdLot = result.payload.data.lines.find((line) => line.lot.lotId === 'C40LOT001');
  assert.ok(createdLot);
  assert.equal(createdLot.systemQuantity, 10);
  const stocktakeId = result.payload.data.stocktake.stocktakeId;

  result = await requestJson(baseUrl, `/api/warehouse/stocktakes/${stocktakeId}/lots/C40LOT001`, {
    method: 'PATCH',
    token: tokens.warehouse,
    body: { actualQuantity: 7, reason: 'Thieu khi kiem dem' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.line.discrepancy, -3);

  result = await requestJson(baseUrl, `/api/warehouse/stocktakes/${stocktakeId}/propose`, {
    method: 'POST',
    token: tokens.warehouse,
    body: { comment: 'Da kiem dem hai lan' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.workflow.state, 'PENDING_APPROVAL');

  result = await requestJson(baseUrl, `/api/warehouse/stocktakes/${stocktakeId}/lots/C40LOT001`, {
    method: 'PATCH',
    token: tokens.warehouse,
    body: { actualQuantity: 8, reason: 'Khong duoc sua khi cho duyet' },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'STOCKTAKE_PENDING_APPROVAL');

  result = await requestJson(baseUrl, `/api/admin/stocktakes/${stocktakeId}/approve`, {
    method: 'POST', token: tokens.warehouse, body: {},
  });
  assert.equal(result.response.status, 403);

  result = await requestJson(baseUrl, '/api/admin/stocktakes?workflowState=PENDING_APPROVAL', {
    token: tokens.manager,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.items.length, 1);
  assert.equal(result.payload.data.items[0].stocktakeId, stocktakeId);
  assert.equal(result.payload.data.items[0].discrepancyCount, 1);

  result = await requestJson(baseUrl, `/api/admin/stocktakes/${stocktakeId}`, {
    token: tokens.manager,
  });
  assert.equal(result.response.status, 200);
  const pendingLot = result.payload.data.lines.find((line) => line.lot.lotId === 'C40LOT001');
  assert.ok(pendingLot);
  assert.equal(pendingLot.discrepancy, -3);
  assert.equal(pendingLot.reason, 'Thieu khi kiem dem');

  result = await requestJson(baseUrl, `/api/admin/stocktakes/${stocktakeId}/reject`, {
    method: 'POST',
    token: tokens.manager,
    body: { comment: 'Yeu cau kiem dem lai' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.workflow.state, 'RECOUNT_REQUIRED');

  let state = await repository.query({
    text: `
      SELECT TrangThai FROM dbo.KIEM_KE WHERE MaKK = @StocktakeId;
      SELECT COUNT(*) AS AuditCount
      FROM dbo.NHAT_KY_HE_THONG
      WHERE TenBang = 'KIEM_KE' AND MaBanGhi = @StocktakeId
        AND HanhDong = 'STOCKTAKE_RECOUNT_REQUESTED';
    `,
    parameters: { StocktakeId: { type: sql.VarChar(15), value: stocktakeId } },
  });
  assert.equal(state.recordsets[0][0].TrangThai, 'DRAFT');
  assert.equal(Number(state.recordsets[1][0].AuditCount), 1);

  result = await requestJson(baseUrl, `/api/warehouse/stocktakes/${stocktakeId}/lots/C40LOT001`, {
    method: 'PATCH',
    token: tokens.warehouse,
    body: { actualQuantity: 8, reason: 'Ket qua kiem dem lai' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.line.discrepancy, -2);

  result = await requestJson(baseUrl, `/api/warehouse/stocktakes/${stocktakeId}/propose`, {
    method: 'POST', token: tokens.warehouse, body: {},
  });
  assert.equal(result.response.status, 200);

  await repository.query({
    text: `
      CREATE TRIGGER dbo.trg_C40_ForceApprovalAuditFailure
      ON dbo.NHAT_KY_HE_THONG
      AFTER INSERT
      AS
      BEGIN
        SET NOCOUNT ON;
        IF EXISTS (
          SELECT 1 FROM inserted
          WHERE HanhDong = 'STOCKTAKE_APPROVED'
        )
          THROW 52940, 'C40 forced approval audit failure with internal detail.', 1;
      END;
    `,
  });

  result = await requestJson(baseUrl, `/api/admin/stocktakes/${stocktakeId}/approve`, {
    method: 'POST', token: tokens.manager, body: { comment: 'Thu rollback' },
  });
  assert.equal(result.response.status, 500);
  assert.equal(result.payload.error.code, 'INTERNAL_SERVER_ERROR');
  assert.doesNotMatch(JSON.stringify(result.payload), /internal detail/i);

  await repository.query({ text: 'DROP TRIGGER IF EXISTS dbo.trg_C40_ForceApprovalAuditFailure;' });
  state = await repository.query({
    text: `
      SELECT TrangThai FROM dbo.KIEM_KE WHERE MaKK = @StocktakeId;
      SELECT SoLuongTon FROM dbo.LO_HANG WHERE MaLo = 'C40LOT001';
      SELECT COUNT(*) AS MovementCount
      FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = @StocktakeId;
      SELECT COUNT(*) AS ApprovalAuditCount
      FROM dbo.NHAT_KY_HE_THONG
      WHERE HanhDong = 'STOCKTAKE_APPROVED' AND MaBanGhi = @StocktakeId;
    `,
    parameters: { StocktakeId: { type: sql.VarChar(15), value: stocktakeId } },
  });
  assert.equal(state.recordsets[0][0].TrangThai, 'DRAFT');
  assert.equal(state.recordsets[1][0].SoLuongTon, 10);
  assert.equal(Number(state.recordsets[2][0].MovementCount), 0);
  assert.equal(Number(state.recordsets[3][0].ApprovalAuditCount), 0);

  result = await requestJson(baseUrl, `/api/admin/stocktakes/${stocktakeId}/approve`, {
    method: 'POST', token: tokens.manager, body: { comment: 'Dong y dieu chinh' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.stocktake.schemaStatus, 'APPROVED');
  assert.equal(result.payload.data.stocktake.workflow.state, 'APPROVED');
  const approvedLot = result.payload.data.lines.find((line) => line.lot.lotId === 'C40LOT001');
  assert.ok(approvedLot);
  assert.equal(approvedLot.currentQuantity, 8);

  state = await repository.query({
    text: `
      SELECT TrangThai FROM dbo.KIEM_KE WHERE MaKK = @StocktakeId;
      SELECT SoLuongTon FROM dbo.LO_HANG WHERE MaLo = 'C40LOT001';
      SELECT LoaiGiaoDich, SoLuongBienDong, MaNV
      FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = @StocktakeId;
      SELECT HanhDong, MaTK, DuLieuCu, DuLieuMoi
      FROM dbo.NHAT_KY_HE_THONG
      WHERE HanhDong = 'STOCKTAKE_APPROVED' AND MaBanGhi = @StocktakeId;
    `,
    parameters: { StocktakeId: { type: sql.VarChar(15), value: stocktakeId } },
  });
  assert.equal(state.recordsets[0][0].TrangThai, 'APPROVED');
  assert.equal(state.recordsets[1][0].SoLuongTon, 8);
  assert.equal(state.recordsets[2][0].LoaiGiaoDich, 'ADJUSTMENT');
  assert.equal(state.recordsets[2][0].SoLuongBienDong, -2);
  assert.equal(state.recordsets[2][0].MaNV, 'C40MGR');
  assert.equal(state.recordsets[3][0].HanhDong, 'STOCKTAKE_APPROVED');
  assert.doesNotMatch(state.recordsets[3][0].DuLieuMoi, /password|token|secret/i);

  result = await requestJson(baseUrl, `/api/warehouse/stocktakes/${stocktakeId}/lots/C40LOT001`, {
    method: 'PATCH',
    token: tokens.warehouse,
    body: { actualQuantity: 9, reason: 'Khong duoc sua sau duyet' },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'STOCKTAKE_FINALIZED');

  result = await requestJson(baseUrl, `/api/admin/stocktakes/${stocktakeId}/approve`, {
    method: 'POST', token: tokens.manager, body: {},
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'STOCKTAKE_FINALIZED');
});
