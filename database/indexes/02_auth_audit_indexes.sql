SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.TAI_KHOAN')
      AND name = 'UQ_TAI_KHOAN_TenDangNhap'
      AND is_unique = 1
)
    THROW 51031, 'The unique username index required for login is missing.', 1;
GO

DECLARE @RequiredLoginColumns TABLE (ColumnName SYSNAME NOT NULL PRIMARY KEY);

INSERT INTO @RequiredLoginColumns (ColumnName)
VALUES
    ('MatKhauHash'),
    ('MaVaiTro'),
    ('MaNV'),
    ('MaKH'),
    ('TrangThai'),
    ('LanDangNhapCuoi');

IF EXISTS (
    SELECT 1
    FROM @RequiredLoginColumns AS required
    WHERE NOT EXISTS (
        SELECT 1
        FROM sys.indexes AS index_definition
        JOIN sys.index_columns AS index_column
            ON index_column.object_id = index_definition.object_id
           AND index_column.index_id = index_definition.index_id
        JOIN sys.columns AS table_column
            ON table_column.object_id = index_column.object_id
           AND table_column.column_id = index_column.column_id
        WHERE index_definition.object_id = OBJECT_ID('dbo.TAI_KHOAN')
          AND index_definition.name = 'UQ_TAI_KHOAN_TenDangNhap'
          AND table_column.name = required.ColumnName
    )
)
    THROW 51032, 'The login index is missing one or more required covering columns.', 1;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.NHAT_KY_HE_THONG')
      AND name = 'IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian'
)
BEGIN
    CREATE INDEX IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian
        ON dbo.NHAT_KY_HE_THONG (TenBang, MaBanGhi, ThoiGian DESC)
        INCLUDE (MaTK, HanhDong, DiaChiIP)
        WHERE MaBanGhi IS NOT NULL;
END;
GO

PRINT 'Authentication lookup and audit investigation indexes are ready.';
GO
