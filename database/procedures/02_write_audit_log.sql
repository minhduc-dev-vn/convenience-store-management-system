SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_NHAT_KY_HE_THONG_Ghi;
GO

CREATE PROCEDURE dbo.usp_NHAT_KY_HE_THONG_Ghi
    @MaTK INT = NULL,
    @HanhDong VARCHAR(50),
    @TenBang VARCHAR(128),
    @MaBanGhi VARCHAR(100) = NULL,
    @DuLieuCu NVARCHAR(MAX) = NULL,
    @DuLieuMoi NVARCHAR(MAX) = NULL,
    @DiaChiIP VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @HanhDong = NULLIF(LTRIM(RTRIM(@HanhDong)), '');
    SET @TenBang = NULLIF(LTRIM(RTRIM(@TenBang)), '');
    SET @MaBanGhi = NULLIF(LTRIM(RTRIM(@MaBanGhi)), '');
    SET @DiaChiIP = NULLIF(LTRIM(RTRIM(@DiaChiIP)), '');

    IF @HanhDong IS NULL
        THROW 51130, 'Audit action is required.', 1;

    IF @TenBang IS NULL
        THROW 51131, 'Audit target table is required.', 1;

    DECLARE @Payload NVARCHAR(MAX) = LOWER(CONCAT(COALESCE(@DuLieuCu, N''), N' ', COALESCE(@DuLieuMoi, N'')));

    IF @Payload LIKE N'%matkhau%'
       OR @Payload LIKE N'%mật khẩu%'
       OR @Payload LIKE N'%password%'
       OR @Payload LIKE N'%token%'
       OR @Payload LIKE N'%secret%'
       OR @Payload LIKE N'%authorization%'
       OR @Payload LIKE N'%jwt%'
        THROW 51132, 'Sensitive authentication data cannot be written to the audit log.', 1;

    INSERT INTO dbo.NHAT_KY_HE_THONG (
        MaTK,
        HanhDong,
        TenBang,
        MaBanGhi,
        DuLieuCu,
        DuLieuMoi,
        DiaChiIP
    )
    OUTPUT inserted.MaNhatKy, inserted.ThoiGian
    VALUES (
        @MaTK,
        @HanhDong,
        @TenBang,
        @MaBanGhi,
        @DuLieuCu,
        @DuLieuMoi,
        @DiaChiIP
    );
END;
GO

PRINT 'Shared audit insert procedure is ready.';
GO
