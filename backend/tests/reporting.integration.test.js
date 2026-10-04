'use strict';

process.env.JWT_SECRET ||= 'c46-report-integration-secret-with-at-least-32-bytes';
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

async function requestJson(baseUrl, path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(`${baseUrl}${path}`, { headers });
  return { response, payload: await response.json() };
}

async function login(baseUrl, identifier, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  return payload.data.accessToken;
}

async function cleanupTestRows() {
  if (process.env.RUN_DB_INTEGRATION_TESTS !== 'true') return;
  try {
    const repository = new BaseRepository();
    await repository.query({
      text: `
        DELETE FROM dbo.CHI_TIET_PHIEU_TRA WHERE MaPT LIKE 'C46%';
        DELETE FROM dbo.PHIEU_TRA WHERE MaPT LIKE 'C46%';
        DELETE FROM dbo.CHI_TIET_XUAT_LO
        WHERE MaCTHD IN (SELECT MaCTHD FROM dbo.CHI_TIET_HOA_DON WHERE MaHD LIKE 'C46%');
        DELETE FROM dbo.THANH_TOAN WHERE MaHD LIKE 'C46%';
        DELETE FROM dbo.CHI_TIET_HOA_DON WHERE MaHD LIKE 'C46%';
        DELETE FROM dbo.HOA_DON WHERE MaHD LIKE 'C46%';
        DELETE FROM dbo.CHI_TIET_PHIEU_NHAP WHERE MaPN LIKE 'C46%';
        DELETE FROM dbo.PHIEU_NHAP WHERE MaPN LIKE 'C46%';
        DELETE FROM dbo.CA_LAM_VIEC WHERE MaNV LIKE 'C46%';
        DELETE FROM dbo.LO_HANG WHERE MaLo LIKE 'C46%';
        DELETE FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C46%';
        DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai LIKE 'C46%';
        DELETE FROM dbo.NHA_CUNG_CAP WHERE MaNCC LIKE 'C46%';
        DELETE FROM dbo.TAI_KHOAN WHERE TenDangNhap LIKE 'c46.%';
        DELETE FROM dbo.NHAN_VIEN WHERE MaNV LIKE 'C46%';
      `,
    });
  } finally {
    await closePool();
  }
}

after(cleanupTestRows);

integrationTest('manager reporting APIs return the C45 fixture and enforce validation/RBAC', async (testContext) => {
  const baseUrl = await startServer(testContext);
  const sql = getSqlDriver(getDatabaseSettings().driver);
  const repository = new BaseRepository();
  await cleanupTestRows();

  const password = 'C46-report-pass';
  const passwordHash = await bcrypt.hash(password, 4);
  await repository.query({
    text: `
      INSERT INTO dbo.NHAN_VIEN (
        MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai
      ) VALUES
        ('C46MGR', N'C46 Manager', '0846000001', '2026-01-01', 0, 'ACTIVE'),
        ('C46CASH', N'C46 Cashier', '0846000002', '2026-01-01', 0, 'ACTIVE'),
        ('C46WARE', N'C46 Warehouse', '0846000003', '2026-01-01', 0, 'ACTIVE');

      INSERT INTO dbo.TAI_KHOAN (
        TenDangNhap, MatKhauHash, MaVaiTro, MaNV, TrangThai
      ) VALUES
        ('c46.manager', @PasswordHash, 'MANAGER', 'C46MGR', 'ACTIVE'),
        ('c46.cashier', @PasswordHash, 'CASHIER', 'C46CASH', 'ACTIVE');

      INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, MoTa, TrangThai)
      VALUES ('C46CAT01', N'C46 Category', N'C46 report fixture', 'ACTIVE');

      INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, MaVach, DonViTinh, GiaBan, MucTonToiThieu, MaLoai, TrangThai
      ) VALUES
        ('C46P001', N'C46 Best Product', 'C46-BAR-001', N'Unit', 100, 2, 'C46CAT01', 'ACTIVE'),
        ('C46P002', N'C46 Slow Product', 'C46-BAR-002', N'Unit', 50, 2, 'C46CAT01', 'ACTIVE');

      INSERT INTO dbo.NHA_CUNG_CAP (
        MaNCC, TenNCC, SDT, Email, DiaChi, MaSoThue, TrangThai
      ) VALUES (
        'C46NCC01', N'C46 Supplier', '0846100001', 'supplier@c46.test',
        N'C46 Address', 'C46-TAX-01', 'ACTIVE'
      );

      INSERT INTO dbo.LO_HANG (
        MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
      ) VALUES
        ('C46L001', 'C46P001', 'C46-LOT-001', '2026-01-01', '2099-12-31', 50, 5, 'ACTIVE'),
        ('C46L002', 'C46P002', 'C46-LOT-002', '2026-01-01', '2099-12-31', 20, 10, 'ACTIVE');

      DECLARE @ShiftId BIGINT;
      INSERT INTO dbo.CA_LAM_VIEC (
        MaNV, GioBatDau, GioKetThuc, TienDauCa, TienCuoiCa, TrangThai, GhiChu
      ) VALUES (
        'C46CASH', '2026-10-01T08:00:00', '2026-10-01T16:00:00',
        100, 300, 'CLOSED', N'C46 report shift'
      );
      SET @ShiftId = SCOPE_IDENTITY();

      INSERT INTO dbo.HOA_DON (
        MaHD, NgayLap, MaCa, MaKH, TongTienHang, TongGiamGia,
        TongThanhToan, DiemSuDung, DiemTichLuy, TrangThai, GhiChu
      ) VALUES (
        'C46HD001', '2026-10-01T10:00:00', @ShiftId, NULL,
        200, 0, 200, 0, 0, 'PAID', N'C46 report invoice'
      );

      DECLARE @LineId BIGINT;
      INSERT INTO dbo.CHI_TIET_HOA_DON (MaHD, MaSP, MaKM, SoLuong, DonGiaBan, TienGiam)
      VALUES ('C46HD001', 'C46P001', NULL, 2, 100, 0);
      SET @LineId = SCOPE_IDENTITY();

      INSERT INTO dbo.CHI_TIET_XUAT_LO (MaCTHD, MaLo, SoLuong)
      VALUES (@LineId, 'C46L001', 2);

      INSERT INTO dbo.THANH_TOAN (MaHD, ThoiGian, PhuongThuc, SoTien, TrangThai)
      VALUES ('C46HD001', '2026-10-01T10:00:00', 'CASH', 200, 'SUCCESS');

      INSERT INTO dbo.PHIEU_TRA (MaPT, MaHD, MaNV, NgayTra, LyDo, TongTienHoan, TrangThai)
      VALUES (
        'C46PT001', 'C46HD001', 'C46CASH', '2026-10-02T09:00:00',
        N'C46 partial return', 100, 'COMPLETED'
      );
      INSERT INTO dbo.CHI_TIET_PHIEU_TRA (
        MaPT, MaCTHD, MaLo, SoLuongTra, TienHoan, TinhTrangHang
      ) VALUES ('C46PT001', @LineId, 'C46L001', 1, 100, 'DAMAGED');

      INSERT INTO dbo.PHIEU_NHAP (
        MaPN, NgayNhap, MaNV, MaNCC, TongTien, TrangThai, NgayXacNhan, GhiChu
      ) VALUES (
        'C46PN001', '2026-10-01T07:00:00', 'C46WARE', 'C46NCC01',
        200, 'CONFIRMED', '2026-10-01T07:30:00', N'C46 confirmed receiving'
      );
      INSERT INTO dbo.CHI_TIET_PHIEU_NHAP (MaPN, MaLo, SoLuong, DonGiaNhap)
      VALUES ('C46PN001', 'C46L002', 10, 20);
    `,
    parameters: {
      PasswordHash: { type: sql.VarChar(255), value: passwordHash },
    },
  });

  const managerToken = await login(baseUrl, 'c46.manager', password);
  const cashierToken = await login(baseUrl, 'c46.cashier', password);
  const period = 'from=2026-10-01&to=2026-10-02';

  let result = await requestJson(baseUrl, `/api/admin/reports/revenue?${period}`, managerToken);
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload.data.summary, {
    from: '2026-10-01', to: '2026-10-02', completedInvoiceCount: 1,
    grossRevenue: 200, refundAmount: 100, netRevenue: 100,
  });
  assert.deepEqual(result.payload.data.trend.map((row) => row.netRevenue), [200, -100]);

  result = await requestJson(
    baseUrl,
    `/api/admin/reports/products?${period}&limit=100`,
    managerToken,
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.categories[0].categoryId, 'C46CAT01');
  assert.equal(result.payload.data.categories[0].netRevenue, 100);
  assert.equal(result.payload.data.bestProducts[0].productId, 'C46P001');
  assert.ok(result.payload.data.slowProducts.some((item) => item.productId === 'C46P002'));

  result = await requestJson(
    baseUrl,
    '/api/admin/reports/inventory?page=1&pageSize=100',
    managerToken,
  );
  assert.equal(result.response.status, 200);
  const inventoryProduct = result.payload.data.items.find((item) => item.productId === 'C46P001');
  assert.equal(inventoryProduct.totalStock, 5);
  assert.equal(inventoryProduct.inventoryCostValue, 250);
  assert.ok(result.payload.data.summary.inventoryCostValue >= 450);

  result = await requestJson(
    baseUrl,
    `/api/admin/reports/receiving?${period}&page=1&pageSize=5`,
    managerToken,
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.summary.confirmedReceiptCount, 1);
  assert.equal(result.payload.data.summary.receivingCost, 200);
  assert.equal(result.payload.data.suppliers.items[0].supplierId, 'C46NCC01');

  result = await requestJson(
    baseUrl,
    `/api/admin/reports/employees?${period}&page=1&pageSize=5`,
    managerToken,
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.items[0].employeeId, 'C46CASH');
  assert.equal(result.payload.data.items[0].netRevenue, 100);

  result = await requestJson(
    baseUrl,
    `/api/admin/reports/shifts?${period}&page=1&pageSize=5`,
    managerToken,
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.data.items[0].employee.employeeId, 'C46CASH');
  assert.equal(result.payload.data.items[0].cashDifference, 0);

  result = await requestJson(baseUrl, `/api/admin/reports/revenue?${period}`, cashierToken);
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.error.code, 'FORBIDDEN');

  result = await requestJson(
    baseUrl,
    '/api/admin/reports/revenue?from=2026-10-03&to=2026-10-02',
    managerToken,
  );
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'VALIDATION_ERROR');

  result = await requestJson(
    baseUrl,
    `/api/admin/reports/products?${period}&limit=101`,
    managerToken,
  );
  assert.equal(result.response.status, 400);

  result = await requestJson(
    baseUrl,
    `/api/admin/reports/revenue?${period}&unsupported=true`,
    managerToken,
  );
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.error.code, 'VALIDATION_ERROR');
});
