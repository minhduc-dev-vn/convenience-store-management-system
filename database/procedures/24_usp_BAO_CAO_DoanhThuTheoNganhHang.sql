SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
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

    DECLARE
        @TuNgayUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (CONVERT(DATETIME2(0), @TuNgay) AT TIME ZONE 'SE Asia Standard Time') AT TIME ZONE 'UTC'
        ),
        @DenNgayKeTiepUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay)) AT TIME ZONE 'SE Asia Standard Time') AT TIME ZONE 'UTC'
        );

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
        WHERE event.NgayGiaoDich >= @TuNgayUtc
          AND event.NgayGiaoDich < @DenNgayKeTiepUtc
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
