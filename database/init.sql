:ON ERROR EXIT

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF DB_NAME() IN ('master', 'model', 'msdb', 'tempdb')
BEGIN
    THROW 50001, 'Refusing to initialize the core schema in a SQL Server system database.', 1;
END;
GO

PRINT CONCAT('Initializing convenience-store schema in database [', DB_NAME(), ']...');
GO

:r .\schema\00_drop_core_schema.sql
:r .\schema\01_identity.sql
:r .\schema\02_catalog.sql
:r .\schema\03_inventory.sql
:r .\schema\04_sales_returns_audit.sql
:r .\constraints\01_enforce_and_validate.sql
:r .\indexes\01_lookup_indexes.sql
:r .\seed\01_roles.sql
:r .\seed\02_development_data.sql

PRINT 'Database initialization completed: 23 tables, integrity guards, lookup indexes and baseline seed are ready.';
GO
