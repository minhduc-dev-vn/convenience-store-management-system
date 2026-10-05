SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Copy this file to the next NNN_lowercase_name.sql filename.
-- Never edit a migration that has already been applied to a shared environment.
-- Keep each migration deterministic and compatible with one transaction.
-- Do not add sqlcmd directives or batch separators; the Node runner executes this file as one batch.

-- Example idempotent shape:
-- IF COL_LENGTH(N'dbo.EXAMPLE_TABLE', N'ExampleColumn') IS NULL
-- BEGIN
--     ALTER TABLE dbo.EXAMPLE_TABLE
--         ADD ExampleColumn INT NULL;
-- END;
