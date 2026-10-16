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

:r .\init.schema.sql
:r .\seed\01_roles.sql
:r .\seed\02_development_data.sql

PRINT 'Pre-migration (pre-003/pre-004/pre-005/pre-006) bootstrap completed. Run the Node migration runner before using this database.';
GO
