:ON ERROR EXIT

SET NOCOUNT ON;
SET XACT_ABORT OFF;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF DB_NAME() IN ('master', 'model', 'msdb', 'tempdb')
    THROW 53000, 'C50 integrity tests refuse to run in a SQL Server system database.', 1;

DECLARE @CoreTables TABLE (TableName SYSNAME PRIMARY KEY);

INSERT INTO @CoreTables (TableName)
VALUES
    ('VAI_TRO'), ('NHAN_VIEN'), ('KHACH_HANG'), ('TAI_KHOAN'),
    ('CA_LAM_VIEC'), ('LOAI_SAN_PHAM'), ('SAN_PHAM'), ('KHUYEN_MAI'),
    ('KHUYEN_MAI_SAN_PHAM'), ('NHA_CUNG_CAP'), ('PHIEU_NHAP'),
    ('LO_HANG'), ('CHI_TIET_PHIEU_NHAP'), ('KIEM_KE'),
    ('CHI_TIET_KIEM_KE'), ('GIAO_DICH_KHO'), ('HOA_DON'),
    ('CHI_TIET_HOA_DON'), ('CHI_TIET_XUAT_LO'), ('THANH_TOAN'),
    ('PHIEU_TRA'), ('CHI_TIET_PHIEU_TRA'), ('NHAT_KY_HE_THONG');

IF (
    SELECT COUNT(*)
    FROM sys.tables
    WHERE schema_id = SCHEMA_ID('dbo')
      AND name <> 'SCHEMA_MIGRATIONS'
) <> 23
   OR EXISTS (
       SELECT 1
       FROM sys.tables AS actual
       WHERE actual.schema_id = SCHEMA_ID('dbo')
         AND actual.name <> 'SCHEMA_MIGRATIONS'
         AND NOT EXISTS (
             SELECT 1 FROM @CoreTables AS expected WHERE expected.TableName = actual.name
         )
   )
   OR EXISTS (
       SELECT 1
       FROM @CoreTables AS expected
       WHERE OBJECT_ID(N'dbo.' + expected.TableName, 'U') IS NULL
   )
    THROW 53001, 'The database must contain exactly the documented 23 dbo core tables.', 1;

IF (
    SELECT COUNT(*)
    FROM sys.key_constraints AS key_constraint
    JOIN sys.tables AS core_table ON core_table.object_id = key_constraint.parent_object_id
    WHERE key_constraint.schema_id = SCHEMA_ID('dbo')
      AND key_constraint.type = 'PK'
      AND EXISTS (
          SELECT 1 FROM @CoreTables AS expected WHERE expected.TableName = core_table.name
      )
) <> 23
    THROW 53002, 'Every core table must have exactly one primary key.', 1;

IF (
    SELECT COUNT(*)
    FROM sys.foreign_keys AS foreign_key
    JOIN sys.tables AS core_table ON core_table.object_id = foreign_key.parent_object_id
    WHERE foreign_key.schema_id = SCHEMA_ID('dbo')
      AND EXISTS (
          SELECT 1 FROM @CoreTables AS expected WHERE expected.TableName = core_table.name
      )
) <> 31
    THROW 53003, 'The documented core schema must contain exactly 31 foreign keys.', 1;

IF EXISTS (
    SELECT 1
    FROM sys.foreign_keys AS foreign_key
    JOIN sys.tables AS core_table ON core_table.object_id = foreign_key.parent_object_id
    WHERE foreign_key.schema_id = SCHEMA_ID('dbo')
      AND EXISTS (
          SELECT 1 FROM @CoreTables AS expected WHERE expected.TableName = core_table.name
      )
      AND (foreign_key.is_disabled = 1 OR foreign_key.is_not_trusted = 1)
)
    THROW 53004, 'All dbo foreign keys must be enabled and trusted.', 1;

IF (
    SELECT COUNT(*)
    FROM sys.check_constraints AS check_constraint
    JOIN sys.tables AS core_table ON core_table.object_id = check_constraint.parent_object_id
    WHERE check_constraint.schema_id = SCHEMA_ID('dbo')
      AND EXISTS (
          SELECT 1 FROM @CoreTables AS expected WHERE expected.TableName = core_table.name
      )
) <> 56
   OR EXISTS (
       SELECT 1
       FROM sys.check_constraints AS check_constraint
       JOIN sys.tables AS core_table ON core_table.object_id = check_constraint.parent_object_id
       WHERE check_constraint.schema_id = SCHEMA_ID('dbo')
         AND EXISTS (
             SELECT 1 FROM @CoreTables AS expected WHERE expected.TableName = core_table.name
         )
         AND (check_constraint.is_disabled = 1 OR check_constraint.is_not_trusted = 1)
   )
    THROW 53005, 'The 56 documented CHECK constraints must be present, enabled and trusted.', 1;

IF (
    SELECT COUNT(*)
    FROM sys.default_constraints AS default_constraint
    JOIN sys.tables AS core_table ON core_table.object_id = default_constraint.parent_object_id
    WHERE default_constraint.schema_id = SCHEMA_ID('dbo')
      AND EXISTS (
          SELECT 1 FROM @CoreTables AS expected WHERE expected.TableName = core_table.name
      )
) <> 41
    THROW 53006, 'The 41 documented DEFAULT constraints must be present.', 1;

IF (
    SELECT COUNT(*)
    FROM sys.key_constraints AS key_constraint
    JOIN sys.tables AS core_table ON core_table.object_id = key_constraint.parent_object_id
    WHERE key_constraint.schema_id = SCHEMA_ID('dbo')
      AND key_constraint.type = 'UQ'
      AND EXISTS (
          SELECT 1 FROM @CoreTables AS expected WHERE expected.TableName = core_table.name
      )
) <> 8
    THROW 53007, 'The documented schema-level UNIQUE constraints must be preserved.', 1;

IF EXISTS (
    SELECT 1
    FROM (VALUES ('CUSTOMER'), ('CASHIER'), ('WAREHOUSE'), ('MANAGER')) AS expected(MaVaiTro)
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.VAI_TRO AS actual WHERE actual.MaVaiTro = expected.MaVaiTro
    )
)
   OR (SELECT COUNT(*) FROM dbo.VAI_TRO) <> 4
    THROW 53008, 'Baseline seed must contain exactly the four canonical roles.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.SAN_PHAM WHERE MaSP = 'SPDEV001')
   OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'LODEV001')
   OR NOT EXISTS (SELECT 1 FROM dbo.NHA_CUNG_CAP WHERE MaNCC = 'NCCDEV001')
    THROW 53009, 'Baseline development seed is incomplete.', 1;
GO

BEGIN TRANSACTION;

DECLARE @PrimaryKeyRejected BIT = 0;
DECLARE @ForeignKeyRejected BIT = 0;
DECLARE @UniqueRejected BIT = 0;
DECLARE @CheckRejected BIT = 0;

BEGIN TRY
    INSERT INTO dbo.VAI_TRO (MaVaiTro, TenVaiTro)
    VALUES ('CUSTOMER', N'Vai trò trùng C50');
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() IN (2601, 2627)
        SET @PrimaryKeyRejected = 1;
    ELSE
        THROW;
END CATCH;

BEGIN TRY
    INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, MaVach, DonViTinh, GiaBan, MucTonToiThieu, MaLoai
    )
    VALUES ('C50FK001', N'Sản phẩm FK C50', 'C50-FK-001', N'Cái', 1000, 0, 'MISSING');
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 547
        SET @ForeignKeyRejected = 1;
    ELSE
        THROW;
END CATCH;

BEGIN TRY
    INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, MaVach, DonViTinh, GiaBan, MucTonToiThieu, MaLoai
    )
    SELECT 'C50UQ001', N'Sản phẩm UNIQUE C50', MaVach, N'Cái', 1000, 0, MaLoai
    FROM dbo.SAN_PHAM
    WHERE MaSP = 'SPDEV001';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() IN (2601, 2627)
        SET @UniqueRejected = 1;
    ELSE
        THROW;
END CATCH;

BEGIN TRY
    UPDATE dbo.LO_HANG
    SET SoLuongTon = -1
    WHERE MaLo = 'LODEV001';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 547
        SET @CheckRejected = 1;
    ELSE
        THROW;
END CATCH;

INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai)
VALUES ('C50DEF01', N'Danh mục default C50');

IF NOT EXISTS (
    SELECT 1
    FROM dbo.LOAI_SAN_PHAM
    WHERE MaLoai = 'C50DEF01'
      AND TrangThai = 'ACTIVE'
)
BEGIN
    ROLLBACK TRANSACTION;
    THROW 53010, 'DEFAULT constraint did not assign the documented ACTIVE category status.', 1;
END;

IF @PrimaryKeyRejected = 0
   OR @ForeignKeyRejected = 0
   OR @UniqueRejected = 0
   OR @CheckRejected = 0
BEGIN
    ROLLBACK TRANSACTION;
    THROW 53011, 'One or more PK/FK/UNIQUE/CHECK negative integrity tests were accepted.', 1;
END;

ROLLBACK TRANSACTION;

IF EXISTS (SELECT 1 FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'C50DEF01')
   OR EXISTS (SELECT 1 FROM dbo.SAN_PHAM WHERE MaSP IN ('C50FK001', 'C50UQ001'))
    THROW 53012, 'C50 integrity fixtures were not rolled back completely.', 1;
GO

PRINT 'C50 integrity tests passed: 23-table shape, PK/FK/UNIQUE/CHECK/DEFAULT enforcement, canonical seed and rollback cleanup.';
GO
