SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
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

    DECLARE
        @TuNgayUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (CONVERT(DATETIME2(0), @TuNgay) AT TIME ZONE 'SE Asia Standard Time') AT TIME ZONE 'UTC'
        ),
        @DenNgayKeTiepUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay)) AT TIME ZONE 'SE Asia Standard Time') AT TIME ZONE 'UTC'
        );

    ;WITH ProductActivity AS (
        SELECT
            event.MaSP,
            SUM(event.SoLuongBan) AS SoLuongBan,
            SUM(event.SoLuongTra) AS SoLuongTra,
            SUM(event.DoanhThuGop) AS DoanhThuGop,
            SUM(event.TienHoanTra) AS TienHoanTra,
            SUM(event.DoanhThuThuan) AS DoanhThuThuan
        FROM dbo.vw_BAO_CAO_HANG_HOA_SU_KIEN AS event
        WHERE event.NgayGiaoDich >= @TuNgayUtc
          AND event.NgayGiaoDich < @DenNgayKeTiepUtc
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
