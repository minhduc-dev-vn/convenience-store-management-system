SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
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
        receipt.MaNCC,
        receipt.TenNCC,
        COUNT_BIG(DISTINCT receipt.MaPN) AS SoPhieuNhap,
        SUM(CONVERT(BIGINT, receipt.SoLuong)) AS TongSoLuongNhap,
        SUM(receipt.ThanhTien) AS TongChiPhiNhap
    FROM dbo.vw_BAO_CAO_NHAP_HANG_HOP_LE AS receipt
    WHERE receipt.NgayXacNhan >= @TuNgayUtc
      AND receipt.NgayXacNhan < @DenNgayKeTiepUtc
    GROUP BY receipt.MaNCC, receipt.TenNCC
    ORDER BY TongChiPhiNhap DESC, receipt.MaNCC;
END;
GO
