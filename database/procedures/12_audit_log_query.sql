SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_NHAT_KY_HE_THONG_TraCuu;
GO

CREATE PROCEDURE dbo.usp_NHAT_KY_HE_THONG_TraCuu
    @TuNgay DATE = NULL,
    @DenNgay DATE = NULL,
    @TenDangNhap VARCHAR(50) = NULL,
    @HanhDong VARCHAR(50) = NULL,
    @TenBang VARCHAR(128) = NULL,
    @MaBanGhi VARCHAR(100) = NULL,
    @SoTrang INT = 1,
    @KichThuocTrang INT = 50
AS
BEGIN
    SET NOCOUNT ON;

    SET @TenDangNhap = NULLIF(LTRIM(RTRIM(@TenDangNhap)), '');
    SET @HanhDong = NULLIF(LTRIM(RTRIM(@HanhDong)), '');
    SET @TenBang = NULLIF(LTRIM(RTRIM(@TenBang)), '');
    SET @MaBanGhi = NULLIF(LTRIM(RTRIM(@MaBanGhi)), '');

    IF @TuNgay IS NOT NULL AND @DenNgay IS NOT NULL AND @TuNgay > @DenNgay
        THROW 51810, 'Audit start date must not be after end date.', 1;

    IF @SoTrang < 1
        THROW 51811, 'Audit page must be greater than or equal to 1.', 1;

    IF @KichThuocTrang < 1 OR @KichThuocTrang > 100
        THROW 51812, 'Audit page size must be between 1 and 100.', 1;

    DECLARE @Offset BIGINT = CONVERT(BIGINT, @SoTrang - 1) * @KichThuocTrang;

    IF @Offset > 2147483647
        THROW 51813, 'Audit page offset is too large.', 1;

    SELECT
        audit_log.MaNhatKy,
        audit_log.MaTK,
        audit_log.TenDangNhap,
        audit_log.MaVaiTro,
        audit_log.TenVaiTro,
        audit_log.LoaiChuSoHuu,
        audit_log.MaChuSoHuu,
        audit_log.TenChuSoHuu,
        audit_log.HanhDong,
        audit_log.TenBang,
        audit_log.MaBanGhi,
        audit_log.DuLieuCu,
        audit_log.DuLieuMoi,
        audit_log.DuLieuCuLaJson,
        audit_log.DuLieuMoiLaJson,
        audit_log.ThoiGian,
        audit_log.DiaChiIP,
        COUNT_BIG(*) OVER () AS TongSoBanGhi
    FROM dbo.vw_NHAT_KY_HE_THONG_CHI_TIET AS audit_log
    WHERE (@TuNgay IS NULL OR audit_log.ThoiGian >= CONVERT(DATETIME2(0), @TuNgay))
      AND (@DenNgay IS NULL OR audit_log.ThoiGian < DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay)))
      AND (@TenDangNhap IS NULL OR audit_log.TenDangNhap = @TenDangNhap)
      AND (@HanhDong IS NULL OR audit_log.HanhDong = @HanhDong)
      AND (@TenBang IS NULL OR audit_log.TenBang = @TenBang)
      AND (@MaBanGhi IS NULL OR audit_log.MaBanGhi = @MaBanGhi)
    ORDER BY audit_log.ThoiGian DESC, audit_log.MaNhatKy DESC
    OFFSET CONVERT(INT, @Offset) ROWS FETCH NEXT @KichThuocTrang ROWS ONLY;
END;
GO

DROP TRIGGER IF EXISTS dbo.trg_NHAT_KY_HE_THONG_AppendOnly;
GO

CREATE TRIGGER dbo.trg_NHAT_KY_HE_THONG_AppendOnly
ON dbo.NHAT_KY_HE_THONG
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Privileged principals retain a controlled maintenance path for schema rebuilds
    -- and test-fixture cleanup. Application principals cannot mutate audit history.
    IF COALESCE(IS_SRVROLEMEMBER('sysadmin'), 0) = 1
       OR COALESCE(IS_ROLEMEMBER('db_owner'), 0) = 1
        RETURN;

    THROW 51820, 'Audit log entries are append-only and cannot be updated or deleted.', 1;
END;
GO

PRINT 'Parameterized audit lookup and append-only enforcement are ready.';
GO
