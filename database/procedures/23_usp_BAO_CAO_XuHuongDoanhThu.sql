SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
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

    DECLARE
        @TuNgayUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (CONVERT(DATETIME2(0), @TuNgay) AT TIME ZONE 'SE Asia Standard Time') AT TIME ZONE 'UTC'
        ),
        @DenNgayKeTiepUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay)) AT TIME ZONE 'SE Asia Standard Time') AT TIME ZONE 'UTC'
        );

    SELECT
        business_date.Ngay AS Ngay,
        SUM(event.SoHoaDon) AS SoHoaDonHoanTat,
        SUM(event.DoanhThuGop) AS DoanhThuGop,
        SUM(event.TienHoanTra) AS TienHoanTra,
        SUM(event.DoanhThuThuan) AS DoanhThuThuan
    FROM dbo.vw_BAO_CAO_DOANH_THU_SU_KIEN AS event
    CROSS APPLY (VALUES (
        CONVERT(
            DATE,
            (event.NgayGiaoDich AT TIME ZONE 'UTC') AT TIME ZONE 'SE Asia Standard Time'
        )
    )) AS business_date (Ngay)
    WHERE event.NgayGiaoDich >= @TuNgayUtc
      AND event.NgayGiaoDich < @DenNgayKeTiepUtc
    GROUP BY business_date.Ngay
    ORDER BY Ngay;
END;
GO
