SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.NHA_CUNG_CAP')
      AND name = 'IX_NHA_CUNG_CAP_TenNCC_TrangThai'
)
BEGIN
    CREATE INDEX IX_NHA_CUNG_CAP_TenNCC_TrangThai
        ON dbo.NHA_CUNG_CAP (TenNCC, TrangThai)
        INCLUDE (MaNCC, SDT, Email, DiaChi, MaSoThue);
END;
GO

DECLARE @RequiredCatalogIndexes TABLE (
    TableName SYSNAME NOT NULL,
    IndexName SYSNAME NOT NULL,
    PRIMARY KEY (TableName, IndexName)
);

INSERT INTO @RequiredCatalogIndexes (TableName, IndexName)
VALUES
    ('SAN_PHAM', 'UX_SAN_PHAM_MaVach'),
    ('SAN_PHAM', 'IX_SAN_PHAM_TenSP_TrangThai'),
    ('SAN_PHAM', 'IX_SAN_PHAM_MaLoai_TrangThai'),
    ('KHUYEN_MAI', 'IX_KHUYEN_MAI_TrangThai_ThoiGian'),
    ('KHUYEN_MAI_SAN_PHAM', 'IX_KHUYEN_MAI_SAN_PHAM_MaSP'),
    ('NHA_CUNG_CAP', 'UQ_NHA_CUNG_CAP_SDT'),
    ('NHA_CUNG_CAP', 'IX_NHA_CUNG_CAP_TenNCC_TrangThai'),
    ('NHAT_KY_HE_THONG', 'IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian');

IF EXISTS (
    SELECT 1
    FROM @RequiredCatalogIndexes AS required
    WHERE NOT EXISTS (
        SELECT 1
        FROM sys.indexes AS actual
        WHERE actual.object_id = OBJECT_ID(N'dbo.' + required.TableName)
          AND actual.name = required.IndexName
    )
)
    THROW 51040, 'One or more catalog/promotion/supplier query indexes are missing.', 1;
GO

PRINT 'Catalog, promotion and supplier indexes are ready without duplicating existing lookup indexes.';
GO
