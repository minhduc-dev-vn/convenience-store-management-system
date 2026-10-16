:ON ERROR EXIT

USE [$(DatabaseName)];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DATABASE_PRINCIPAL_ID(N'dbms_customer_user') IS NOT NULL DROP USER dbms_customer_user;
IF DATABASE_PRINCIPAL_ID(N'dbms_cashier_user') IS NOT NULL DROP USER dbms_cashier_user;
IF DATABASE_PRINCIPAL_ID(N'dbms_warehouse_user') IS NOT NULL DROP USER dbms_warehouse_user;
IF DATABASE_PRINCIPAL_ID(N'dbms_manager_user') IS NOT NULL DROP USER dbms_manager_user;
GO

USE [master];
GO

IF SUSER_ID(N'dbms_customer_login') IS NOT NULL DROP LOGIN dbms_customer_login;
IF SUSER_ID(N'dbms_cashier_login') IS NOT NULL DROP LOGIN dbms_cashier_login;
IF SUSER_ID(N'dbms_warehouse_login') IS NOT NULL DROP LOGIN dbms_warehouse_login;
IF SUSER_ID(N'dbms_manager_login') IS NOT NULL DROP LOGIN dbms_manager_login;
GO
