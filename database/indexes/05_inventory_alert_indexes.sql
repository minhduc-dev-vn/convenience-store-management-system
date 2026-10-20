SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.LO_HANG')
      AND name = 'IX_LO_HANG_MaSP_HanSuDung_ConTon'
)
BEGIN
    CREATE INDEX IX_LO_HANG_MaSP_HanSuDung_ConTon
        ON dbo.LO_HANG (MaSP, HanSuDung)
        INCLUDE (MaLo, SoLo, NgaySanXuat, SoLuongTon, TrangThai, GiaNhap)
        WHERE SoLuongTon > 0;
END;
GO

DECLARE @RequiredInventoryIndexes TABLE (
    TableName SYSNAME NOT NULL,
    IndexName SYSNAME NOT NULL,
    PRIMARY KEY (TableName, IndexName)
);

INSERT INTO @RequiredInventoryIndexes (TableName, IndexName)
VALUES
    ('SAN_PHAM', 'IX_SAN_PHAM_MaLoai_TrangThai'),
    ('SAN_PHAM', 'IX_SAN_PHAM_TenSP_TrangThai'),
    ('LO_HANG', 'IX_LO_HANG_FEFO'),
    ('LO_HANG', 'IX_LO_HANG_HanSuDung_TrangThai'),
    ('LO_HANG', 'IX_LO_HANG_MaSP_HanSuDung_ConTon');

IF EXISTS (
    SELECT 1
    FROM @RequiredInventoryIndexes AS required
    WHERE NOT EXISTS (
        SELECT 1
        FROM sys.indexes AS actual
        WHERE actual.object_id = OBJECT_ID(N'dbo.' + required.TableName)
          AND actual.name = required.IndexName
          AND actual.is_disabled = 0
    )
)
    THROW 51400, 'One or more inventory/expiry lookup indexes are missing or disabled.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.LO_HANG')
      AND name = 'IX_LO_HANG_MaSP_HanSuDung_ConTon'
      AND has_filter = 1
      AND CHARINDEX('SoLuongTon', filter_definition) > 0
      AND CHARINDEX('>', filter_definition) > 0
)
    THROW 51401, 'The positive-stock lot index must remain filtered by SoLuongTon > 0.', 1;
GO

PRINT 'Inventory product, expiry and positive-stock lot indexes are ready.';
GO
