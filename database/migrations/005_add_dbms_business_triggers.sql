SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF OBJECT_ID(N'dbo.GIAO_DICH_KHO', N'U') IS NULL
   OR OBJECT_ID(N'dbo.CHI_TIET_PHIEU_NHAP', N'U') IS NULL
   OR OBJECT_ID(N'dbo.CHI_TIET_HOA_DON', N'U') IS NULL
   OR OBJECT_ID(N'dbo.LO_HANG', N'U') IS NULL
   OR COL_LENGTH(N'dbo.GIAO_DICH_KHO', N'MaSP') IS NOT NULL
   OR (
       SELECT COUNT(*)
       FROM sys.objects
       WHERE schema_id = SCHEMA_ID(N'dbo')
         AND type IN ('FN', 'IF', 'TF')
   ) <> 5
    THROW 51060, 'Business-trigger migration requires the final Phase 3 schema.', 1;

EXEC sys.sp_executesql N'
CREATE OR ALTER TRIGGER dbo.trg_GIAO_DICH_KHO_AppendOnly
ON dbo.GIAO_DICH_KHO
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Match the existing audit-ledger contract: database owners retain a
    -- maintenance path, while application principals cannot rewrite history.
    IF COALESCE(IS_SRVROLEMEMBER(''sysadmin''), 0) = 1
       OR COALESCE(IS_ROLEMEMBER(''db_owner''), 0) = 1
        RETURN;

    IF EXISTS (SELECT 1 FROM deleted)
        THROW 53200, ''Inventory movements are append-only and cannot be updated or deleted.'', 1;
END;';

EXEC sys.sp_executesql N'
CREATE OR ALTER TRIGGER dbo.trg_CHI_TIET_PHIEU_NHAP_ChiSuaKhiDraft
ON dbo.CHI_TIET_PHIEU_NHAP
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF COALESCE(IS_SRVROLEMEMBER(''sysadmin''), 0) = 1
       OR COALESCE(IS_ROLEMEMBER(''db_owner''), 0) = 1
        RETURN;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT MaPN FROM inserted
            UNION
            SELECT MaPN FROM deleted
        ) AS affected
        JOIN dbo.PHIEU_NHAP AS receipt ON receipt.MaPN = affected.MaPN
        WHERE receipt.TrangThai <> ''DRAFT''
    )
        THROW 53201, ''Receipt details can only be changed while the receipt is DRAFT.'', 1;
END;';

EXEC sys.sp_executesql N'
CREATE OR ALTER TRIGGER dbo.trg_CHI_TIET_HOA_DON_ChiSuaKhiDraft
ON dbo.CHI_TIET_HOA_DON
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF COALESCE(IS_SRVROLEMEMBER(''sysadmin''), 0) = 1
       OR COALESCE(IS_ROLEMEMBER(''db_owner''), 0) = 1
        RETURN;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT MaHD FROM inserted
            UNION
            SELECT MaHD FROM deleted
        ) AS affected
        JOIN dbo.HOA_DON AS invoice ON invoice.MaHD = affected.MaHD
        WHERE invoice.TrangThai <> ''DRAFT''
    )
        THROW 53202, ''Invoice details can only be changed while the invoice is DRAFT.'', 1;
END;';

EXEC sys.sp_executesql N'
CREATE OR ALTER TRIGGER dbo.trg_LO_HANG_BaoVeSanPhamSauPhatSinh
ON dbo.LO_HANG
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF COALESCE(IS_SRVROLEMEMBER(''sysadmin''), 0) = 1
       OR COALESCE(IS_ROLEMEMBER(''db_owner''), 0) = 1
        RETURN;

    IF EXISTS (
        SELECT 1
        FROM inserted AS current_lot
        JOIN deleted AS previous_lot ON previous_lot.MaLo = current_lot.MaLo
        WHERE current_lot.MaSP <> previous_lot.MaSP
          AND (
              EXISTS (
                  SELECT 1
                  FROM dbo.CHI_TIET_PHIEU_NHAP AS receipt_line
                  JOIN dbo.PHIEU_NHAP AS receipt ON receipt.MaPN = receipt_line.MaPN
                  WHERE receipt_line.MaLo = current_lot.MaLo
                    AND receipt.TrangThai = ''CONFIRMED''
              )
              OR EXISTS (
                  SELECT 1
                  FROM dbo.GIAO_DICH_KHO AS movement
                  WHERE movement.MaLo = current_lot.MaLo
              )
              OR EXISTS (
                  SELECT 1
                  FROM dbo.CHI_TIET_XUAT_LO AS allocation
                  WHERE allocation.MaLo = current_lot.MaLo
              )
              OR EXISTS (
                  SELECT 1
                  FROM dbo.CHI_TIET_PHIEU_TRA AS return_line
                  WHERE return_line.MaLo = current_lot.MaLo
              )
              OR EXISTS (
                  SELECT 1
                  FROM dbo.CHI_TIET_KIEM_KE AS stocktake_line
                  WHERE stocktake_line.MaLo = current_lot.MaLo
              )
          )
    )
        THROW 53203, ''A lot product cannot be reassigned after the lot has business history.'', 1;
END;';

DECLARE @ExpectedTriggers TABLE (
    TriggerName SYSNAME NOT NULL PRIMARY KEY,
    ParentTable SYSNAME NOT NULL
);

INSERT INTO @ExpectedTriggers (TriggerName, ParentTable)
VALUES
    (N'trg_NHAT_KY_HE_THONG_AppendOnly', N'NHAT_KY_HE_THONG'),
    (N'trg_GIAO_DICH_KHO_AppendOnly', N'GIAO_DICH_KHO'),
    (N'trg_CHI_TIET_PHIEU_NHAP_ChiSuaKhiDraft', N'CHI_TIET_PHIEU_NHAP'),
    (N'trg_CHI_TIET_HOA_DON_ChiSuaKhiDraft', N'CHI_TIET_HOA_DON'),
    (N'trg_LO_HANG_BaoVeSanPhamSauPhatSinh', N'LO_HANG');

IF (
    SELECT COUNT(*)
    FROM sys.triggers AS trigger_definition
    JOIN sys.tables AS parent_table
        ON parent_table.object_id = trigger_definition.parent_id
    WHERE trigger_definition.parent_class = 1
      AND trigger_definition.is_ms_shipped = 0
      AND parent_table.schema_id = SCHEMA_ID(N'dbo')
) <> 5
   OR EXISTS (
       SELECT 1
       FROM @ExpectedTriggers AS expected
       LEFT JOIN sys.triggers AS trigger_definition
           ON trigger_definition.name = expected.TriggerName
          AND trigger_definition.parent_class = 1
       LEFT JOIN sys.tables AS parent_table
           ON parent_table.object_id = trigger_definition.parent_id
          AND parent_table.schema_id = SCHEMA_ID(N'dbo')
       WHERE trigger_definition.object_id IS NULL
          OR parent_table.name <> expected.ParentTable
          OR trigger_definition.is_disabled = 1
   )
    THROW 51061, 'Phase 4 schema must contain exactly five enabled dbo table triggers on the documented parent tables.', 1;
