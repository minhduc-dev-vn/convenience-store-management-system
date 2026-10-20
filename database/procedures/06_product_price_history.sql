SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_SAN_PHAM_LichSuGia;
GO

CREATE PROCEDURE dbo.usp_SAN_PHAM_LichSuGia
    @MaSP VARCHAR(10),
    @SoTrang INT = 1,
    @KichThuocTrang INT = 20
AS
BEGIN
    SET NOCOUNT ON;

    SET @MaSP = NULLIF(LTRIM(RTRIM(@MaSP)), '');

    IF @MaSP IS NULL
        THROW 51230, 'Product id is required for price history.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.SAN_PHAM WHERE MaSP = @MaSP)
        THROW 51231, 'Price-history product does not exist.', 1;

    IF @SoTrang < 1
        THROW 51232, 'Price-history page must be greater than or equal to 1.', 1;

    IF @KichThuocTrang < 1 OR @KichThuocTrang > 100
        THROW 51233, 'Price-history page size must be between 1 and 100.', 1;

    DECLARE @Offset BIGINT = CONVERT(BIGINT, @SoTrang - 1) * @KichThuocTrang;

    IF @Offset > 2147483647
        THROW 51234, 'Price-history page offset is too large.', 1;

    SELECT
        audit_log.MaNhatKy,
        audit_log.MaBanGhi AS MaSP,
        audit_log.DuLieuCu,
        audit_log.DuLieuMoi,
        audit_log.ThoiGian,
        audit_log.MaTK,
        account.TenDangNhap,
        account.TenChuSoHuu AS TenNguoiThucHien,
        audit_log.DiaChiIP,
        COUNT_BIG(*) OVER () AS TongSoBanGhi
    FROM dbo.NHAT_KY_HE_THONG AS audit_log
    LEFT JOIN dbo.vw_TAI_KHOAN_VAI_TRO AS account
        ON account.MaTK = audit_log.MaTK
    WHERE audit_log.TenBang = 'SAN_PHAM'
      AND audit_log.MaBanGhi = @MaSP
      AND audit_log.HanhDong = 'UPDATE_PRICE'
    ORDER BY audit_log.ThoiGian DESC, audit_log.MaNhatKy DESC
    OFFSET CONVERT(INT, @Offset) ROWS FETCH NEXT @KichThuocTrang ROWS ONLY;
END;
GO

PRINT 'Product price history query is ready on the shared audit log.';
GO
