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
    THROW 50001, 'Refusing to bootstrap the core schema in a SQL Server system database.', 1;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.tables
    WHERE schema_id = SCHEMA_ID(N'dbo')
)
BEGIN
    THROW 50002, 'Production bootstrap requires a new database with no dbo tables.', 1;
END;
GO

PRINT CONCAT('Bootstrapping production convenience-store schema in database [', DB_NAME(), ']...');
GO

:r .\init.schema.sql
:r .\seed\01_roles.sql

DECLARE @ExpectedCoreTables TABLE (TableName SYSNAME NOT NULL PRIMARY KEY);

INSERT INTO @ExpectedCoreTables (TableName)
VALUES
    ('VAI_TRO'), ('NHAN_VIEN'), ('KHACH_HANG'), ('TAI_KHOAN'), ('CA_LAM_VIEC'),
    ('LOAI_SAN_PHAM'), ('SAN_PHAM'), ('KHUYEN_MAI'), ('KHUYEN_MAI_SAN_PHAM'),
    ('NHA_CUNG_CAP'), ('PHIEU_NHAP'), ('LO_HANG'), ('CHI_TIET_PHIEU_NHAP'),
    ('KIEM_KE'), ('CHI_TIET_KIEM_KE'), ('GIAO_DICH_KHO'), ('HOA_DON'),
    ('CHI_TIET_HOA_DON'), ('CHI_TIET_XUAT_LO'), ('THANH_TOAN'), ('PHIEU_TRA'),
    ('CHI_TIET_PHIEU_TRA'), ('NHAT_KY_HE_THONG');

IF (SELECT COUNT(*) FROM sys.tables WHERE schema_id = SCHEMA_ID(N'dbo')) <> 23
   OR EXISTS (
       SELECT 1
       FROM @ExpectedCoreTables AS expected
       WHERE OBJECT_ID(N'dbo.' + QUOTENAME(expected.TableName), N'U') IS NULL
   )
BEGIN
    THROW 50003, 'Production bootstrap did not create exactly the 23 documented core tables.', 1;
END;

IF (SELECT COUNT(*) FROM dbo.VAI_TRO WHERE MaVaiTro IN ('CUSTOMER', 'CASHIER', 'WAREHOUSE', 'MANAGER')) <> 4
   OR (SELECT COUNT(*) FROM dbo.VAI_TRO) <> 4
BEGIN
    THROW 50004, 'Production bootstrap did not create exactly the four canonical roles.', 1;
END;

IF EXISTS (SELECT 1 FROM dbo.NHAN_VIEN WHERE MaNV = 'NVDEV001')
   OR EXISTS (SELECT 1 FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'LDEV001')
   OR EXISTS (SELECT 1 FROM dbo.SAN_PHAM WHERE MaSP = 'SPDEV001')
   OR EXISTS (SELECT 1 FROM dbo.NHA_CUNG_CAP WHERE MaNCC = 'NCCDEV001')
   OR EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'LODEV001')
BEGIN
    THROW 50005, 'Production bootstrap must not create development seed data.', 1;
END;
GO

PRINT 'Production bootstrap completed: 23 core tables, database objects and four canonical roles; no development seed was created.';
GO
