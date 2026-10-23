SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
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
        @TuNgay AS TuNgay,
        @DenNgay AS DenNgay,
        COALESCE(SUM(event.SoHoaDon), 0) AS SoHoaDonHoanTat,
        COALESCE(SUM(event.DoanhThuGop), 0) AS DoanhThuGop,
        COALESCE(SUM(event.TienHoanTra), 0) AS TienHoanTra,
        COALESCE(SUM(event.DoanhThuThuan), 0) AS DoanhThuThuan
    FROM dbo.vw_BAO_CAO_DOANH_THU_SU_KIEN AS event
    WHERE event.NgayGiaoDich >= @TuNgayUtc
      AND event.NgayGiaoDich < @DenNgayKeTiepUtc;
END;
GO
