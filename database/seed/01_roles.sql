SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @Roles TABLE (
        MaVaiTro VARCHAR(20) NOT NULL PRIMARY KEY,
        TenVaiTro NVARCHAR(50) NOT NULL,
        MoTa NVARCHAR(255) NOT NULL
    );

    INSERT INTO @Roles (MaVaiTro, TenVaiTro, MoTa)
    VALUES
        ('CUSTOMER', N'Khách hàng', N'Tài khoản khách hàng thành viên.'),
        ('CASHIER', N'Thu ngân', N'Nhân viên thực hiện nghiệp vụ bán hàng tại quầy.'),
        ('WAREHOUSE', N'Nhân viên kho', N'Nhân viên thực hiện nghiệp vụ nhập hàng và quản lý tồn kho.'),
        ('MANAGER', N'Quản lý', N'Nhân viên quản lý cấu hình, phê duyệt và báo cáo.');

    UPDATE target
    SET
        target.TenVaiTro = source.TenVaiTro,
        target.MoTa = source.MoTa
    FROM dbo.VAI_TRO AS target
    JOIN @Roles AS source ON source.MaVaiTro = target.MaVaiTro;

    INSERT INTO dbo.VAI_TRO (MaVaiTro, TenVaiTro, MoTa)
    SELECT source.MaVaiTro, source.TenVaiTro, source.MoTa
    FROM @Roles AS source
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.VAI_TRO AS target
        WHERE target.MaVaiTro = source.MaVaiTro
    );

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
