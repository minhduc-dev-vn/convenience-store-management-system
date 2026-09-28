SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_KHUYEN_MAI_DangHieuLuc;
GO

CREATE PROCEDURE dbo.usp_KHUYEN_MAI_DangHieuLuc
    @ThoiDiem DATETIME2(0) = NULL,
    @MaSP VARCHAR(10) = NULL,
    @GiaTriDonHang DECIMAL(18,2) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SET @ThoiDiem = COALESCE(@ThoiDiem, SYSDATETIME());
    SET @MaSP = NULLIF(LTRIM(RTRIM(@MaSP)), '');

    IF @GiaTriDonHang IS NOT NULL AND @GiaTriDonHang < 0
        THROW 51210, 'Order value for promotion lookup cannot be negative.', 1;

    IF @MaSP IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.SAN_PHAM WHERE MaSP = @MaSP)
        THROW 51211, 'Promotion product does not exist.', 1;

    SELECT
        promotion.MaKM,
        promotion.TenKM,
        promotion.LoaiKM,
        promotion.GiaTri,
        promotion.GiaTriDonToiThieu,
        promotion.MucGiamToiDa,
        promotion.NgayBatDau,
        promotion.NgayKetThuc,
        promotion.TrangThai,
        product_scope.SoSanPhamApDung
    FROM dbo.KHUYEN_MAI AS promotion
    CROSS APPLY (
        SELECT COUNT_BIG(*) AS SoSanPhamApDung
        FROM dbo.KHUYEN_MAI_SAN_PHAM AS promotion_product
        WHERE promotion_product.MaKM = promotion.MaKM
    ) AS product_scope
    WHERE promotion.TrangThai = 'ACTIVE'
      AND promotion.NgayBatDau <= @ThoiDiem
      AND promotion.NgayKetThuc > @ThoiDiem
      AND (@GiaTriDonHang IS NULL OR @GiaTriDonHang >= promotion.GiaTriDonToiThieu)
      AND (
          @MaSP IS NULL
          OR EXISTS (
              SELECT 1
              FROM dbo.KHUYEN_MAI_SAN_PHAM AS promotion_product
              WHERE promotion_product.MaKM = promotion.MaKM
                AND promotion_product.MaSP = @MaSP
          )
      )
    ORDER BY promotion.NgayKetThuc, promotion.MaKM;
END;
GO

PRINT 'Active promotion lookup by time, product and minimum order value is ready.';
GO
