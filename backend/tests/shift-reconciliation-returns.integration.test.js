'use strict';

const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const { closePool } = require('../src/config/database.pool');
const { BaseRepository } = require('../src/repositories/base.repository');
const { PosRepository } = require('../src/repositories/pos.repository');
const { PosService } = require('../src/services/pos.service');

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === 'true' ? test : test.skip;
const employeeId = 'RBSCASH';

async function cleanupTestRows() {
  if (process.env.RUN_DB_INTEGRATION_TESTS !== 'true') return;
  try {
    const repository = new BaseRepository();
    await repository.query({
      text: `
        DELETE FROM dbo.PHIEU_TRA WHERE MaHD LIKE 'RBS%';
        DELETE FROM dbo.THANH_TOAN WHERE MaHD LIKE 'RBS%';
        DELETE FROM dbo.HOA_DON WHERE MaHD LIKE 'RBS%';
        DELETE FROM dbo.CA_LAM_VIEC WHERE MaNV = 'RBSCASH';
        DELETE FROM dbo.NHAN_VIEN WHERE MaNV IN ('RBSCASH', 'RBSRET');
      `,
    });
  } finally {
    await closePool();
  }
}

function assertMoney(actual, expected) {
  assert.equal(Number(actual), expected);
}

function assertReconciliation(row, expected) {
  assertMoney(row.DoanhThuGop, expected.gross);
  assertMoney(row.TongTienHoan, expected.refund);
  assertMoney(row.DoanhThuThuan, expected.net);
  assertMoney(row.DoanhThuTienMat, expected.cash);
  assertMoney(row.DoanhThuKhongTienMat, expected.nonCash);
  assert.equal(
    Number(row.DoanhThuTienMat) + Number(row.DoanhThuKhongTienMat),
    Number(row.DoanhThuThuan),
  );
}

after(cleanupTestRows);

integrationTest('shift reconciliation is net of completed returns by original shift and payment method', async () => {
  const repository = new BaseRepository();
  const posRepository = new PosRepository();
  await cleanupTestRows();

  const fixture = await repository.query({
    text: `
      INSERT INTO dbo.NHAN_VIEN (MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai)
      VALUES
        (@EmployeeId, N'Reconciliation Cashier', '0899900101', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE'),
        ('RBSRET', N'Return Processing Cashier', '0899900102', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE');

      INSERT INTO dbo.CA_LAM_VIEC
        (MaNV, GioBatDau, GioKetThuc, TienDauCa, TienCuoiCa, TrangThai)
      VALUES (@EmployeeId, DATEADD(HOUR, -10, SYSDATETIME()), DATEADD(HOUR, -9, SYSDATETIME()), 0, 12000, 'CLOSED');
      DECLARE @ShiftA BIGINT = SCOPE_IDENTITY();
      INSERT INTO dbo.CA_LAM_VIEC
        (MaNV, GioBatDau, GioKetThuc, TienDauCa, TienCuoiCa, TrangThai)
      VALUES (@EmployeeId, DATEADD(HOUR, -8, SYSDATETIME()), DATEADD(HOUR, -7, SYSDATETIME()), 1000, 9000, 'CLOSED');
      DECLARE @ShiftB BIGINT = SCOPE_IDENTITY();
      INSERT INTO dbo.CA_LAM_VIEC
        (MaNV, GioBatDau, GioKetThuc, TienDauCa, TienCuoiCa, TrangThai)
      VALUES (@EmployeeId, DATEADD(HOUR, -6, SYSDATETIME()), DATEADD(HOUR, -5, SYSDATETIME()), 0, 0, 'CLOSED');
      DECLARE @ShiftC BIGINT = SCOPE_IDENTITY();
      INSERT INTO dbo.CA_LAM_VIEC
        (MaNV, GioBatDau, GioKetThuc, TienDauCa, TienCuoiCa, TrangThai)
      VALUES (@EmployeeId, DATEADD(HOUR, -4, SYSDATETIME()), DATEADD(HOUR, -3, SYSDATETIME()), 0, 0, 'CLOSED');
      DECLARE @ShiftD BIGINT = SCOPE_IDENTITY();
      INSERT INTO dbo.CA_LAM_VIEC (MaNV, GioBatDau, TienDauCa, TrangThai)
      VALUES (@EmployeeId, DATEADD(HOUR, -2, SYSDATETIME()), 1000, 'OPEN');
      DECLARE @ShiftE BIGINT = SCOPE_IDENTITY();

      INSERT INTO dbo.HOA_DON
        (MaHD, NgayLap, MaCa, TongTienHang, TongGiamGia, TongThanhToan,
         DiemSuDung, DiemTichLuy, TrangThai)
      VALUES
        ('RBSAINV', SYSDATETIME(), @ShiftA, 12000, 0, 12000, 0, 0, 'PAID'),
        ('RBSBINV', SYSDATETIME(), @ShiftB, 12000, 0, 12000, 0, 0, 'PAID'),
        ('RBSCINV', SYSDATETIME(), @ShiftC, 12000, 0, 12000, 0, 0, 'REFUNDED'),
        ('RBSDINV', SYSDATETIME(), @ShiftD, 12000, 0, 12000, 0, 0, 'PAID'),
        ('RBSECSH', SYSDATETIME(), @ShiftE, 12000, 0, 12000, 0, 0, 'PAID'),
        ('RBSECARD', SYSDATETIME(), @ShiftE, 20000, 0, 20000, 0, 0, 'PAID');

      INSERT INTO dbo.THANH_TOAN (MaHD, PhuongThuc, SoTien, TrangThai)
      VALUES
        ('RBSAINV', 'CASH', 12000, 'SUCCESS'),
        ('RBSBINV', 'CASH', 12000, 'SUCCESS'),
        ('RBSCINV', 'CASH', 12000, 'REFUNDED'),
        ('RBSDINV', 'CARD', 12000, 'SUCCESS'),
        ('RBSECSH', 'CASH', 12000, 'SUCCESS'),
        ('RBSECARD', 'TRANSFER', 20000, 'SUCCESS');

      INSERT INTO dbo.PHIEU_TRA
        (MaPT, MaHD, MaNV, NgayTra, LyDo, TongTienHoan, TrangThai)
      VALUES
        ('RBSBPT', 'RBSBINV', @EmployeeId, SYSDATETIME(), N'Partial cash refund', 4000, 'COMPLETED'),
        ('RBSCPT', 'RBSCINV', @EmployeeId, SYSDATETIME(), N'Full cash refund', 12000, 'COMPLETED'),
        ('RBSDPT', 'RBSDINV', 'RBSRET', SYSDATETIME(), N'Partial card refund by another cashier', 4000, 'COMPLETED'),
        ('RBSEPT1', 'RBSECSH', @EmployeeId, SYSDATETIME(), N'Cash return', 4000, 'COMPLETED'),
        ('RBSEPT2', 'RBSECARD', @EmployeeId, SYSDATETIME(), N'Transfer return', 5000, 'COMPLETED');

      SELECT @ShiftA AS ShiftA, @ShiftB AS ShiftB, @ShiftC AS ShiftC,
             @ShiftD AS ShiftD, @ShiftE AS ShiftE;
    `,
    parameters: {
      EmployeeId: { type: posRepository.sql.VarChar(10), value: employeeId },
    },
  });
  const shifts = fixture.recordset[0];

  const scenarioA = await posRepository.getShiftReconciliation(shifts.ShiftA, employeeId);
  assertReconciliation(scenarioA, { gross: 12000, refund: 0, net: 12000, cash: 12000, nonCash: 0 });

  const scenarioB = await posRepository.getShiftReconciliation(shifts.ShiftB, employeeId);
  assertReconciliation(scenarioB, { gross: 12000, refund: 4000, net: 8000, cash: 8000, nonCash: 0 });
  assertMoney(Number(scenarioB.TienDauCa) + Number(scenarioB.DoanhThuTienMat), 9000);

  const scenarioC = await posRepository.getShiftReconciliation(shifts.ShiftC, employeeId);
  assertReconciliation(scenarioC, { gross: 12000, refund: 12000, net: 0, cash: 0, nonCash: 0 });

  const scenarioD = await posRepository.getShiftReconciliation(shifts.ShiftD, employeeId);
  assertReconciliation(scenarioD, { gross: 12000, refund: 4000, net: 8000, cash: 0, nonCash: 8000 });

  const scenarioE = await posRepository.getShiftReconciliation(shifts.ShiftE, employeeId);
  assertReconciliation(scenarioE, { gross: 32000, refund: 9000, net: 23000, cash: 8000, nonCash: 15000 });

  const service = new PosService({ posRepository });
  const identity = { employeeId, role: 'CASHIER' };
  const beforeClose = await service.getShiftReconciliation(identity, String(shifts.ShiftE));
  assert.equal(beforeClose.reconciliation.expectedCash, 9000);
  const closed = await service.closeShift(identity, String(shifts.ShiftE), {
    closingCash: 9000,
    note: 'Return-aware reconciliation',
  });
  assert.deepEqual(
    {
      cashRevenue: closed.reconciliation.cashRevenue,
      expectedCash: closed.reconciliation.expectedCash,
      grossRevenue: closed.reconciliation.grossRevenue,
      netRevenue: closed.reconciliation.netRevenue,
      nonCashRevenue: closed.reconciliation.nonCashRevenue,
      refundTotal: closed.reconciliation.refundTotal,
    },
    {
      cashRevenue: 8000,
      expectedCash: 9000,
      grossRevenue: 32000,
      netRevenue: 23000,
      nonCashRevenue: 15000,
      refundTotal: 9000,
    },
  );
  assert.equal(closed.reconciliation.status, 'CLOSED');
  assert.equal(closed.reconciliation.difference, 0);

  const persisted = await posRepository.getShiftReconciliation(shifts.ShiftE, employeeId);
  assert.equal(persisted.TrangThai, 'CLOSED');
  assertMoney(persisted.TienCuoiCa, 9000);
  assertReconciliation(persisted, { gross: 32000, refund: 9000, net: 23000, cash: 8000, nonCash: 15000 });
});
