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
:r .\constraints\02_auth_account_audit.sql
:r .\indexes\01_lookup_indexes.sql
:r .\indexes\02_auth_audit_indexes.sql
:r .\indexes\03_catalog_promotion_supplier_indexes.sql
:r .\indexes\04_receiving_lot_indexes.sql
:r .\indexes\05_inventory_alert_indexes.sql
:r .\indexes\06_sale_fefo_indexes.sql
:r .\indexes\07_return_refund_indexes.sql
:r .\views\01_account_role.sql
:r .\views\02_catalog_promotion.sql
:r .\views\03_receiving_lots.sql
:r .\views\04_inventory.sql
:r .\views\05_sale_invoice.sql
:r .\views\06_returns.sql
:r .\procedures\01_get_account_for_authentication.sql
:r .\procedures\02_write_audit_log.sql
:r .\procedures\03_product_lookup.sql
:r .\procedures\04_active_promotions.sql
:r .\procedures\05_supplier_lookup.sql
:r .\procedures\06_product_price_history.sql
:r .\procedures\07_receiving_transactions.sql
:r .\procedures\08_inventory_alert_queries.sql
:r .\procedures\09_sale_transactions.sql
:r .\procedures\10_return_transactions.sql
:r .\seed\01_roles.sql
:r .\seed\02_development_data.sql

PRINT 'Database initialization completed: 23 tables plus auth, catalog, receiving, inventory, FEFO sale and return objects are ready.';
GO
