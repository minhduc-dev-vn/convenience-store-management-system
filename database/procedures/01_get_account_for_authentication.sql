SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_TAI_KHOAN_LayTheoTenDangNhap;
GO

CREATE PROCEDURE dbo.usp_TAI_KHOAN_LayTheoTenDangNhap
    @TenDangNhap VARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @NormalizedUsername VARCHAR(50) = NULLIF(LTRIM(RTRIM(@TenDangNhap)), '');

    IF @NormalizedUsername IS NULL
        THROW 51120, 'Username is required for authentication lookup.', 1;

    SELECT
        account.MaTK,
        account.TenDangNhap,
        account.MatKhauHash,
        account.MaVaiTro,
        account_role.TenVaiTro,
        account.TrangThai,
        account_role.LoaiChuSoHuu,
        account_role.MaChuSoHuu,
        account_role.TenChuSoHuu,
        account_role.TrangThaiChuSoHuu
    FROM dbo.TAI_KHOAN AS account
    JOIN dbo.vw_TAI_KHOAN_VAI_TRO AS account_role
        ON account_role.MaTK = account.MaTK
    WHERE account.TenDangNhap = @NormalizedUsername;
END;
GO

PRINT 'Parameterized authentication account lookup procedure is ready.';
GO
