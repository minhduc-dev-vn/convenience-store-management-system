:ON ERROR EXIT

USE [$(DatabaseName)];
GO

SET NOCOUNT ON;

SELECT
    role_principal.name AS DatabaseRole,
    permission.state_desc AS PermissionState,
    permission.permission_name AS PermissionName,
    object_schema_name(permission.major_id) AS ObjectSchema,
    object_name(permission.major_id) AS ObjectName,
    object_definition.type_desc AS ObjectType
FROM sys.database_permissions AS permission
JOIN sys.database_principals AS role_principal
    ON role_principal.principal_id = permission.grantee_principal_id
LEFT JOIN sys.objects AS object_definition
    ON object_definition.object_id = permission.major_id
WHERE role_principal.name IN (N'dbms_customer', N'dbms_cashier', N'dbms_warehouse', N'dbms_manager')
ORDER BY role_principal.name, permission.state_desc, object_definition.type_desc,
         object_name(permission.major_id), permission.permission_name;
GO

EXECUTE AS USER = 'dbms_customer_user';
SELECT
    USER_NAME() AS DatabaseUser,
    IS_ROLEMEMBER(N'dbms_customer') AS IsExpectedRoleMember,
    HAS_PERMS_BY_NAME(N'dbo.vw_SAN_PHAM_DANH_MUC', N'OBJECT', N'SELECT') AS AllowedCatalogView,
    HAS_PERMS_BY_NAME(N'dbo.TAI_KHOAN', N'OBJECT', N'SELECT') AS DeniedRawAccount,
    HAS_PERMS_BY_NAME(N'dbo.usp_BAO_CAO_DoanhThuTongQuan', N'OBJECT', N'EXECUTE') AS DeniedManagerReport;
REVERT;

EXECUTE AS USER = 'dbms_cashier_user';
SELECT
    USER_NAME() AS DatabaseUser,
    IS_ROLEMEMBER(N'dbms_cashier') AS IsExpectedRoleMember,
    HAS_PERMS_BY_NAME(N'dbo.usp_HOA_DON_HoanTatBanHang', N'OBJECT', N'EXECUTE') AS AllowedCheckout,
    HAS_PERMS_BY_NAME(N'dbo.usp_PHIEU_NHAP_XacNhan', N'OBJECT', N'EXECUTE') AS DeniedReceiving,
    HAS_PERMS_BY_NAME(N'dbo.NHAT_KY_HE_THONG', N'OBJECT', N'SELECT') AS DeniedRawAudit;
REVERT;

EXECUTE AS USER = 'dbms_warehouse_user';
SELECT
    USER_NAME() AS DatabaseUser,
    IS_ROLEMEMBER(N'dbms_warehouse') AS IsExpectedRoleMember,
    HAS_PERMS_BY_NAME(N'dbo.usp_PHIEU_NHAP_XacNhan', N'OBJECT', N'EXECUTE') AS AllowedReceiving,
    HAS_PERMS_BY_NAME(N'dbo.usp_HOA_DON_HoanTatBanHang', N'OBJECT', N'EXECUTE') AS DeniedCheckout,
    HAS_PERMS_BY_NAME(N'dbo.usp_KIEM_KE_PheDuyetDieuChinh', N'OBJECT', N'EXECUTE') AS DeniedApproval;
REVERT;

EXECUTE AS USER = 'dbms_manager_user';
SELECT
    USER_NAME() AS DatabaseUser,
    IS_ROLEMEMBER(N'dbms_manager') AS IsExpectedRoleMember,
    HAS_PERMS_BY_NAME(N'dbo.usp_BAO_CAO_DoanhThuTongQuan', N'OBJECT', N'EXECUTE') AS AllowedReport,
    HAS_PERMS_BY_NAME(N'dbo.vw_NHAT_KY_HE_THONG_CHI_TIET', N'OBJECT', N'SELECT') AS AllowedAuditView,
    HAS_PERMS_BY_NAME(N'dbo.TAI_KHOAN', N'OBJECT', N'SELECT') AS DeniedRawAccount,
    HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'CONTROL') AS DeniedDatabaseControl;
REVERT;
GO
