SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_BAO_CAO_DoanhThuTongQuan;
GO

CREATE PROCEDURE dbo.usp_BAO_CAO_DoanhThuTongQuan
    @TuNgay DATE,
    @DenNgay DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
        THROW 51910, 'A valid inclusive report date range is required.', 1;

    DECLARE @DenNgayKeTiep DATETIME2(0) = DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay));

    SELECT
        @TuNgay AS TuNgay,
        @DenNgay AS DenNgay,
        COALESCE(SUM(event.SoHoaDon), 0) AS SoHoaDonHoanTat,
        COALESCE(SUM(event.DoanhThuGop), 0) AS DoanhThuGop,
        COALESCE(SUM(event.TienHoanTra), 0) AS TienHoanTra,
        COALESCE(SUM(event.DoanhThuThuan), 0) AS DoanhThuThuan
    FROM dbo.vw_BAO_CAO_DOANH_THU_SU_KIEN AS event
    WHERE event.NgayGiaoDich >= @TuNgay
      AND event.NgayGiaoDich < @DenNgayKeTiep;
END;
GO

DROP PROCEDURE IF EXISTS dbo.usp_BAO_CAO_XuHuongDoanhThu;
GO

CREATE PROCEDURE dbo.usp_BAO_CAO_XuHuongDoanhThu
    @TuNgay DATE,
    @DenNgay DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
        THROW 51910, 'A valid inclusive report date range is required.', 1;

    DECLARE @DenNgayKeTiep DATETIME2(0) = DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay));

    SELECT
        CONVERT(DATE, event.NgayGiaoDich) AS Ngay,
        SUM(event.SoHoaDon) AS SoHoaDonHoanTat,
        SUM(event.DoanhThuGop) AS DoanhThuGop,
        SUM(event.TienHoanTra) AS TienHoanTra,
        SUM(event.DoanhThuThuan) AS DoanhThuThuan
    FROM dbo.vw_BAO_CAO_DOANH_THU_SU_KIEN AS event
    WHERE event.NgayGiaoDich >= @TuNgay
      AND event.NgayGiaoDich < @DenNgayKeTiep
    GROUP BY CONVERT(DATE, event.NgayGiaoDich)
    ORDER BY Ngay;
END;
GO

DROP PROCEDURE IF EXISTS dbo.usp_BAO_CAO_DoanhThuTheoNganhHang;
GO

CREATE PROCEDURE dbo.usp_BAO_CAO_DoanhThuTheoNganhHang
    @TuNgay DATE,
    @DenNgay DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
        THROW 51910, 'A valid inclusive report date range is required.', 1;

    DECLARE @DenNgayKeTiep DATETIME2(0) = DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay));

    ;WITH CategoryTotals AS (
        SELECT
            event.MaLoai,
            event.TenLoai,
            SUM(event.SoLuongBan) AS SoLuongBan,
            SUM(event.SoLuongTra) AS SoLuongTra,
            SUM(event.DoanhThuGop) AS DoanhThuGop,
            SUM(event.TienHoanTra) AS TienHoanTra,
            SUM(event.DoanhThuThuan) AS DoanhThuThuan
        FROM dbo.vw_BAO_CAO_HANG_HOA_SU_KIEN AS event
        WHERE event.NgayGiaoDich >= @TuNgay
          AND event.NgayGiaoDich < @DenNgayKeTiep
        GROUP BY event.MaLoai, event.TenLoai
    )
    SELECT
        category.MaLoai,
        category.TenLoai,
        category.SoLuongBan,
        category.SoLuongTra,
        category.SoLuongBan - category.SoLuongTra AS SoLuongBanThuan,
        category.DoanhThuGop,
        category.TienHoanTra,
        category.DoanhThuThuan,
        CONVERT(DECIMAL(9,2), CASE
            WHEN SUM(category.DoanhThuThuan) OVER () = 0 THEN 0
            ELSE category.DoanhThuThuan * 100.0 / SUM(category.DoanhThuThuan) OVER ()
        END) AS TyTrongDoanhThuThuan
    FROM CategoryTotals AS category
    ORDER BY category.DoanhThuThuan DESC, category.MaLoai;
END;
GO

DROP PROCEDURE IF EXISTS dbo.usp_BAO_CAO_XepHangSanPham;
GO

CREATE PROCEDURE dbo.usp_BAO_CAO_XepHangSanPham
    @TuNgay DATE,
    @DenNgay DATE,
    @Kieu VARCHAR(10),
    @SoLuong INT = 10
AS
BEGIN
    SET NOCOUNT ON;

    SET @Kieu = UPPER(LTRIM(RTRIM(COALESCE(@Kieu, ''))));

    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
        THROW 51910, 'A valid inclusive report date range is required.', 1;

    IF @Kieu NOT IN ('BEST', 'SLOW')
        THROW 51911, 'Product ranking type must be BEST or SLOW.', 1;

    IF @SoLuong IS NULL OR @SoLuong < 1 OR @SoLuong > 100
        THROW 51912, 'Product ranking size must be between 1 and 100.', 1;

    DECLARE @DenNgayKeTiep DATETIME2(0) = DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay));

    ;WITH ProductActivity AS (
        SELECT
            event.MaSP,
            SUM(event.SoLuongBan) AS SoLuongBan,
            SUM(event.SoLuongTra) AS SoLuongTra,
            SUM(event.DoanhThuGop) AS DoanhThuGop,
            SUM(event.TienHoanTra) AS TienHoanTra,
            SUM(event.DoanhThuThuan) AS DoanhThuThuan
        FROM dbo.vw_BAO_CAO_HANG_HOA_SU_KIEN AS event
        WHERE event.NgayGiaoDich >= @TuNgay
          AND event.NgayGiaoDich < @DenNgayKeTiep
        GROUP BY event.MaSP
    ), RankedProducts AS (
        SELECT
            product.MaSP,
            product.TenSP,
            product.MaLoai,
            category.TenLoai,
            product.DonViTinh,
            product.TrangThai AS TrangThaiSanPham,
            COALESCE(activity.SoLuongBan, 0) AS SoLuongBan,
            COALESCE(activity.SoLuongTra, 0) AS SoLuongTra,
            COALESCE(activity.SoLuongBan, 0) - COALESCE(activity.SoLuongTra, 0) AS SoLuongBanThuan,
            COALESCE(activity.DoanhThuGop, 0) AS DoanhThuGop,
            COALESCE(activity.TienHoanTra, 0) AS TienHoanTra,
            COALESCE(activity.DoanhThuThuan, 0) AS DoanhThuThuan,
            COALESCE(inventory.TongTon, 0) AS TongTon,
            ROW_NUMBER() OVER (
                ORDER BY
                    CASE WHEN @Kieu = 'BEST'
                        THEN COALESCE(activity.SoLuongBan, 0) - COALESCE(activity.SoLuongTra, 0)
                    END DESC,
                    CASE WHEN @Kieu = 'BEST' THEN COALESCE(activity.DoanhThuThuan, 0) END DESC,
                    CASE WHEN @Kieu = 'SLOW'
                        THEN COALESCE(activity.SoLuongBan, 0) - COALESCE(activity.SoLuongTra, 0)
                    END ASC,
                    CASE WHEN @Kieu = 'SLOW' THEN COALESCE(activity.DoanhThuThuan, 0) END ASC,
                    CASE WHEN @Kieu = 'SLOW' THEN COALESCE(inventory.TongTon, 0) END DESC,
                    product.MaSP
            ) AS XepHang
        FROM dbo.SAN_PHAM AS product
        JOIN dbo.LOAI_SAN_PHAM AS category
            ON category.MaLoai = product.MaLoai
        LEFT JOIN ProductActivity AS activity
            ON activity.MaSP = product.MaSP
        LEFT JOIN dbo.vw_BAO_CAO_TON_KHO_HIEN_TAI AS inventory
            ON inventory.MaSP = product.MaSP
        WHERE (@Kieu = 'BEST' AND COALESCE(activity.SoLuongBan, 0) > 0)
           OR (@Kieu = 'SLOW' AND product.TrangThai = 'ACTIVE')
    )
    SELECT
        XepHang,
        MaSP,
        TenSP,
        MaLoai,
        TenLoai,
        DonViTinh,
        TrangThaiSanPham,
        SoLuongBan,
        SoLuongTra,
        SoLuongBanThuan,
        DoanhThuGop,
        TienHoanTra,
        DoanhThuThuan,
        TongTon
    FROM RankedProducts
    WHERE XepHang <= @SoLuong
    ORDER BY XepHang;
END;
GO

DROP PROCEDURE IF EXISTS dbo.usp_BAO_CAO_NhapHangTongQuan;
GO

CREATE PROCEDURE dbo.usp_BAO_CAO_NhapHangTongQuan
    @TuNgay DATE,
    @DenNgay DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
        THROW 51910, 'A valid inclusive report date range is required.', 1;

    DECLARE @DenNgayKeTiep DATETIME2(0) = DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay));

    SELECT
        @TuNgay AS TuNgay,
        @DenNgay AS DenNgay,
        COUNT_BIG(DISTINCT receipt.MaPN) AS SoPhieuNhap,
        COUNT_BIG(DISTINCT receipt.MaNCC) AS SoNhaCungCap,
        COALESCE(SUM(CONVERT(BIGINT, receipt.SoLuong)), 0) AS TongSoLuongNhap,
        COALESCE(SUM(receipt.ThanhTien), 0) AS TongChiPhiNhap
    FROM dbo.vw_BAO_CAO_NHAP_HANG_HOP_LE AS receipt
    WHERE receipt.NgayXacNhan >= @TuNgay
      AND receipt.NgayXacNhan < @DenNgayKeTiep;
END;
GO

DROP PROCEDURE IF EXISTS dbo.usp_BAO_CAO_NhapHangTheoNhaCungCap;
GO

CREATE PROCEDURE dbo.usp_BAO_CAO_NhapHangTheoNhaCungCap
    @TuNgay DATE,
    @DenNgay DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
        THROW 51910, 'A valid inclusive report date range is required.', 1;

    DECLARE @DenNgayKeTiep DATETIME2(0) = DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay));

    SELECT
        receipt.MaNCC,
        receipt.TenNCC,
        COUNT_BIG(DISTINCT receipt.MaPN) AS SoPhieuNhap,
        SUM(CONVERT(BIGINT, receipt.SoLuong)) AS TongSoLuongNhap,
        SUM(receipt.ThanhTien) AS TongChiPhiNhap
    FROM dbo.vw_BAO_CAO_NHAP_HANG_HOP_LE AS receipt
    WHERE receipt.NgayXacNhan >= @TuNgay
      AND receipt.NgayXacNhan < @DenNgayKeTiep
    GROUP BY receipt.MaNCC, receipt.TenNCC
    ORDER BY TongChiPhiNhap DESC, receipt.MaNCC;
END;
GO

DROP PROCEDURE IF EXISTS dbo.usp_BAO_CAO_DoanhThuNhanVien;
GO

CREATE PROCEDURE dbo.usp_BAO_CAO_DoanhThuNhanVien
    @TuNgay DATE,
    @DenNgay DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
        THROW 51910, 'A valid inclusive report date range is required.', 1;

    DECLARE @DenNgayKeTiep DATETIME2(0) = DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay));

    ;WITH ShiftTotals AS (
        SELECT work_shift.MaNV, COUNT_BIG(*) AS SoCaDaMo
        FROM dbo.CA_LAM_VIEC AS work_shift
        WHERE work_shift.GioBatDau >= @TuNgay
          AND work_shift.GioBatDau < @DenNgayKeTiep
        GROUP BY work_shift.MaNV
    ), RevenueTotals AS (
        SELECT
            event.MaNV,
            SUM(event.SoHoaDon) AS SoHoaDonHoanTat,
            SUM(event.DoanhThuGop) AS DoanhThuGop,
            SUM(event.TienHoanTra) AS TienHoanTra,
            SUM(event.DoanhThuThuan) AS DoanhThuThuan
        FROM dbo.vw_BAO_CAO_DOANH_THU_SU_KIEN AS event
        WHERE event.NgayGiaoDich >= @TuNgay
          AND event.NgayGiaoDich < @DenNgayKeTiep
        GROUP BY event.MaNV
    ), EmployeeKeys AS (
        SELECT MaNV FROM ShiftTotals
        UNION
        SELECT MaNV FROM RevenueTotals
    )
    SELECT
        employee.MaNV,
        employee.HoTen AS TenNhanVien,
        COALESCE(shift_total.SoCaDaMo, 0) AS SoCaDaMo,
        COALESCE(revenue.SoHoaDonHoanTat, 0) AS SoHoaDonHoanTat,
        COALESCE(revenue.DoanhThuGop, 0) AS DoanhThuGop,
        COALESCE(revenue.TienHoanTra, 0) AS TienHoanTra,
        COALESCE(revenue.DoanhThuThuan, 0) AS DoanhThuThuan
    FROM EmployeeKeys AS employee_key
    JOIN dbo.NHAN_VIEN AS employee
        ON employee.MaNV = employee_key.MaNV
    LEFT JOIN ShiftTotals AS shift_total
        ON shift_total.MaNV = employee.MaNV
    LEFT JOIN RevenueTotals AS revenue
        ON revenue.MaNV = employee.MaNV
    ORDER BY DoanhThuThuan DESC, employee.MaNV;
END;
GO

DROP PROCEDURE IF EXISTS dbo.usp_BAO_CAO_CaLamViec;
GO

CREATE PROCEDURE dbo.usp_BAO_CAO_CaLamViec
    @TuNgay DATE,
    @DenNgay DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
        THROW 51910, 'A valid inclusive report date range is required.', 1;

    DECLARE @DenNgayKeTiep DATETIME2(0) = DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay));

    SELECT
        work_shift.MaCa,
        work_shift.MaNV,
        employee.HoTen AS TenNhanVien,
        work_shift.GioBatDau,
        work_shift.GioKetThuc,
        work_shift.TienDauCa,
        work_shift.TienCuoiCa,
        work_shift.TrangThai,
        COALESCE(revenue.SoHoaDonHoanTat, 0) AS SoHoaDonHoanTat,
        COALESCE(revenue.DoanhThuGop, 0) AS DoanhThuGop,
        COALESCE(revenue.TienHoanTra, 0) AS TienHoanTra,
        COALESCE(revenue.DoanhThuThuan, 0) AS DoanhThuThuan,
        COALESCE(cash_payment.DoanhThuTienMatGhiNhan, 0) AS DoanhThuTienMatGhiNhan,
        CASE
            WHEN work_shift.TienCuoiCa IS NULL THEN NULL
            ELSE CONVERT(DECIMAL(18,2),
                work_shift.TienCuoiCa
                - work_shift.TienDauCa
                - COALESCE(cash_payment.DoanhThuTienMatGhiNhan, 0)
            )
        END AS ChenhLechTienMat
    FROM dbo.CA_LAM_VIEC AS work_shift
    JOIN dbo.NHAN_VIEN AS employee
        ON employee.MaNV = work_shift.MaNV
    OUTER APPLY (
        SELECT
            SUM(event.SoHoaDon) AS SoHoaDonHoanTat,
            SUM(event.DoanhThuGop) AS DoanhThuGop,
            SUM(event.TienHoanTra) AS TienHoanTra,
            SUM(event.DoanhThuThuan) AS DoanhThuThuan
        FROM dbo.vw_BAO_CAO_DOANH_THU_SU_KIEN AS event
        WHERE event.MaCa = work_shift.MaCa
    ) AS revenue
    OUTER APPLY (
        SELECT SUM(payment.SoTien) AS DoanhThuTienMatGhiNhan
        FROM dbo.HOA_DON AS invoice
        JOIN dbo.THANH_TOAN AS payment
            ON payment.MaHD = invoice.MaHD
        WHERE invoice.MaCa = work_shift.MaCa
          AND payment.TrangThai = 'SUCCESS'
          AND payment.PhuongThuc = 'CASH'
    ) AS cash_payment
    WHERE work_shift.GioBatDau >= @TuNgay
      AND work_shift.GioBatDau < @DenNgayKeTiep
    ORDER BY work_shift.GioBatDau DESC, work_shift.MaCa DESC;
END;
GO

PRINT 'Business revenue, merchandise, receiving, employee and shift report procedures are ready.';
GO
