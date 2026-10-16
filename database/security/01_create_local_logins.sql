:ON ERROR EXIT

-- Required sqlcmd variables:
--   DatabaseName, DBMS_CUSTOMER_PASSWORD, DBMS_CASHIER_PASSWORD,
--   DBMS_WAREHOUSE_PASSWORD, DBMS_MANAGER_PASSWORD
-- Passwords are runtime input only. This script never prints or persists them.

USE [master];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF CAST(SERVERPROPERTY('IsIntegratedSecurityOnly') AS INT) <> 0
    THROW 53500, 'SQL authentication is unavailable because this instance is Windows-authentication-only.', 1;

IF DB_ID(N'$(DatabaseName)') IS NULL
    THROW 53501, 'The target database does not exist.', 1;

IF LEN(N'$(DBMS_CUSTOMER_PASSWORD)') < 16
   OR LEN(N'$(DBMS_CASHIER_PASSWORD)') < 16
   OR LEN(N'$(DBMS_WAREHOUSE_PASSWORD)') < 16
   OR LEN(N'$(DBMS_MANAGER_PASSWORD)') < 16
    THROW 53502, 'Each runtime SQL login password must contain at least 16 characters.', 1;

IF SUSER_ID(N'dbms_customer_login') IS NULL
    CREATE LOGIN dbms_customer_login
    WITH PASSWORD = N'$(DBMS_CUSTOMER_PASSWORD)', CHECK_POLICY = ON,
         CHECK_EXPIRATION = OFF, DEFAULT_DATABASE = [$(DatabaseName)];

IF SUSER_ID(N'dbms_cashier_login') IS NULL
    CREATE LOGIN dbms_cashier_login
    WITH PASSWORD = N'$(DBMS_CASHIER_PASSWORD)', CHECK_POLICY = ON,
         CHECK_EXPIRATION = OFF, DEFAULT_DATABASE = [$(DatabaseName)];

IF SUSER_ID(N'dbms_warehouse_login') IS NULL
    CREATE LOGIN dbms_warehouse_login
    WITH PASSWORD = N'$(DBMS_WAREHOUSE_PASSWORD)', CHECK_POLICY = ON,
         CHECK_EXPIRATION = OFF, DEFAULT_DATABASE = [$(DatabaseName)];

IF SUSER_ID(N'dbms_manager_login') IS NULL
    CREATE LOGIN dbms_manager_login
    WITH PASSWORD = N'$(DBMS_MANAGER_PASSWORD)', CHECK_POLICY = ON,
         CHECK_EXPIRATION = OFF, DEFAULT_DATABASE = [$(DatabaseName)];
GO

USE [$(DatabaseName)];
GO

IF DATABASE_PRINCIPAL_ID(N'dbms_customer') IS NULL
   OR DATABASE_PRINCIPAL_ID(N'dbms_cashier') IS NULL
   OR DATABASE_PRINCIPAL_ID(N'dbms_warehouse') IS NULL
   OR DATABASE_PRINCIPAL_ID(N'dbms_manager') IS NULL
    THROW 53503, 'Apply migration 006 before creating local login mappings.', 1;

IF DATABASE_PRINCIPAL_ID(N'dbms_customer_user') IS NULL
    CREATE USER dbms_customer_user FOR LOGIN dbms_customer_login;
ELSE
    ALTER USER dbms_customer_user WITH LOGIN = dbms_customer_login;

IF DATABASE_PRINCIPAL_ID(N'dbms_cashier_user') IS NULL
    CREATE USER dbms_cashier_user FOR LOGIN dbms_cashier_login;
ELSE
    ALTER USER dbms_cashier_user WITH LOGIN = dbms_cashier_login;

IF DATABASE_PRINCIPAL_ID(N'dbms_warehouse_user') IS NULL
    CREATE USER dbms_warehouse_user FOR LOGIN dbms_warehouse_login;
ELSE
    ALTER USER dbms_warehouse_user WITH LOGIN = dbms_warehouse_login;

IF DATABASE_PRINCIPAL_ID(N'dbms_manager_user') IS NULL
    CREATE USER dbms_manager_user FOR LOGIN dbms_manager_login;
ELSE
    ALTER USER dbms_manager_user WITH LOGIN = dbms_manager_login;

IF IS_ROLEMEMBER(N'dbms_customer', N'dbms_customer_user') <> 1
    ALTER ROLE dbms_customer ADD MEMBER dbms_customer_user;

IF IS_ROLEMEMBER(N'dbms_cashier', N'dbms_cashier_user') <> 1
    ALTER ROLE dbms_cashier ADD MEMBER dbms_cashier_user;

IF IS_ROLEMEMBER(N'dbms_warehouse', N'dbms_warehouse_user') <> 1
    ALTER ROLE dbms_warehouse ADD MEMBER dbms_warehouse_user;

IF IS_ROLEMEMBER(N'dbms_manager', N'dbms_manager_user') <> 1
    ALTER ROLE dbms_manager ADD MEMBER dbms_manager_user;
GO

SELECT
    CAST(SERVERPROPERTY('IsIntegratedSecurityOnly') AS INT) AS IsIntegratedSecurityOnly,
    DB_NAME() AS DatabaseName,
    login_principal.name AS LoginName,
    database_principal.name AS DatabaseUserName,
    role_principal.name AS DatabaseRoleName
FROM sys.database_role_members AS drm
JOIN sys.database_principals AS role_principal
    ON role_principal.principal_id = drm.role_principal_id
JOIN sys.database_principals AS database_principal
    ON database_principal.principal_id = drm.member_principal_id
JOIN master.sys.server_principals AS login_principal
    ON login_principal.sid = database_principal.sid
WHERE role_principal.name IN (N'dbms_customer', N'dbms_cashier', N'dbms_warehouse', N'dbms_manager')
  AND database_principal.name IN (N'dbms_customer_user', N'dbms_cashier_user', N'dbms_warehouse_user', N'dbms_manager_user')
ORDER BY role_principal.name;
GO
