SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
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
        COUNT_BIG(DISTINCT receipt.MaPN) AS SoPhieuNhap,
        COUNT_BIG(DISTINCT receipt.MaNCC) AS SoNhaCungCap,
        COALESCE(SUM(CONVERT(BIGINT, receipt.SoLuong)), 0) AS TongSoLuongNhap,
        COALESCE(SUM(receipt.ThanhTien), 0) AS TongChiPhiNhap
    FROM dbo.vw_BAO_CAO_NHAP_HANG_HOP_LE AS receipt
    WHERE receipt.NgayXacNhan >= @TuNgayUtc
      AND receipt.NgayXacNhan < @DenNgayKeTiepUtc;
END;
GO
