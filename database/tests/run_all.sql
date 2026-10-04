:ON ERROR EXIT

SET NOCOUNT ON;
GO

IF DB_NAME() IN ('master', 'model', 'msdb', 'tempdb')
    THROW 53020, 'The full database test runner refuses to run in a SQL Server system database.', 1;
GO

PRINT CONCAT('Running the full database test suite in [', DB_NAME(), ']...');
GO

:r .\tests\01_auth_audit_tests.sql
:r .\tests\02_catalog_promotion_supplier_tests.sql
:r .\tests\03_receiving_transactions_tests.sql
:r .\tests\04_inventory_alert_queries_tests.sql
:r .\tests\05_sale_transactions_tests.sql
:r .\tests\06_return_transactions_tests.sql
:r .\tests\07_stocktake_transactions_tests.sql
:r .\tests\08_audit_log_tests.sql
:r .\tests\09_business_report_tests.sql
:r .\tests\10_integrity_packaging_tests.sql

PRINT 'Full database test suite passed: integrity, receiving, inventory, FEFO sale, return, stocktake, audit and reporting.';
GO
