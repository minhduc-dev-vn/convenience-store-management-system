SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID('dbo.TAI_KHOAN')
          AND name = 'CK_TAI_KHOAN_OwnerRole'
    )
        ALTER TABLE dbo.TAI_KHOAN DROP CONSTRAINT CK_TAI_KHOAN_OwnerRole;

    ALTER TABLE dbo.TAI_KHOAN WITH CHECK
    ADD CONSTRAINT CK_TAI_KHOAN_OwnerRole CHECK (
        (MaVaiTro = 'CUSTOMER' AND MaKH IS NOT NULL AND MaNV IS NULL)
        OR
        (MaVaiTro IN ('CASHIER', 'WAREHOUSE', 'MANAGER') AND MaNV IS NOT NULL AND MaKH IS NULL)
    );

    ALTER TABLE dbo.TAI_KHOAN CHECK CONSTRAINT CK_TAI_KHOAN_OwnerRole;

    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID('dbo.NHAT_KY_HE_THONG')
          AND name = 'CK_NHAT_KY_HE_THONG_NoSensitiveData'
    )
        ALTER TABLE dbo.NHAT_KY_HE_THONG DROP CONSTRAINT CK_NHAT_KY_HE_THONG_NoSensitiveData;

    ALTER TABLE dbo.NHAT_KY_HE_THONG WITH CHECK
    ADD CONSTRAINT CK_NHAT_KY_HE_THONG_NoSensitiveData CHECK (
        LOWER(CONCAT(COALESCE(DuLieuCu, N''), N' ', COALESCE(DuLieuMoi, N''))) NOT LIKE N'%matkhau%'
        AND LOWER(CONCAT(COALESCE(DuLieuCu, N''), N' ', COALESCE(DuLieuMoi, N''))) NOT LIKE N'%mật khẩu%'
        AND LOWER(CONCAT(COALESCE(DuLieuCu, N''), N' ', COALESCE(DuLieuMoi, N''))) NOT LIKE N'%password%'
        AND LOWER(CONCAT(COALESCE(DuLieuCu, N''), N' ', COALESCE(DuLieuMoi, N''))) NOT LIKE N'%token%'
        AND LOWER(CONCAT(COALESCE(DuLieuCu, N''), N' ', COALESCE(DuLieuMoi, N''))) NOT LIKE N'%secret%'
        AND LOWER(CONCAT(COALESCE(DuLieuCu, N''), N' ', COALESCE(DuLieuMoi, N''))) NOT LIKE N'%authorization%'
        AND LOWER(CONCAT(COALESCE(DuLieuCu, N''), N' ', COALESCE(DuLieuMoi, N''))) NOT LIKE N'%jwt%'
    );

    ALTER TABLE dbo.NHAT_KY_HE_THONG CHECK CONSTRAINT CK_NHAT_KY_HE_THONG_NoSensitiveData;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id IN (OBJECT_ID('dbo.TAI_KHOAN'), OBJECT_ID('dbo.NHAT_KY_HE_THONG'))
      AND name IN ('CK_TAI_KHOAN_OwnerRole', 'CK_NHAT_KY_HE_THONG_NoSensitiveData')
      AND (is_disabled = 1 OR is_not_trusted = 1)
)
    THROW 51030, 'Authentication and audit CHECK constraints must be enabled and trusted.', 1;
GO

PRINT 'Authentication owner-role and audit sensitive-data constraints are ready.';
GO
