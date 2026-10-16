:ON ERROR EXIT

SET NOCOUNT ON;
SET XACT_ABORT OFF;
GO

IF DB_NAME() IN ('master', 'model', 'msdb', 'tempdb')
    THROW 53400, 'C70 security tests refuse to run in a SQL Server system database.', 1;

DECLARE @ExpectedRoles TABLE (RoleName SYSNAME NOT NULL PRIMARY KEY);
INSERT INTO @ExpectedRoles (RoleName)
VALUES ('dbms_customer'), ('dbms_cashier'), ('dbms_warehouse'), ('dbms_manager');

IF EXISTS (
    SELECT 1
    FROM @ExpectedRoles AS expected
    LEFT JOIN sys.database_principals AS principal
        ON principal.name = expected.RoleName
       AND principal.type = 'R'
       AND principal.is_fixed_role = 0
    WHERE principal.principal_id IS NULL
)
    THROW 53401, 'All four documented custom database roles must exist.', 1;

IF EXISTS (
    SELECT 1
    FROM sys.database_role_members AS drm
    JOIN sys.database_principals AS role_principal
        ON role_principal.principal_id = drm.role_principal_id
    JOIN sys.database_principals AS member_principal
        ON member_principal.principal_id = drm.member_principal_id
    WHERE role_principal.name IN ('db_owner', 'db_securityadmin', 'db_accessadmin', 'db_ddladmin')
      AND member_principal.name IN ('dbms_customer', 'dbms_cashier', 'dbms_warehouse', 'dbms_manager')
)
    THROW 53402, 'Application database roles must not belong to fixed administrative roles.', 1;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    CREATE USER C70CustomerUser WITHOUT LOGIN;
    CREATE USER C70CashierUser WITHOUT LOGIN;
    CREATE USER C70WarehouseUser WITHOUT LOGIN;
    CREATE USER C70ManagerUser WITHOUT LOGIN;

    ALTER ROLE dbms_customer ADD MEMBER C70CustomerUser;
    ALTER ROLE dbms_cashier ADD MEMBER C70CashierUser;
    ALTER ROLE dbms_warehouse ADD MEMBER C70WarehouseUser;
    ALTER ROLE dbms_manager ADD MEMBER C70ManagerUser;

    IF (
        SELECT COUNT(*)
        FROM sys.database_role_members AS drm
        JOIN sys.database_principals AS role_principal
            ON role_principal.principal_id = drm.role_principal_id
        JOIN sys.database_principals AS member_principal
            ON member_principal.principal_id = drm.member_principal_id
        WHERE role_principal.name IN ('dbms_customer', 'dbms_cashier', 'dbms_warehouse', 'dbms_manager')
          AND member_principal.name IN ('C70CustomerUser', 'C70CashierUser', 'C70WarehouseUser', 'C70ManagerUser')
    ) <> 4
        THROW 53403, 'Temporary users were not mapped one-to-one to the four database roles.', 1;

    -- CUSTOMER: approved catalog projection works; raw/sensitive/admin access fails.
    EXECUTE AS USER = 'C70CustomerUser';
    SELECT TOP (0) * FROM dbo.vw_SAN_PHAM_DANH_MUC;
    SELECT TOP (0) * FROM dbo.vw_KHUYEN_MAI_SAN_PHAM_CHI_TIET;
    IF HAS_PERMS_BY_NAME('dbo.vw_SAN_PHAM_DANH_MUC', 'OBJECT', 'SELECT') <> 1
        THROW 53404, 'CUSTOMER must be able to read the safe catalog view.', 1;
    REVERT;

    DECLARE @CustomerAccountDenied BIT = 0;
    BEGIN TRY
        EXECUTE AS USER = 'C70CustomerUser';
        SELECT TOP (0) * FROM dbo.TAI_KHOAN;
        REVERT;
    END TRY
    BEGIN CATCH
        IF USER_NAME() = 'C70CustomerUser' REVERT;
        IF ERROR_NUMBER() = 229 SET @CustomerAccountDenied = 1 ELSE THROW;
    END CATCH;
    IF @CustomerAccountDenied = 0
        THROW 53405, 'CUSTOMER raw account access must be rejected.', 1;

    EXECUTE AS USER = 'C70CustomerUser';
    IF HAS_PERMS_BY_NAME('dbo.NHAT_KY_HE_THONG', 'OBJECT', 'SELECT') <> 0
       OR HAS_PERMS_BY_NAME('dbo.GIAO_DICH_KHO', 'OBJECT', 'SELECT') <> 0
       OR HAS_PERMS_BY_NAME('dbo.usp_BAO_CAO_DoanhThuTongQuan', 'OBJECT', 'EXECUTE') <> 0
       OR HAS_PERMS_BY_NAME('dbo.SAN_PHAM', 'OBJECT', 'UPDATE') <> 0
        THROW 53406, 'CUSTOMER received audit, stock-ledger, manager-report or direct business DML access.', 1;
    REVERT;

    -- CASHIER: POS lookup executes; warehouse/account/audit access remains blocked.
    EXECUTE AS USER = 'C70CashierUser';
    EXEC dbo.usp_SAN_PHAM_TraCuu @SoTrang = 1, @KichThuocTrang = 1;
    IF HAS_PERMS_BY_NAME('dbo.usp_HOA_DON_HoanTatBanHang', 'OBJECT', 'EXECUTE') <> 1
       OR HAS_PERMS_BY_NAME('dbo.usp_PHIEU_TRA_HoanTat', 'OBJECT', 'EXECUTE') <> 1
       OR HAS_PERMS_BY_NAME('dbo.usp_PHIEU_NHAP_XacNhan', 'OBJECT', 'EXECUTE') <> 0
       OR HAS_PERMS_BY_NAME('dbo.usp_NHAT_KY_HE_THONG_TraCuu', 'OBJECT', 'EXECUTE') <> 0
       OR HAS_PERMS_BY_NAME('dbo.usp_TAI_KHOAN_LayTheoTenDangNhap', 'OBJECT', 'EXECUTE') <> 0
        THROW 53407, 'CASHIER procedure permissions do not match the POS boundary.', 1;
    REVERT;

    DECLARE @CashierAuditDenied BIT = 0;
    BEGIN TRY
        EXECUTE AS USER = 'C70CashierUser';
        SELECT TOP (0) * FROM dbo.vw_NHAT_KY_HE_THONG_CHI_TIET;
        REVERT;
    END TRY
    BEGIN CATCH
        IF USER_NAME() = 'C70CashierUser' REVERT;
        IF ERROR_NUMBER() = 229 SET @CashierAuditDenied = 1 ELSE THROW;
    END CATCH;
    IF @CashierAuditDenied = 0
        THROW 53408, 'CASHIER audit-view access must be rejected.', 1;

    -- WAREHOUSE: inventory lookup executes; POS, approval, account and audit do not.
    EXECUTE AS USER = 'C70WarehouseUser';
    EXEC dbo.usp_TON_KHO_SAN_PHAM_TraCuu @SoTrang = 1, @KichThuocTrang = 1;
    IF HAS_PERMS_BY_NAME('dbo.usp_PHIEU_NHAP_XacNhan', 'OBJECT', 'EXECUTE') <> 1
       OR HAS_PERMS_BY_NAME('dbo.usp_KIEM_KE_Tao', 'OBJECT', 'EXECUTE') <> 1
       OR HAS_PERMS_BY_NAME('dbo.usp_HOA_DON_HoanTatBanHang', 'OBJECT', 'EXECUTE') <> 0
       OR HAS_PERMS_BY_NAME('dbo.usp_KIEM_KE_PheDuyetDieuChinh', 'OBJECT', 'EXECUTE') <> 0
       OR HAS_PERMS_BY_NAME('dbo.usp_NHAT_KY_HE_THONG_TraCuu', 'OBJECT', 'EXECUTE') <> 0
       OR HAS_PERMS_BY_NAME('dbo.TAI_KHOAN', 'OBJECT', 'SELECT') <> 0
        THROW 53409, 'WAREHOUSE permissions do not match the receiving/inventory boundary.', 1;
    REVERT;

    DECLARE @WarehousePosDenied BIT = 0;
    BEGIN TRY
        EXECUTE AS USER = 'C70WarehouseUser';
        SELECT TOP (0) * FROM dbo.vw_HOA_DON_THANH_TOAN;
        REVERT;
    END TRY
    BEGIN CATCH
        IF USER_NAME() = 'C70WarehouseUser' REVERT;
        IF ERROR_NUMBER() = 229 SET @WarehousePosDenied = 1 ELSE THROW;
    END CATCH;
    IF @WarehousePosDenied = 0
        THROW 53410, 'WAREHOUSE payment-view access must be rejected.', 1;

    -- MANAGER: safe account/audit/report reads and master-data update are allowed.
    EXECUTE AS USER = 'C70ManagerUser';
    SELECT TOP (0) * FROM dbo.vw_TAI_KHOAN_VAI_TRO;
    SELECT TOP (0) * FROM dbo.vw_NHAT_KY_HE_THONG_CHI_TIET;
    EXEC dbo.usp_BAO_CAO_DoanhThuTongQuan @TuNgay = '2026-01-01', @DenNgay = '2026-01-01';
    UPDATE dbo.SAN_PHAM SET TenSP = TenSP WHERE 1 = 0;
    IF HAS_PERMS_BY_NAME('dbo.usp_NHAT_KY_HE_THONG_TraCuu', 'OBJECT', 'EXECUTE') <> 1
       OR HAS_PERMS_BY_NAME('dbo.usp_KIEM_KE_PheDuyetDieuChinh', 'OBJECT', 'EXECUTE') <> 1
       OR HAS_PERMS_BY_NAME('dbo.SAN_PHAM', 'OBJECT', 'UPDATE') <> 1
       OR IS_ROLEMEMBER('db_owner') <> 0
       OR HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CONTROL') <> 0
       OR HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'ALTER ANY USER') <> 0
       OR COALESCE(HAS_PERMS_BY_NAME(NULL, 'SERVER', 'ALTER ANY LOGIN'), 0) <> 0
        THROW 53411, 'MANAGER permissions are missing business capability or include DBA authority.', 1;
    REVERT;

    DECLARE @ManagerHashDenied BIT = 0;
    BEGIN TRY
        EXECUTE AS USER = 'C70ManagerUser';
        SELECT TOP (0) MatKhauHash FROM dbo.TAI_KHOAN;
        REVERT;
    END TRY
    BEGIN CATCH
        IF USER_NAME() = 'C70ManagerUser' REVERT;
        IF ERROR_NUMBER() = 229 SET @ManagerHashDenied = 1 ELSE THROW;
    END CATCH;
    IF @ManagerHashDenied = 0
        THROW 53412, 'MANAGER must not read the raw password-hash column.', 1;

    -- Every role is explicitly denied ledger rewriting and migration-history DML.
    IF EXISTS (
        SELECT 1
        FROM (VALUES
            ('dbms_customer'), ('dbms_cashier'), ('dbms_warehouse'), ('dbms_manager')
        ) AS expected(RoleName)
        CROSS JOIN (VALUES
            ('GIAO_DICH_KHO', 'UPDATE'),
            ('GIAO_DICH_KHO', 'DELETE'),
            ('SCHEMA_MIGRATIONS', 'INSERT'),
            ('SCHEMA_MIGRATIONS', 'UPDATE'),
            ('SCHEMA_MIGRATIONS', 'DELETE')
        ) AS required(ObjectName, PermissionName)
        LEFT JOIN sys.database_principals AS role_principal
            ON role_principal.name = expected.RoleName
        LEFT JOIN sys.database_permissions AS permission
            ON permission.grantee_principal_id = role_principal.principal_id
           AND permission.class = 1
           AND permission.major_id = OBJECT_ID(N'dbo.' + required.ObjectName)
           AND permission.permission_name = required.PermissionName
           AND permission.state = 'D'
        WHERE permission.grantee_principal_id IS NULL
    )
        THROW 53413, 'Required explicit DENY permissions are incomplete.', 1;

    DECLARE @MigrationWriteDenied BIT = 0;
    BEGIN TRY
        EXECUTE AS USER = 'C70ManagerUser';
        UPDATE dbo.SCHEMA_MIGRATIONS SET ExecutionTimeMs = ExecutionTimeMs WHERE 1 = 0;
        REVERT;
    END TRY
    BEGIN CATCH
        IF USER_NAME() = 'C70ManagerUser' REVERT;
        IF ERROR_NUMBER() = 229 SET @MigrationWriteDenied = 1 ELSE THROW;
    END CATCH;
    IF @MigrationWriteDenied = 0
        THROW 53414, 'MANAGER must not modify migration history.', 1;

    -- Controlled GRANT/REVOKE proof: direct permission exists, then is removed,
    -- without changing the permanent role policy.
    EXECUTE AS USER = 'C70CustomerUser';
    IF HAS_PERMS_BY_NAME('dbo.VAI_TRO', 'OBJECT', 'SELECT') <> 0
        THROW 53415, 'REVOKE demo requires no inherited VAI_TRO permission.', 1;
    REVERT;

    GRANT SELECT ON OBJECT::dbo.VAI_TRO TO C70CustomerUser;
    EXECUTE AS USER = 'C70CustomerUser';
    IF HAS_PERMS_BY_NAME('dbo.VAI_TRO', 'OBJECT', 'SELECT') <> 1
        THROW 53416, 'Controlled GRANT demo did not take effect.', 1;
    REVERT;

    REVOKE SELECT ON OBJECT::dbo.VAI_TRO FROM C70CustomerUser;
    EXECUTE AS USER = 'C70CustomerUser';
    IF HAS_PERMS_BY_NAME('dbo.VAI_TRO', 'OBJECT', 'SELECT') <> 0
        THROW 53417, 'Controlled REVOKE demo did not remove the direct permission.', 1;
    REVERT;

    ROLLBACK TRANSACTION;
END TRY
BEGIN CATCH
    IF USER_NAME() IN ('C70CustomerUser', 'C70CashierUser', 'C70WarehouseUser', 'C70ManagerUser')
        REVERT;
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

IF DATABASE_PRINCIPAL_ID('C70CustomerUser') IS NOT NULL
   OR DATABASE_PRINCIPAL_ID('C70CashierUser') IS NOT NULL
   OR DATABASE_PRINCIPAL_ID('C70WarehouseUser') IS NOT NULL
   OR DATABASE_PRINCIPAL_ID('C70ManagerUser') IS NOT NULL
    THROW 53418, 'Temporary security test users were not cleaned up.', 1;
GO

PRINT 'C70 security tests passed: roles, membership, table/view/procedure boundaries, DENY and controlled REVOKE.';
GO
