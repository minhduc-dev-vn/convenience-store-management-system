SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.SAN_PHAM', N'U') IS NULL
BEGIN
    THROW 51000, 'Required table dbo.SAN_PHAM does not exist.', 1;
END;

IF COL_LENGTH(N'dbo.SAN_PHAM', N'ImageUrl') IS NULL
BEGIN
    ALTER TABLE dbo.SAN_PHAM
        ADD ImageUrl VARCHAR(500) NULL;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns AS column_definition
    JOIN sys.types AS type_definition
        ON type_definition.user_type_id = column_definition.user_type_id
    WHERE column_definition.object_id = OBJECT_ID(N'dbo.SAN_PHAM')
      AND column_definition.name = N'ImageUrl'
      AND type_definition.name = N'varchar'
      AND column_definition.max_length = 500
      AND column_definition.is_nullable = 1
)
BEGIN
    THROW 51001, 'dbo.SAN_PHAM.ImageUrl must be nullable VARCHAR(500).', 1;
END;

EXEC(N'
CREATE OR ALTER VIEW dbo.vw_SAN_PHAM_DANH_MUC
AS
SELECT
    product.MaSP,
    product.TenSP,
    product.MaVach,
    product.DonViTinh,
    product.GiaBan,
    product.ImageUrl,
    product.MucTonToiThieu,
    product.MaLoai,
    category.TenLoai,
    category.TrangThai AS TrangThaiLoai,
    product.TrangThai
FROM dbo.SAN_PHAM AS product
JOIN dbo.LOAI_SAN_PHAM AS category
    ON category.MaLoai = product.MaLoai;
');
