:ON ERROR EXIT

USE [$(DatabaseName)];
GO

SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF DB_NAME() <> N'ConvenienceStoreIndexBenchmarkTest' OR DB_NAME() NOT LIKE N'%Test'
    THROW 53610, 'Index benchmark queries may run only in ConvenienceStoreIndexBenchmarkTest.', 1;

IF (SELECT COUNT(*) FROM dbo.SCHEMA_MIGRATIONS) <> 7
    THROW 53611, 'Apply migrations 000-006 before running the benchmark.', 1;
GO

/*
This file is the SSMS-readable workload catalog used by run_index_benchmark.ps1.
The PowerShell runner safely drops/recreates each exact index, performs one warmup
plus five measured executions, enables STATISTICS IO/TIME, saves actual XML plans,
and asserts count/checksum equivalence. No index hints or global cache flushes are used.

For a visual demo: rebuild/generate the benchmark database, press Ctrl+M in SSMS,
enable SET STATISTICS IO/TIME below, then execute an individual query before and
after dropping/recreating its index using the exact DDL in the runner.
*/

SET STATISTICS IO ON;
SET STATISTICS TIME ON;
GO

-- 1. Authentication lookup: dbo.usp_TAI_KHOAN_LayTheoTenDangNhap.
SELECT MaTK, TenDangNhap, MatKhauHash, MaVaiTro, MaNV, MaKH, TrangThai, LanDangNhapCuoi
FROM dbo.TAI_KHOAN
WHERE TenDangNhap = 'bench.user.000010000'
OPTION (RECOMPILE);
GO

-- 2. Positive-stock lot lookup used by inventory/lot querying.
SELECT MaLo, SoLo, NgaySanXuat, HanSuDung, SoLuongTon, TrangThai, GiaNhap
FROM dbo.LO_HANG
WHERE MaSP = 'BP00000001'
  AND SoLuongTon > 0
ORDER BY HanSuDung, MaLo
OPTION (RECOMPILE);
GO

-- 3. Paid-invoice date-range aggregation used by reporting.
SELECT TrangThai, MaCa, COUNT_BIG(*) AS SoHoaDon, SUM(TongThanhToan) AS DoanhThu
FROM dbo.HOA_DON
WHERE TrangThai = 'PAID'
  AND NgayLap >= '2026-01-01'
  AND NgayLap < '2026-04-01'
GROUP BY TrangThai, MaCa
OPTION (RECOMPILE);
GO

-- 4. Audit target investigation used by usp_NHAT_KY_HE_THONG_TraCuu.
SELECT TOP (40) MaNhatKy, MaTK, HanhDong, TenBang, MaBanGhi, ThoiGian, DiaChiIP
FROM dbo.NHAT_KY_HE_THONG
WHERE TenBang = 'SAN_PHAM'
  AND MaBanGhi = 'BKK0000001'
ORDER BY ThoiGian DESC, MaNhatKy DESC
OPTION (RECOMPILE);
GO

-- 5. Receipt status/date page used by ReceivingRepository.listReceipts.
SELECT TOP (50) MaPN, NgayNhap, MaNV, MaNCC, TongTien, TrangThai, NgayXacNhan
FROM dbo.PHIEU_NHAP
WHERE TrangThai = 'CANCELLED'
ORDER BY NgayNhap DESC, MaPN DESC
OPTION (RECOMPILE);
GO

SET STATISTICS TIME OFF;
SET STATISTICS IO OFF;
GO

PRINT 'Five representative index workloads completed. Use run_index_benchmark.ps1 for controlled BEFORE/AFTER evidence.';
GO
