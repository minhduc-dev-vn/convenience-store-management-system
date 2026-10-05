SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.vw_BAO_CAO_DOANH_THU_SU_KIEN', 'V') IS NULL
   OR OBJECT_ID('dbo.vw_BAO_CAO_HANG_HOA_SU_KIEN', 'V') IS NULL
   OR OBJECT_ID('dbo.vw_BAO_CAO_TON_KHO_HIEN_TAI', 'V') IS NULL
   OR OBJECT_ID('dbo.vw_BAO_CAO_NHAP_HANG_HOP_LE', 'V') IS NULL
   OR OBJECT_ID('dbo.usp_BAO_CAO_DoanhThuTongQuan', 'P') IS NULL
   OR OBJECT_ID('dbo.usp_BAO_CAO_XuHuongDoanhThu', 'P') IS NULL
   OR OBJECT_ID('dbo.usp_BAO_CAO_DoanhThuTheoNganhHang', 'P') IS NULL
   OR OBJECT_ID('dbo.usp_BAO_CAO_XepHangSanPham', 'P') IS NULL
   OR OBJECT_ID('dbo.usp_BAO_CAO_NhapHangTongQuan', 'P') IS NULL
   OR OBJECT_ID('dbo.usp_BAO_CAO_NhapHangTheoNhaCungCap', 'P') IS NULL
   OR OBJECT_ID('dbo.usp_BAO_CAO_DoanhThuNhanVien', 'P') IS NULL
   OR OBJECT_ID('dbo.usp_BAO_CAO_CaLamViec', 'P') IS NULL
    THROW 52900, 'One or more C45 report objects are missing.', 1;

IF (
    SELECT COUNT(*) FROM sys.tables
    WHERE schema_id = SCHEMA_ID('dbo') AND name <> 'SCHEMA_MIGRATIONS'
) <> 23
    THROW 52901, 'C45 must preserve exactly 23 dbo core tables.', 1;

DECLARE @RequiredIndexes TABLE (TableName SYSNAME, IndexName SYSNAME);
INSERT INTO @RequiredIndexes (TableName, IndexName)
VALUES
    ('HOA_DON', 'IX_HOA_DON_BaoCao_TrangThai_NgayLap'),
    ('PHIEU_TRA', 'IX_PHIEU_TRA_BaoCao_TrangThai_NgayTra'),
    ('PHIEU_NHAP', 'IX_PHIEU_NHAP_BaoCao_TrangThai_NgayXacNhan'),
    ('CA_LAM_VIEC', 'IX_CA_LAM_VIEC_BaoCao_GioBatDau'),
    ('CHI_TIET_PHIEU_TRA', 'IX_CHI_TIET_PHIEU_TRA_BaoCao_MaPT');

IF EXISTS (
    SELECT 1
    FROM @RequiredIndexes AS required
    WHERE NOT EXISTS (
        SELECT 1
        FROM sys.indexes AS actual
        WHERE actual.object_id = OBJECT_ID(N'dbo.' + required.TableName)
          AND actual.name = required.IndexName
          AND actual.is_disabled = 0
    )
)
    THROW 52902, 'One or more C45 report indexes are missing or disabled.', 1;

DECLARE @ValidationRejected BIT = 0;
BEGIN TRY
    EXEC dbo.usp_BAO_CAO_DoanhThuTongQuan @TuNgay = '2026-09-03', @DenNgay = '2026-09-01';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 51910 SET @ValidationRejected = 1;
    ELSE THROW;
END CATCH;

IF @ValidationRejected = 0
    THROW 52914, 'Invalid report date range was not rejected.', 1;

SET @ValidationRejected = 0;
BEGIN TRY
    EXEC dbo.usp_BAO_CAO_XepHangSanPham
        @TuNgay = '2026-09-01', @DenNgay = '2026-09-02', @Kieu = 'UNKNOWN', @SoLuong = 10;
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 51911 SET @ValidationRejected = 1;
    ELSE THROW;
END CATCH;

IF @ValidationRejected = 0
    THROW 52915, 'Invalid product ranking type was not rejected.', 1;

BEGIN TRANSACTION;

INSERT INTO dbo.NHAN_VIEN (
    MaNV, HoTen, SDT, Email, NgayVaoLam, LuongCoBan, TrangThai
)
VALUES
    ('C45CA001', N'Thu ngân C45 Một', '0845000001', 'cashier.one@c45.test', '2026-01-01', 0, 'ACTIVE'),
    ('C45CA002', N'Thu ngân C45 Hai', '0845000002', 'cashier.two@c45.test', '2026-01-01', 0, 'ACTIVE'),
    ('C45WH001', N'Nhân viên kho C45', '0845000003', 'warehouse@c45.test', '2026-01-01', 0, 'ACTIVE');

INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, MoTa, TrangThai)
VALUES
    ('C45CAT01', N'Đồ uống C45', N'Danh mục fixture báo cáo C45.', 'ACTIVE'),
    ('C45CAT02', N'Gia dụng C45', N'Danh mục fixture bán chậm C45.', 'ACTIVE');

INSERT INTO dbo.SAN_PHAM (
    MaSP, TenSP, MaVach, DonViTinh, GiaBan, MucTonToiThieu, MaLoai, TrangThai
)
VALUES
    ('C45P001', N'Sản phẩm bán chạy C45', 'C45-BAR-001', N'Chai', 100.00, 2, 'C45CAT01', 'ACTIVE'),
    ('C45P002', N'Sản phẩm bán vừa C45', 'C45-BAR-002', N'Hộp', 80.00, 2, 'C45CAT01', 'ACTIVE'),
    ('C45P003', N'Sản phẩm bán chậm C45', 'C45-BAR-003', N'Cái', 20.00, 2, 'C45CAT02', 'ACTIVE');

INSERT INTO dbo.NHA_CUNG_CAP (MaNCC, TenNCC, SDT, Email, DiaChi, MaSoThue, TrangThai)
VALUES ('C45NCC01', N'Nhà cung cấp C45', '0845100001', 'supplier@c45.test', N'Địa chỉ C45', 'C45-TAX-01', 'ACTIVE');

INSERT INTO dbo.LO_HANG (
    MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
)
VALUES
    ('C45L001', 'C45P001', 'C45-LOT-001', '2026-01-01', '2099-12-31', 60.00, 4, 'ACTIVE'),
    ('C45L002', 'C45P001', 'C45-LOT-002', '2026-01-01', '2099-12-31', 50.00, 2, 'BLOCKED'),
    ('C45L003', 'C45P002', 'C45-LOT-003', '2025-01-01', '2025-12-31', 30.00, 3, 'EXPIRED'),
    ('C45L004', 'C45P003', 'C45-LOT-004', '2026-01-01', NULL, 10.00, 8, 'ACTIVE');

DECLARE @ShiftOne BIGINT;
DECLARE @ShiftTwo BIGINT;
DECLARE @ShiftIds TABLE (SequenceNumber INT IDENTITY(1,1), MaCa BIGINT);

INSERT INTO dbo.CA_LAM_VIEC (
    MaNV, GioBatDau, GioKetThuc, TienDauCa, TienCuoiCa, TrangThai, GhiChu
)
OUTPUT inserted.MaCa INTO @ShiftIds (MaCa)
VALUES
    ('C45CA001', '2026-09-01T08:00:00', '2026-09-01T16:00:00', 1000.00, 1180.00, 'CLOSED', N'Ca fixture C45 một'),
    ('C45CA002', '2026-09-02T08:00:00', '2026-09-02T16:00:00', 500.00, 600.00, 'CLOSED', N'Ca fixture C45 hai');

SELECT @ShiftOne = MaCa FROM @ShiftIds WHERE SequenceNumber = 1;
SELECT @ShiftTwo = MaCa FROM @ShiftIds WHERE SequenceNumber = 2;

INSERT INTO dbo.HOA_DON (
    MaHD, NgayLap, MaCa, MaKH, TongTienHang, TongGiamGia,
    TongThanhToan, DiemSuDung, DiemTichLuy, TrangThai, GhiChu
)
VALUES
    ('C45HD001', '2026-09-01T10:00:00', @ShiftOne, NULL, 200.00, 20.00, 180.00, 0, 0, 'PAID', N'Bán C45 một'),
    ('C45HD002', '2026-09-01T11:00:00', @ShiftOne, NULL, 80.00, 0.00, 80.00, 0, 0, 'REFUNDED', N'Bán C45 hai'),
    ('C45HD003', '2026-09-02T10:00:00', @ShiftTwo, NULL, 100.00, 0.00, 100.00, 0, 0, 'PAID', N'Bán C45 ba'),
    ('C45HD004', '2026-09-01T12:00:00', @ShiftOne, NULL, 999.00, 0.00, 999.00, 0, 0, 'CANCELLED', N'Hóa đơn hủy phải bị loại'),
    ('C45HD005', '2026-09-02T12:00:00', @ShiftTwo, NULL, 999.00, 0.00, 999.00, 0, 0, 'DRAFT', N'Hóa đơn nháp phải bị loại');

DECLARE @InvoiceLineOne BIGINT;
DECLARE @InvoiceLineTwo BIGINT;
DECLARE @InvoiceLineThree BIGINT;
DECLARE @InvoiceLines TABLE (SequenceNumber INT IDENTITY(1,1), MaCTHD BIGINT);

INSERT INTO dbo.CHI_TIET_HOA_DON (MaHD, MaSP, MaKM, SoLuong, DonGiaBan, TienGiam)
OUTPUT inserted.MaCTHD INTO @InvoiceLines (MaCTHD)
VALUES
    ('C45HD001', 'C45P001', NULL, 2, 100.00, 20.00),
    ('C45HD002', 'C45P002', NULL, 1, 80.00, 0.00),
    ('C45HD003', 'C45P001', NULL, 1, 100.00, 0.00);

SELECT @InvoiceLineOne = MaCTHD FROM @InvoiceLines WHERE SequenceNumber = 1;
SELECT @InvoiceLineTwo = MaCTHD FROM @InvoiceLines WHERE SequenceNumber = 2;
SELECT @InvoiceLineThree = MaCTHD FROM @InvoiceLines WHERE SequenceNumber = 3;

INSERT INTO dbo.CHI_TIET_XUAT_LO (MaCTHD, MaLo, SoLuong)
VALUES
    (@InvoiceLineOne, 'C45L001', 1),
    (@InvoiceLineOne, 'C45L002', 1),
    (@InvoiceLineTwo, 'C45L003', 1),
    (@InvoiceLineThree, 'C45L001', 1);

INSERT INTO dbo.THANH_TOAN (MaHD, ThoiGian, PhuongThuc, SoTien, TrangThai)
VALUES
    ('C45HD001', '2026-09-01T10:00:00', 'CASH', 180.00, 'SUCCESS'),
    ('C45HD002', '2026-09-01T11:00:00', 'CARD', 80.00, 'REFUNDED'),
    ('C45HD003', '2026-09-02T10:00:00', 'CASH', 100.00, 'SUCCESS');

INSERT INTO dbo.PHIEU_TRA (MaPT, MaHD, MaNV, NgayTra, LyDo, TongTienHoan, TrangThai)
VALUES
    ('C45PT001', 'C45HD001', 'C45CA001', '2026-09-02T14:00:00', N'Trả một phần C45', 90.00, 'COMPLETED'),
    ('C45PT002', 'C45HD002', 'C45CA001', '2026-09-03T09:00:00', N'Trả toàn bộ ngoài kỳ C45', 80.00, 'COMPLETED'),
    ('C45PT003', 'C45HD003', 'C45CA002', '2026-09-02T15:00:00', N'Phiếu trả bị hủy phải bị loại', 100.00, 'CANCELLED');

INSERT INTO dbo.CHI_TIET_PHIEU_TRA (
    MaPT, MaCTHD, MaLo, SoLuongTra, TienHoan, TinhTrangHang
)
VALUES
    ('C45PT001', @InvoiceLineOne, 'C45L001', 1, 90.00, 'RESALABLE'),
    ('C45PT002', @InvoiceLineTwo, 'C45L003', 1, 80.00, 'DAMAGED');

INSERT INTO dbo.PHIEU_NHAP (
    MaPN, NgayNhap, MaNV, MaNCC, TongTien, TrangThai, NgayXacNhan, GhiChu
)
VALUES
    ('C45PN001', '2026-09-01T07:00:00', 'C45WH001', 'C45NCC01', 330.00, 'CONFIRMED', '2026-09-01T07:30:00', N'Nhập C45 một'),
    ('C45PN002', '2026-09-02T07:00:00', 'C45WH001', 'C45NCC01', 80.00, 'CONFIRMED', '2026-09-02T07:30:00', N'Nhập C45 hai'),
    ('C45PN003', '2026-09-02T08:00:00', 'C45WH001', 'C45NCC01', 9900.00, 'DRAFT', NULL, N'Nháp phải bị loại');

INSERT INTO dbo.CHI_TIET_PHIEU_NHAP (MaPN, MaLo, SoLuong, DonGiaNhap)
VALUES
    ('C45PN001', 'C45L001', 4, 60.00),
    ('C45PN001', 'C45L003', 3, 30.00),
    ('C45PN002', 'C45L004', 8, 10.00),
    ('C45PN003', 'C45L002', 99, 100.00);

IF (SELECT COUNT_BIG(*) FROM dbo.vw_BAO_CAO_DOANH_THU_SU_KIEN WHERE MaHD LIKE 'C45HD%') <> 5
    THROW 52903, 'Revenue event view duplicated or omitted a valid sale/refund event.', 1;

DECLARE @Revenue TABLE (
    TuNgay DATE,
    DenNgay DATE,
    SoHoaDonHoanTat BIGINT,
    DoanhThuGop DECIMAL(38,2),
    TienHoanTra DECIMAL(38,2),
    DoanhThuThuan DECIMAL(38,2)
);

INSERT INTO @Revenue
EXEC dbo.usp_BAO_CAO_DoanhThuTongQuan @TuNgay = '2026-09-01', @DenNgay = '2026-09-02';

IF NOT EXISTS (
    SELECT 1
    FROM @Revenue
    WHERE SoHoaDonHoanTat = 3
      AND DoanhThuGop = 360.00
      AND TienHoanTra = 90.00
      AND DoanhThuThuan = 270.00
)
    THROW 52904, 'Revenue summary did not include valid invoices and in-period completed refunds exactly once.', 1;

DECLARE @Trend TABLE (
    Ngay DATE,
    SoHoaDonHoanTat BIGINT,
    DoanhThuGop DECIMAL(38,2),
    TienHoanTra DECIMAL(38,2),
    DoanhThuThuan DECIMAL(38,2)
);

INSERT INTO @Trend
EXEC dbo.usp_BAO_CAO_XuHuongDoanhThu @TuNgay = '2026-09-01', @DenNgay = '2026-09-02';

IF (SELECT COUNT(*) FROM @Trend) <> 2
   OR NOT EXISTS (
        SELECT 1 FROM @Trend
        WHERE Ngay = '2026-09-01' AND SoHoaDonHoanTat = 2
          AND DoanhThuGop = 260.00 AND TienHoanTra = 0 AND DoanhThuThuan = 260.00
   )
   OR NOT EXISTS (
        SELECT 1 FROM @Trend
        WHERE Ngay = '2026-09-02' AND SoHoaDonHoanTat = 1
          AND DoanhThuGop = 100.00 AND TienHoanTra = 90.00 AND DoanhThuThuan = 10.00
   )
    THROW 52905, 'Inclusive daily date filtering or revenue trend totals are incorrect.', 1;

DECLARE @Categories TABLE (
    MaLoai VARCHAR(10),
    TenLoai NVARCHAR(100),
    SoLuongBan BIGINT,
    SoLuongTra BIGINT,
    SoLuongBanThuan BIGINT,
    DoanhThuGop DECIMAL(38,2),
    TienHoanTra DECIMAL(38,2),
    DoanhThuThuan DECIMAL(38,2),
    TyTrongDoanhThuThuan DECIMAL(9,2)
);

INSERT INTO @Categories
EXEC dbo.usp_BAO_CAO_DoanhThuTheoNganhHang @TuNgay = '2026-09-01', @DenNgay = '2026-09-02';

IF NOT EXISTS (
    SELECT 1 FROM @Categories
    WHERE MaLoai = 'C45CAT01' AND SoLuongBan = 4 AND SoLuongTra = 1
      AND SoLuongBanThuan = 3 AND DoanhThuGop = 360.00
      AND TienHoanTra = 90.00 AND DoanhThuThuan = 270.00
      AND TyTrongDoanhThuThuan = 100.00
)
    THROW 52906, 'Category revenue contribution is incorrect.', 1;

DECLARE @ProductRanking TABLE (
    XepHang BIGINT,
    MaSP VARCHAR(10),
    TenSP NVARCHAR(150),
    MaLoai VARCHAR(10),
    TenLoai NVARCHAR(100),
    DonViTinh NVARCHAR(20),
    TrangThaiSanPham VARCHAR(20),
    SoLuongBan BIGINT,
    SoLuongTra BIGINT,
    SoLuongBanThuan BIGINT,
    DoanhThuGop DECIMAL(38,2),
    TienHoanTra DECIMAL(38,2),
    DoanhThuThuan DECIMAL(38,2),
    TongTon BIGINT
);

INSERT INTO @ProductRanking
EXEC dbo.usp_BAO_CAO_XepHangSanPham
    @TuNgay = '2026-09-01', @DenNgay = '2026-09-02', @Kieu = 'BEST', @SoLuong = 10;

IF NOT EXISTS (
    SELECT 1 FROM @ProductRanking
    WHERE XepHang = 1 AND MaSP = 'C45P001'
      AND SoLuongBan = 3 AND SoLuongTra = 1 AND SoLuongBanThuan = 2
      AND DoanhThuThuan = 190.00
)
    THROW 52907, 'Best-product ranking is incorrect.', 1;

DELETE FROM @ProductRanking;
INSERT INTO @ProductRanking
EXEC dbo.usp_BAO_CAO_XepHangSanPham
    @TuNgay = '2026-09-01', @DenNgay = '2026-09-02', @Kieu = 'SLOW', @SoLuong = 100;

IF NOT EXISTS (SELECT 1 FROM @ProductRanking WHERE MaSP = 'C45P003' AND SoLuongBanThuan = 0)
   OR (SELECT XepHang FROM @ProductRanking WHERE MaSP = 'C45P003')
      >= (SELECT XepHang FROM @ProductRanking WHERE MaSP = 'C45P002')
    THROW 52908, 'Slow-product ranking did not prioritize the active zero-sale product.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.vw_BAO_CAO_TON_KHO_HIEN_TAI
    WHERE MaSP = 'C45P001' AND TongTon = 6 AND TonCoTheBan = 4
      AND TonBiKhoa = 2 AND TonHetHan = 0 AND GiaTriTonTheoGiaNhap = 340.00
)
   OR NOT EXISTS (
    SELECT 1
    FROM dbo.vw_BAO_CAO_TON_KHO_HIEN_TAI
    WHERE MaSP = 'C45P002' AND TongTon = 3 AND TonCoTheBan = 0
      AND TonHetHan = 3 AND GiaTriTonTheoGiaNhap = 90.00
)
   OR (SELECT SUM(GiaTriTonTheoGiaNhap)
       FROM dbo.vw_BAO_CAO_TON_KHO_HIEN_TAI
       WHERE MaSP LIKE 'C45P%') <> 510.00
    THROW 52909, 'Current inventory quantity/status/value report is incorrect.', 1;

DECLARE @Receiving TABLE (
    TuNgay DATE,
    DenNgay DATE,
    SoPhieuNhap BIGINT,
    SoNhaCungCap BIGINT,
    TongSoLuongNhap BIGINT,
    TongChiPhiNhap DECIMAL(38,2)
);

INSERT INTO @Receiving
EXEC dbo.usp_BAO_CAO_NhapHangTongQuan @TuNgay = '2026-09-01', @DenNgay = '2026-09-02';

IF NOT EXISTS (
    SELECT 1 FROM @Receiving
    WHERE SoPhieuNhap = 2 AND SoNhaCungCap = 1
      AND TongSoLuongNhap = 15 AND TongChiPhiNhap = 410.00
)
    THROW 52910, 'Confirmed receiving summary or purchase cost is incorrect.', 1;

DECLARE @SupplierReceiving TABLE (
    MaNCC VARCHAR(10),
    TenNCC NVARCHAR(150),
    SoPhieuNhap BIGINT,
    TongSoLuongNhap BIGINT,
    TongChiPhiNhap DECIMAL(38,2)
);

INSERT INTO @SupplierReceiving
EXEC dbo.usp_BAO_CAO_NhapHangTheoNhaCungCap @TuNgay = '2026-09-01', @DenNgay = '2026-09-02';

IF NOT EXISTS (
    SELECT 1 FROM @SupplierReceiving
    WHERE MaNCC = 'C45NCC01' AND SoPhieuNhap = 2
      AND TongSoLuongNhap = 15 AND TongChiPhiNhap = 410.00
)
    THROW 52911, 'Supplier receiving breakdown is incorrect.', 1;

DECLARE @EmployeeRevenue TABLE (
    MaNV VARCHAR(10),
    TenNhanVien NVARCHAR(100),
    SoCaDaMo BIGINT,
    SoHoaDonHoanTat BIGINT,
    DoanhThuGop DECIMAL(38,2),
    TienHoanTra DECIMAL(38,2),
    DoanhThuThuan DECIMAL(38,2)
);

INSERT INTO @EmployeeRevenue
EXEC dbo.usp_BAO_CAO_DoanhThuNhanVien @TuNgay = '2026-09-01', @DenNgay = '2026-09-02';

IF NOT EXISTS (
    SELECT 1 FROM @EmployeeRevenue
    WHERE MaNV = 'C45CA001' AND SoCaDaMo = 1 AND SoHoaDonHoanTat = 2
      AND DoanhThuGop = 260.00 AND TienHoanTra = 90.00 AND DoanhThuThuan = 170.00
)
   OR NOT EXISTS (
    SELECT 1 FROM @EmployeeRevenue
    WHERE MaNV = 'C45CA002' AND SoCaDaMo = 1 AND SoHoaDonHoanTat = 1
      AND DoanhThuGop = 100.00 AND TienHoanTra = 0 AND DoanhThuThuan = 100.00
)
    THROW 52912, 'Employee revenue aggregation is incorrect.', 1;

DECLARE @ShiftRevenue TABLE (
    MaCa BIGINT,
    MaNV VARCHAR(10),
    TenNhanVien NVARCHAR(100),
    GioBatDau DATETIME2(0),
    GioKetThuc DATETIME2(0),
    TienDauCa DECIMAL(18,2),
    TienCuoiCa DECIMAL(18,2),
    TrangThai VARCHAR(20),
    SoHoaDonHoanTat BIGINT,
    DoanhThuGop DECIMAL(38,2),
    TienHoanTra DECIMAL(38,2),
    DoanhThuThuan DECIMAL(38,2),
    DoanhThuTienMatGhiNhan DECIMAL(38,2),
    ChenhLechTienMat DECIMAL(18,2)
);

INSERT INTO @ShiftRevenue
EXEC dbo.usp_BAO_CAO_CaLamViec @TuNgay = '2026-09-01', @DenNgay = '2026-09-02';

IF NOT EXISTS (
    SELECT 1 FROM @ShiftRevenue
    WHERE MaCa = @ShiftOne AND MaNV = 'C45CA001' AND SoHoaDonHoanTat = 2
      AND DoanhThuGop = 260.00 AND TienHoanTra = 170.00 AND DoanhThuThuan = 90.00
      AND DoanhThuTienMatGhiNhan = 180.00 AND ChenhLechTienMat = 0.00
)
    THROW 52913, 'Shift revenue/history or cash reconciliation output is incorrect.', 1;

DECLARE @PerformanceStart DATETIME2(7) = SYSDATETIME();
DECLARE @PerformanceResult TABLE (
    TuNgay DATE,
    DenNgay DATE,
    SoHoaDonHoanTat BIGINT,
    DoanhThuGop DECIMAL(38,2),
    TienHoanTra DECIMAL(38,2),
    DoanhThuThuan DECIMAL(38,2)
);

INSERT INTO @PerformanceResult
EXEC dbo.usp_BAO_CAO_DoanhThuTongQuan @TuNgay = '2026-01-01', @DenNgay = '2026-12-31';

DECLARE @PerformanceMilliseconds BIGINT = DATEDIFF_BIG(MICROSECOND, @PerformanceStart, SYSDATETIME()) / 1000;
PRINT CONCAT('C45 basic performance measurement (revenue summary, fixture scale): ', @PerformanceMilliseconds, ' ms.');

IF @PerformanceMilliseconds > 5000
    THROW 52916, 'Revenue summary exceeded the 5-second project-scale smoke threshold.', 1;

ROLLBACK TRANSACTION;

IF EXISTS (SELECT 1 FROM dbo.HOA_DON WHERE MaHD LIKE 'C45%')
   OR EXISTS (SELECT 1 FROM dbo.PHIEU_NHAP WHERE MaPN LIKE 'C45%')
   OR EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo LIKE 'C45%')
   OR EXISTS (SELECT 1 FROM dbo.NHAN_VIEN WHERE MaNV LIKE 'C45%')
    THROW 52917, 'C45 report fixtures were not rolled back completely.', 1;

PRINT 'C45 business-report tests passed: revenue/refunds, inclusive dates, product/category ranking, inventory value, receiving, employee/shift totals, validation, indexes and performance smoke.';
GO
