:ON ERROR EXIT

USE [$(DatabaseName)];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF DB_NAME() IN ('master', 'model', 'msdb', 'tempdb') OR DB_NAME() NOT LIKE '%Test'
    THROW 53601, 'Index benchmark data may run only in a database whose name ends with Test.', 1;

IF DB_NAME() <> N'ConvenienceStoreIndexBenchmarkTest'
    THROW 53602, 'This benchmark script is restricted to ConvenienceStoreIndexBenchmarkTest.', 1;

IF (SELECT COUNT(*) FROM dbo.SCHEMA_MIGRATIONS) <> 7
   OR NOT EXISTS (SELECT 1 FROM dbo.SCHEMA_MIGRATIONS WHERE MigrationId = '006_add_dbms_database_roles')
    THROW 53603, 'Apply migrations 000-006 before generating benchmark data.', 1;

IF EXISTS (SELECT 1 FROM dbo.SAN_PHAM WHERE MaSP LIKE 'BP%')
   OR EXISTS (SELECT 1 FROM dbo.TAI_KHOAN WHERE TenDangNhap LIKE 'bench.user.%')
   OR EXISTS (SELECT 1 FROM dbo.NHAT_KY_HE_THONG WHERE MaBanGhi LIKE 'BKK%')
    THROW 53604, 'Benchmark fixtures already exist; rebuild the disposable database instead of appending another dataset.', 1;
GO

DECLARE
    @AccountRows INT = 20000,
    @ProductRows INT = 10000,
    @LotRows INT = 100000,
    @InvoiceRows INT = 100000,
    @AuditRows INT = 200000,
    @ReceiptRows INT = 50000,
    @SupplierRows INT = 1000,
    @CategoryRows INT = 20;

CREATE TABLE #Numbers (n INT NOT NULL PRIMARY KEY);

;WITH E1(n) AS (
    SELECT 1 FROM (VALUES (0),(0),(0),(0),(0),(0),(0),(0),(0),(0)) AS source(n)
), E2(n) AS (SELECT 1 FROM E1 a CROSS JOIN E1 b),
E4(n) AS (SELECT 1 FROM E2 a CROSS JOIN E2 b),
E8(n) AS (SELECT 1 FROM E4 a CROSS JOIN E4 b)
INSERT INTO #Numbers (n)
SELECT TOP (@AuditRows) CONVERT(INT, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)))
FROM E8;

BEGIN TRANSACTION;

INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, MoTa, TrangThai)
SELECT
    CONCAT('BC', RIGHT(CONCAT('00000000', n), 8)),
    CONCAT(N'Danh mục benchmark ', n),
    N'Dữ liệu tổng hợp cho benchmark index',
    CASE WHEN n % 10 = 0 THEN 'INACTIVE' ELSE 'ACTIVE' END
FROM #Numbers
WHERE n <= @CategoryRows;

INSERT INTO dbo.KHACH_HANG (
    MaKH, HoTen, SDT, Email, DiaChi, NgaySinh,
    DiemTichLuy, HangThanhVien, NgayDangKy, TrangThai
)
SELECT
    CONCAT('BK', RIGHT(CONCAT('00000000', n), 8)),
    CONCAT(N'Khách benchmark ', n),
    CONCAT('09', RIGHT(CONCAT('0000000000', n), 10)),
    CONCAT('benchmark.customer.', n, '@example.invalid'),
    N'Địa chỉ dữ liệu tổng hợp',
    DATEADD(DAY, -(7000 + n % 12000), CONVERT(DATE, '2026-01-01')),
    n % 5000,
    CASE n % 4 WHEN 0 THEN 'BRONZE' WHEN 1 THEN 'SILVER' WHEN 2 THEN 'GOLD' ELSE 'DIAMOND' END,
    DATEADD(MINUTE, n * 10, CONVERT(DATETIME2(0), '2025-01-01T00:00:00')),
    CASE WHEN n % 20 = 0 THEN 'INACTIVE' ELSE 'ACTIVE' END
FROM #Numbers
WHERE n <= @AccountRows;

INSERT INTO dbo.TAI_KHOAN (
    TenDangNhap, MatKhauHash, MaVaiTro, MaNV, MaKH,
    LanDangNhapCuoi, TrangThai, NgayTao
)
SELECT
    CONCAT('bench.user.', RIGHT(CONCAT('000000000', n), 9)),
    'BENCHMARK-NOT-A-REAL-PASSWORD-HASH',
    'CUSTOMER',
    NULL,
    CONCAT('BK', RIGHT(CONCAT('00000000', n), 8)),
    DATEADD(MINUTE, n * 10 + 5, CONVERT(DATETIME2(0), '2025-01-01T00:00:00')),
    CASE WHEN n % 25 = 0 THEN 'LOCKED' ELSE 'ACTIVE' END,
    DATEADD(MINUTE, n * 10, CONVERT(DATETIME2(0), '2025-01-01T00:00:00'))
FROM #Numbers
WHERE n <= @AccountRows;

INSERT INTO dbo.SAN_PHAM (
    MaSP, TenSP, MaVach, DonViTinh, GiaBan, ImageUrl,
    MucTonToiThieu, MaLoai, TrangThai
)
SELECT
    CONCAT('BP', RIGHT(CONCAT('00000000', n), 8)),
    CONCAT(N'Sản phẩm benchmark ', RIGHT(CONCAT('00000000', n), 8)),
    CONCAT('BENCH', RIGHT(CONCAT('000000000000', n), 12)),
    CASE WHEN n % 3 = 0 THEN N'Chai' WHEN n % 3 = 1 THEN N'Hộp' ELSE N'Cái' END,
    CONVERT(DECIMAL(18,2), 5000 + (n % 500) * 100),
    NULL,
    n % 50,
    CONCAT('BC', RIGHT(CONCAT('00000000', ((n - 1) % @CategoryRows) + 1), 8)),
    CASE WHEN n % 10 = 0 THEN 'INACTIVE' ELSE 'ACTIVE' END
FROM #Numbers
WHERE n <= @ProductRows;

INSERT INTO dbo.LO_HANG (
    MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung,
    GiaNhap, SoLuongTon, TrangThai
)
SELECT
    CONCAT('BL', RIGHT(CONCAT('000000000', n), 9)),
    CONCAT('BP', RIGHT(CONCAT('00000000', ((n - 1) % @ProductRows) + 1), 8)),
    CONCAT('BENCH-LOT-', RIGHT(CONCAT('000000000', n), 9)),
    DATEADD(DAY, n % 365, CONVERT(DATE, '2024-01-01')),
    DATEADD(DAY, 366 + (n % 900), CONVERT(DATE, '2024-01-01')),
    CONVERT(DECIMAL(18,2), 3000 + (n % 300) * 100),
    CASE WHEN n % 5 = 0 THEN 0 ELSE 1 + n % 100 END,
    CASE WHEN n % 10 = 0 THEN 'EXPIRED' WHEN n % 10 = 1 THEN 'BLOCKED' ELSE 'ACTIVE' END
FROM #Numbers
WHERE n <= @LotRows;

INSERT INTO dbo.NHA_CUNG_CAP (MaNCC, TenNCC, SDT, Email, DiaChi, MaSoThue, TrangThai)
SELECT
    CONCAT('BN', RIGHT(CONCAT('00000000', n), 8)),
    CONCAT(N'Nhà cung cấp benchmark ', RIGHT(CONCAT('00000000', n), 8)),
    CONCAT('08', RIGHT(CONCAT('0000000000', n), 10)),
    CONCAT('benchmark.supplier.', n, '@example.invalid'),
    N'Địa chỉ dữ liệu tổng hợp',
    CONCAT('TAX-BENCH-', RIGHT(CONCAT('00000000', n), 8)),
    CASE WHEN n % 20 = 0 THEN 'INACTIVE' ELSE 'ACTIVE' END
FROM #Numbers
WHERE n <= @SupplierRows;

INSERT INTO dbo.CA_LAM_VIEC (
    MaNV, GioBatDau, GioKetThuc, TienDauCa, TienCuoiCa, TrangThai, GhiChu
)
VALUES (
    'NVDEV001', '2025-01-01T00:00:00', '2027-01-01T00:00:00',
    100000, 100000, 'CLOSED', N'Ca tổng hợp cho benchmark index'
);

DECLARE @BenchmarkShiftId BIGINT = SCOPE_IDENTITY();

INSERT INTO dbo.HOA_DON (
    MaHD, NgayLap, MaCa, MaKH, TongTienHang, TongGiamGia,
    TongThanhToan, DiemSuDung, DiemTichLuy, TrangThai, GhiChu
)
SELECT
    CONCAT('BH', RIGHT(CONCAT('000000000', n), 9)),
    DATEADD(MINUTE, n * 10, CONVERT(DATETIME2(0), '2025-01-01T00:00:00')),
    @BenchmarkShiftId,
    CASE WHEN n % 4 = 0 THEN NULL ELSE CONCAT('BK', RIGHT(CONCAT('00000000', ((n - 1) % @AccountRows) + 1), 8)) END,
    CONVERT(DECIMAL(18,2), 10000 + (n % 1000) * 100),
    CONVERT(DECIMAL(18,2), CASE WHEN n % 5 = 0 THEN 1000 ELSE 0 END),
    CONVERT(DECIMAL(18,2), 10000 + (n % 1000) * 100 - CASE WHEN n % 5 = 0 THEN 1000 ELSE 0 END),
    0,
    n % 100,
    CASE WHEN n % 10 < 7 THEN 'PAID' WHEN n % 10 = 7 THEN 'DRAFT' WHEN n % 10 = 8 THEN 'CANCELLED' ELSE 'REFUNDED' END,
    N'Dữ liệu tổng hợp benchmark'
FROM #Numbers
WHERE n <= @InvoiceRows;

INSERT INTO dbo.PHIEU_NHAP (
    MaPN, NgayNhap, MaNV, MaNCC, TongTien, TrangThai, NgayXacNhan, GhiChu
)
SELECT
    CONCAT('BR', RIGHT(CONCAT('000000000', n), 9)),
    DATEADD(MINUTE, n * 20, CONVERT(DATETIME2(0), '2025-01-01T00:00:00')),
    'NVDEV001',
    CONCAT('BN', RIGHT(CONCAT('00000000', ((n - 1) % @SupplierRows) + 1), 8)),
    CONVERT(DECIMAL(18,2), (n % 5000) * 100),
    CASE WHEN n % 10 < 6 THEN 'DRAFT' WHEN n % 10 < 9 THEN 'CONFIRMED' ELSE 'CANCELLED' END,
    CASE WHEN n % 10 BETWEEN 6 AND 8 THEN DATEADD(MINUTE, n * 20 + 30, CONVERT(DATETIME2(0), '2025-01-01T00:00:00')) ELSE NULL END,
    N'Dữ liệu tổng hợp benchmark'
FROM #Numbers
WHERE n <= @ReceiptRows;

INSERT INTO dbo.NHAT_KY_HE_THONG (
    MaTK, HanhDong, TenBang, MaBanGhi, DuLieuCu, DuLieuMoi, ThoiGian, DiaChiIP
)
SELECT
    CASE WHEN n % 5 = 0 THEN 1 + ((n - 1) % @AccountRows) ELSE NULL END,
    CASE n % 5 WHEN 0 THEN 'CREATE' WHEN 1 THEN 'UPDATE' WHEN 2 THEN 'STATUS_CHANGE' WHEN 3 THEN 'APPROVE' ELSE 'LOGIN' END,
    CASE n % 10 WHEN 0 THEN 'KIEM_KE' WHEN 1 THEN 'SAN_PHAM' WHEN 2 THEN 'HOA_DON' WHEN 3 THEN 'PHIEU_NHAP' WHEN 4 THEN 'KHACH_HANG' ELSE 'SYSTEM_EVENT' END,
    CASE WHEN n % 10 < 5 THEN CONCAT('BKK', RIGHT(CONCAT('0000000', n % 5000), 7)) ELSE NULL END,
    NULL,
    N'{"benchmark":true}',
    DATEADD(MINUTE, n * 5, CONVERT(DATETIME2(0), '2025-01-01T00:00:00')),
    CONCAT('10.0.', n % 250, '.', (n / 250) % 250)
FROM #Numbers
WHERE n <= @AuditRows;

COMMIT TRANSACTION;

UPDATE STATISTICS dbo.TAI_KHOAN WITH FULLSCAN;
UPDATE STATISTICS dbo.SAN_PHAM WITH FULLSCAN;
UPDATE STATISTICS dbo.LO_HANG WITH FULLSCAN;
UPDATE STATISTICS dbo.HOA_DON WITH FULLSCAN;
UPDATE STATISTICS dbo.NHAT_KY_HE_THONG WITH FULLSCAN;
UPDATE STATISTICS dbo.PHIEU_NHAP WITH FULLSCAN;
GO

SELECT 'TAI_KHOAN' AS TableName, COUNT_BIG(*) AS [RowCount] FROM dbo.TAI_KHOAN
UNION ALL SELECT 'SAN_PHAM', COUNT_BIG(*) FROM dbo.SAN_PHAM
UNION ALL SELECT 'LO_HANG', COUNT_BIG(*) FROM dbo.LO_HANG
UNION ALL SELECT 'HOA_DON', COUNT_BIG(*) FROM dbo.HOA_DON
UNION ALL SELECT 'NHAT_KY_HE_THONG', COUNT_BIG(*) FROM dbo.NHAT_KY_HE_THONG
UNION ALL SELECT 'PHIEU_NHAP', COUNT_BIG(*) FROM dbo.PHIEU_NHAP
ORDER BY TableName;
GO

PRINT 'Synthetic benchmark dataset generated and target-table statistics updated with FULLSCAN.';
GO
