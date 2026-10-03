'use strict';

process.env.JWT_SECRET ||= 'c37-integration-test-secret-with-at-least-32-bytes';
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
        DROP TRIGGER IF EXISTS dbo.trg_C37_ForceAuditFailure;
        DELETE audit_log
        FROM dbo.NHAT_KY_HE_THONG AS audit_log
        JOIN dbo.PHIEU_TRA AS return_header ON return_header.MaPT = audit_log.MaBanGhi
        WHERE audit_log.HanhDong = 'RETURN_COMPLETED'
          AND return_header.MaHD LIKE 'C37%';
        DELETE return_line
        FROM dbo.CHI_TIET_PHIEU_TRA AS return_line
        JOIN dbo.PHIEU_TRA AS return_header ON return_header.MaPT = return_line.MaPT
        WHERE return_header.MaHD LIKE 'C37%';
        DELETE FROM dbo.GIAO_DICH_KHO
        WHERE MaThamChieu LIKE 'C37%'
           OR MaThamChieu IN (
             SELECT MaPT FROM dbo.PHIEU_TRA WHERE MaHD LIKE 'C37%'
           );
        DELETE FROM dbo.PHIEU_TRA WHERE MaHD LIKE 'C37%';
        DELETE FROM dbo.THANH_TOAN WHERE MaHD LIKE 'C37%';
        DELETE lot_output
        FROM dbo.CHI_TIET_XUAT_LO AS lot_output
        JOIN dbo.CHI_TIET_HOA_DON AS invoice_line ON invoice_line.MaCTHD = lot_output.MaCTHD
        WHERE invoice_line.MaHD LIKE 'C37%';
        DELETE FROM dbo.CHI_TIET_HOA_DON WHERE MaHD LIKE 'C37%';
        DELETE FROM dbo.HOA_DON WHERE MaHD LIKE 'C37%';
        DELETE FROM dbo.CA_LAM_VIEC WHERE MaNV LIKE 'C37%';
        DELETE FROM dbo.TAI_KHOAN WHERE TenDangNhap LIKE 'c37.%';
        DELETE FROM dbo.KHACH_HANG WHERE MaKH LIKE 'C37%';
        DELETE FROM dbo.NHAN_VIEN WHERE MaNV LIKE 'C37%';
        DELETE FROM dbo.LO_HANG WHERE MaLo LIKE 'C37%';
        DELETE FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C37%';
        DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai LIKE 'C37%';
      `,
    });
  } finally {
    await closePool();
  }
}

after(cleanupTestRows);

integrationTest('return API enforces RBAC, authoritative refunds, exact-lot restoration and rollback', async (testContext) => {
  const baseUrl = await startServer(testContext);
  const sql = getSqlDriver(getDatabaseSettings().driver);
  const repository = new BaseRepository();
  await cleanupTestRows();

  const password = 'C37-role-pass';
  const passwordHash = await bcrypt.hash(password, 4);
  const fixture = await repository.query({
    text: `
      INSERT INTO dbo.NHAN_VIEN (
        MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai
      ) VALUES
        ('C37CASH', N'C37 Cashier', '0833700101', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE'),
        ('C37MGR', N'C37 Manager', '0833700102', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE'),
        ('C37WARE', N'C37 Warehouse', '0833700103', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE');

      INSERT INTO dbo.KHACH_HANG (
        MaKH, HoTen, SDT, DiemTichLuy, HangThanhVien, NgayDangKy, TrangThai
      ) VALUES
        ('C37CUST', N'C37 Member', '0833700104', 15, 'BRONZE', SYSDATETIME(), 'ACTIVE'),
        ('C37ROLL', N'C37 Rollback Member', '0833700105', 2, 'BRONZE', SYSDATETIME(), 'ACTIVE');

      INSERT INTO dbo.TAI_KHOAN (
        TenDangNhap, MatKhauHash, MaVaiTro, MaNV, MaKH, TrangThai
      ) VALUES
        ('c37.cashier', @PasswordHash, 'CASHIER', 'C37CASH', NULL, 'ACTIVE'),
        ('c37.manager', @PasswordHash, 'MANAGER', 'C37MGR', NULL, 'ACTIVE'),
        ('c37.warehouse', @PasswordHash, 'WAREHOUSE', 'C37WARE', NULL, 'ACTIVE'),
        ('c37.customer', @PasswordHash, 'CUSTOMER', NULL, 'C37CUST', 'ACTIVE');

      INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, TrangThai)
      VALUES ('C37CAT', N'C37 Category', 'ACTIVE');
      INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, MaVach, DonViTinh, GiaBan, MucTonToiThieu, MaLoai, TrangThai
      ) VALUES
        ('C37P001', N'C37 Product', 'C3700001', N'Cai', 11000, 0, 'C37CAT', 'ACTIVE'),
        ('C37P002', N'C37 Rollback Product', 'C3700002', N'Cai', 11000, 0, 'C37CAT', 'ACTIVE');

      INSERT INTO dbo.LO_HANG (
        MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
      ) VALUES
        ('C37LOT001', 'C37P001', 'C37-BATCH-1', DATEADD(DAY, -20, CONVERT(DATE, SYSDATETIME())), DATEADD(DAY, 20, CONVERT(DATE, SYSDATETIME())), 6000, 0, 'ACTIVE'),
        ('C37LOT002', 'C37P001', 'C37-BATCH-2', DATEADD(DAY, -10, CONVERT(DATE, SYSDATETIME())), DATEADD(DAY, 40, CONVERT(DATE, SYSDATETIME())), 6500, 0, 'ACTIVE'),
        ('C37LOTR01', 'C37P002', 'C37-ROLLBACK', DATEADD(DAY, -10, CONVERT(DATE, SYSDATETIME())), DATEADD(DAY, 30, CONVERT(DATE, SYSDATETIME())), 6000, 0, 'ACTIVE');

      INSERT INTO dbo.CA_LAM_VIEC (MaNV, GioBatDau, TienDauCa, TrangThai)
      VALUES ('C37CASH', DATEADD(HOUR, -1, SYSDATETIME()), 0, 'OPEN');
      DECLARE @ShiftId BIGINT = SCOPE_IDENTITY();

      INSERT INTO dbo.HOA_DON (
        MaHD, NgayLap, MaCa, MaKH, TongTienHang, TongGiamGia,
        TongThanhToan, DiemSuDung, DiemTichLuy, TrangThai
      ) VALUES
        ('C37INV001', DATEADD(MINUTE, -30, SYSDATETIME()), @ShiftId, 'C37CUST', 55000, 0, 55000, 0, 5, 'PAID'),
        ('C37ROLL01', DATEADD(MINUTE, -20, SYSDATETIME()), @ShiftId, 'C37ROLL', 22000, 0, 22000, 0, 2, 'PAID');

      INSERT INTO dbo.CHI_TIET_HOA_DON (MaHD, MaSP, SoLuong, DonGiaBan, TienGiam)
      VALUES ('C37INV001', 'C37P001', 5, 11000, 0);
      DECLARE @MainLineId BIGINT = SCOPE_IDENTITY();
      INSERT INTO dbo.CHI_TIET_XUAT_LO (MaCTHD, MaLo, SoLuong)
      VALUES (@MainLineId, 'C37LOT001', 2), (@MainLineId, 'C37LOT002', 3);

      INSERT INTO dbo.CHI_TIET_HOA_DON (MaHD, MaSP, SoLuong, DonGiaBan, TienGiam)
      VALUES ('C37ROLL01', 'C37P002', 2, 11000, 0);
      DECLARE @RollbackLineId BIGINT = SCOPE_IDENTITY();
      INSERT INTO dbo.CHI_TIET_XUAT_LO (MaCTHD, MaLo, SoLuong)
      VALUES (@RollbackLineId, 'C37LOTR01', 2);

      INSERT INTO dbo.THANH_TOAN (MaHD, PhuongThuc, SoTien, TrangThai)
      VALUES
        ('C37INV001', 'CASH', 55000, 'SUCCESS'),
        ('C37ROLL01', 'TRANSFER', 22000, 'SUCCESS');

      SELECT @MainLineId AS MainLineId, @RollbackLineId AS RollbackLineId;
    `,
    parameters: {
      PasswordHash: { type: sql.VarChar(255), value: passwordHash },
    },
  });
  const mainLineId = String(fixture.recordset[0].MainLineId);
  const rollbackLineId = String(fixture.recordset[0].RollbackLineId);

  const tokens = {};
  for (const role of ['cashier', 'manager', 'warehouse', 'customer']) {
    const login = await requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: `c37.${role}`, password },
    });
    assert.equal(login.response.status, 200);
    tokens[role] = login.payload.data.accessToken;
  }

  const partialBody = {
    invoiceId: 'C37INV001',
    reason: 'Bao bi loi',
    items: [{
      lineId: mainLineId,
      lotId: 'C37LOT001',
      quantity: 1,
      condition: 'RESALABLE',
    }],
  };

  let result = await requestJson(baseUrl, '/api/returns', {
    method: 'POST', body: partialBody,
  });
  assert.equal(result.response.status, 401);

  for (const role of ['manager', 'warehouse', 'customer']) {
    result = await requestJson(baseUrl, '/api/returns', {
      method: 'POST', token: tokens[role], body: partialBody,
    });
    assert.equal(result.response.status, 403);
    assert.equal(result.payload.error.code, 'FORBIDDEN');
  }

  result = await requestJson(baseUrl, '/api/returns', {
    method: 'POST',
    token: tokens.cashier,
    body: { ...partialBody, refundAmount: 1 },
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'VALIDATION_ERROR');

  result = await requestJson(baseUrl, '/api/returns', {
    method: 'POST', token: tokens.cashier, body: partialBody,
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.payload.data.return.refundAmount, 11000);
  assert.equal(result.payload.data.return.loyaltyPointsAdjusted, 1);
  assert.equal(result.payload.data.return.invoiceStatus, 'PAID');
  assert.equal(result.payload.data.return.items[0].condition, 'RESALABLE');
  const firstReturnId = result.payload.data.return.returnId;

  result = await requestJson(baseUrl, '/api/returns', {
    method: 'POST',
    token: tokens.cashier,
    body: {
      ...partialBody,
      reason: 'San pham hu hong',
      items: [{ ...partialBody.items[0], condition: 'DAMAGED' }],
    },
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.payload.data.return.refundAmount, 11000);
  assert.equal(result.payload.data.return.items[0].condition, 'DAMAGED');

  result = await requestJson(baseUrl, '/api/returns', {
    method: 'POST', token: tokens.cashier, body: partialBody,
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'RETURN_QUANTITY_EXCEEDED');

  let state = await repository.query({
    text: `
      SELECT SoLuongTon FROM dbo.LO_HANG WHERE MaLo = 'C37LOT001';
      SELECT DiemTichLuy FROM dbo.KHACH_HANG WHERE MaKH = 'C37CUST';
      SELECT COUNT(*) AS ReturnMovementCount
      FROM dbo.GIAO_DICH_KHO
      WHERE LoaiGiaoDich = 'RETURN' AND MaLo = 'C37LOT001';
      SELECT HanhDong, TenBang, MaBanGhi, DuLieuMoi
      FROM dbo.NHAT_KY_HE_THONG
      WHERE HanhDong = 'RETURN_COMPLETED' AND MaBanGhi = @ReturnId;
    `,
    parameters: {
      ReturnId: { type: sql.VarChar(100), value: firstReturnId },
    },
  });
  assert.equal(state.recordsets[0][0].SoLuongTon, 1);
  assert.equal(state.recordsets[1][0].DiemTichLuy, 13);
  assert.equal(Number(state.recordsets[2][0].ReturnMovementCount), 1);
  assert.equal(state.recordsets[3][0].HanhDong, 'RETURN_COMPLETED');
  assert.equal(state.recordsets[3][0].TenBang, 'PHIEU_TRA');
  assert.doesNotMatch(state.recordsets[3][0].DuLieuMoi, /password|token|secret/i);

  result = await requestJson(baseUrl, '/api/returns', {
    method: 'POST',
    token: tokens.cashier,
    body: {
      invoiceId: 'C37INV001',
      reason: 'Tra phan con lai',
      items: [{
        lineId: mainLineId,
        lotId: 'C37LOT002',
        quantity: 3,
        condition: 'RESALABLE',
      }],
    },
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.payload.data.return.refundAmount, 33000);
  assert.equal(result.payload.data.return.invoiceStatus, 'REFUNDED');
  assert.equal(result.payload.data.return.loyaltyPointsAdjusted, 3);

  state = await repository.query({
    text: `
      SELECT TrangThai FROM dbo.HOA_DON WHERE MaHD = 'C37INV001';
      SELECT TrangThai FROM dbo.THANH_TOAN WHERE MaHD = 'C37INV001';
      SELECT SoLuongTon FROM dbo.LO_HANG WHERE MaLo = 'C37LOT002';
      SELECT DiemTichLuy FROM dbo.KHACH_HANG WHERE MaKH = 'C37CUST';
    `,
  });
  assert.equal(state.recordsets[0][0].TrangThai, 'REFUNDED');
  assert.equal(state.recordsets[1][0].TrangThai, 'REFUNDED');
  assert.equal(state.recordsets[2][0].SoLuongTon, 3);
  assert.equal(state.recordsets[3][0].DiemTichLuy, 10);

  await repository.query({
    text: `
      CREATE TRIGGER dbo.trg_C37_ForceAuditFailure
      ON dbo.NHAT_KY_HE_THONG
      AFTER INSERT
      AS
      BEGIN
        SET NOCOUNT ON;
        IF EXISTS (
          SELECT 1
          FROM inserted AS audit_log
          JOIN dbo.PHIEU_TRA AS return_header ON return_header.MaPT = audit_log.MaBanGhi
          WHERE audit_log.HanhDong = 'RETURN_COMPLETED'
            AND return_header.MaHD = 'C37ROLL01'
        )
          THROW 52937, 'C37 forced audit failure with internal detail.', 1;
      END;
    `,
  });

  result = await requestJson(baseUrl, '/api/returns', {
    method: 'POST',
    token: tokens.cashier,
    body: {
      invoiceId: 'C37ROLL01',
      reason: 'Rollback audit test',
      items: [{
        lineId: rollbackLineId,
        lotId: 'C37LOTR01',
        quantity: 1,
        condition: 'RESALABLE',
      }],
    },
  });
  assert.equal(result.response.status, 500);
  assert.equal(result.payload.error.code, 'INTERNAL_SERVER_ERROR');
  assert.doesNotMatch(JSON.stringify(result.payload), /internal detail/i);

  await repository.query({ text: 'DROP TRIGGER IF EXISTS dbo.trg_C37_ForceAuditFailure;' });
  const rollback = await repository.query({
    text: `
      SELECT COUNT(*) AS ReturnCount FROM dbo.PHIEU_TRA WHERE MaHD = 'C37ROLL01';
      SELECT COUNT(*) AS ReturnMovementCount
      FROM dbo.GIAO_DICH_KHO
      WHERE LoaiGiaoDich = 'RETURN' AND MaLo = 'C37LOTR01';
      SELECT SoLuongTon FROM dbo.LO_HANG WHERE MaLo = 'C37LOTR01';
      SELECT TrangThai FROM dbo.HOA_DON WHERE MaHD = 'C37ROLL01';
      SELECT TrangThai FROM dbo.THANH_TOAN WHERE MaHD = 'C37ROLL01';
      SELECT DiemTichLuy FROM dbo.KHACH_HANG WHERE MaKH = 'C37ROLL';
    `,
  });
  assert.equal(Number(rollback.recordsets[0][0].ReturnCount), 0);
  assert.equal(Number(rollback.recordsets[1][0].ReturnMovementCount), 0);
  assert.equal(rollback.recordsets[2][0].SoLuongTon, 0);
  assert.equal(rollback.recordsets[3][0].TrangThai, 'PAID');
  assert.equal(rollback.recordsets[4][0].TrangThai, 'SUCCESS');
  assert.equal(rollback.recordsets[5][0].DiemTichLuy, 2);
});
