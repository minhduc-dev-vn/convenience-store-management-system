:ON ERROR EXIT

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF DB_NAME() IN ('master', 'model', 'msdb', 'tempdb')
    THROW 53500, 'Index inventory tests refuse to run in a SQL Server system database.', 1;

IF (
    SELECT COUNT(*)
    FROM sys.indexes AS index_definition
    JOIN sys.tables AS table_definition
        ON table_definition.object_id = index_definition.object_id
    WHERE table_definition.schema_id = SCHEMA_ID('dbo')
      AND table_definition.name <> 'SCHEMA_MIGRATIONS'
      AND index_definition.index_id > 0
      AND index_definition.is_hypothetical = 0
      AND index_definition.is_primary_key = 0
      AND index_definition.is_unique_constraint = 0
) <> 43
    THROW 53501, 'The final core schema must contain exactly 43 standalone indexes.', 1;

DECLARE @ExpectedIndexes TABLE (
    TableName SYSNAME NOT NULL,
    IndexName SYSNAME NOT NULL,
    IsUnique BIT NOT NULL,
    HasFilter BIT NOT NULL,
    KeyCount INT NOT NULL,
    IncludeCount INT NOT NULL,
    PRIMARY KEY (TableName, IndexName)
);

INSERT INTO @ExpectedIndexes (TableName, IndexName, IsUnique, HasFilter, KeyCount, IncludeCount)
VALUES
    ('TAI_KHOAN', 'UQ_TAI_KHOAN_TenDangNhap', 1, 0, 1, 6),
    ('LO_HANG', 'IX_LO_HANG_MaSP_HanSuDung_ConTon', 0, 1, 2, 6),
    ('HOA_DON', 'IX_HOA_DON_BaoCao_TrangThai_NgayLap', 0, 0, 3, 4),
    ('NHAT_KY_HE_THONG', 'IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian', 0, 1, 3, 3),
    ('PHIEU_NHAP', 'IX_PHIEU_NHAP_TrangThai_NgayNhap', 0, 0, 2, 5);

IF EXISTS (
    SELECT 1
    FROM @ExpectedIndexes AS expected
    LEFT JOIN sys.indexes AS actual
        ON actual.object_id = OBJECT_ID(N'dbo.' + expected.TableName)
       AND actual.name = expected.IndexName
       AND actual.is_unique = expected.IsUnique
       AND actual.has_filter = expected.HasFilter
       AND actual.is_disabled = 0
       AND actual.is_hypothetical = 0
       AND actual.is_primary_key = 0
       AND actual.is_unique_constraint = 0
    WHERE actual.index_id IS NULL
       OR expected.KeyCount <> (
           SELECT COUNT(*)
           FROM sys.index_columns AS key_column
           WHERE key_column.object_id = actual.object_id
             AND key_column.index_id = actual.index_id
             AND key_column.is_included_column = 0
       )
       OR expected.IncludeCount <> (
           SELECT COUNT(*)
           FROM sys.index_columns AS include_column
           WHERE include_column.object_id = actual.object_id
             AND include_column.index_id = actual.index_id
             AND include_column.is_included_column = 1
       )
)
    THROW 53502, 'A benchmark index is missing, disabled, or has the wrong uniqueness/filter/column count.', 1;

DECLARE @ExpectedKeys TABLE (
    TableName SYSNAME NOT NULL,
    IndexName SYSNAME NOT NULL,
    ColumnName SYSNAME NOT NULL,
    KeyOrdinal INT NOT NULL,
    IsDescending BIT NOT NULL,
    PRIMARY KEY (TableName, IndexName, KeyOrdinal)
);

INSERT INTO @ExpectedKeys (TableName, IndexName, ColumnName, KeyOrdinal, IsDescending)
VALUES
    ('TAI_KHOAN', 'UQ_TAI_KHOAN_TenDangNhap', 'TenDangNhap', 1, 0),
    ('LO_HANG', 'IX_LO_HANG_MaSP_HanSuDung_ConTon', 'MaSP', 1, 0),
    ('LO_HANG', 'IX_LO_HANG_MaSP_HanSuDung_ConTon', 'HanSuDung', 2, 0),
    ('HOA_DON', 'IX_HOA_DON_BaoCao_TrangThai_NgayLap', 'TrangThai', 1, 0),
    ('HOA_DON', 'IX_HOA_DON_BaoCao_TrangThai_NgayLap', 'NgayLap', 2, 0),
    ('HOA_DON', 'IX_HOA_DON_BaoCao_TrangThai_NgayLap', 'MaCa', 3, 0),
    ('NHAT_KY_HE_THONG', 'IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian', 'TenBang', 1, 0),
    ('NHAT_KY_HE_THONG', 'IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian', 'MaBanGhi', 2, 0),
    ('NHAT_KY_HE_THONG', 'IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian', 'ThoiGian', 3, 1),
    ('PHIEU_NHAP', 'IX_PHIEU_NHAP_TrangThai_NgayNhap', 'TrangThai', 1, 0),
    ('PHIEU_NHAP', 'IX_PHIEU_NHAP_TrangThai_NgayNhap', 'NgayNhap', 2, 1);

IF EXISTS (
    SELECT 1
    FROM @ExpectedKeys AS expected
    WHERE NOT EXISTS (
        SELECT 1
        FROM sys.indexes AS index_definition
        JOIN sys.index_columns AS index_column
            ON index_column.object_id = index_definition.object_id
           AND index_column.index_id = index_definition.index_id
        JOIN sys.columns AS table_column
            ON table_column.object_id = index_column.object_id
           AND table_column.column_id = index_column.column_id
        WHERE index_definition.object_id = OBJECT_ID(N'dbo.' + expected.TableName)
          AND index_definition.name = expected.IndexName
          AND table_column.name = expected.ColumnName
          AND index_column.key_ordinal = expected.KeyOrdinal
          AND index_column.is_descending_key = expected.IsDescending
          AND index_column.is_included_column = 0
    )
)
    THROW 53503, 'A benchmark index key column/order/direction differs from its documented DDL.', 1;

DECLARE @ExpectedIncludes TABLE (
    TableName SYSNAME NOT NULL,
    IndexName SYSNAME NOT NULL,
    ColumnName SYSNAME NOT NULL,
    PRIMARY KEY (TableName, IndexName, ColumnName)
);

INSERT INTO @ExpectedIncludes (TableName, IndexName, ColumnName)
VALUES
    ('TAI_KHOAN', 'UQ_TAI_KHOAN_TenDangNhap', 'MatKhauHash'),
    ('TAI_KHOAN', 'UQ_TAI_KHOAN_TenDangNhap', 'MaVaiTro'),
    ('TAI_KHOAN', 'UQ_TAI_KHOAN_TenDangNhap', 'MaNV'),
    ('TAI_KHOAN', 'UQ_TAI_KHOAN_TenDangNhap', 'MaKH'),
    ('TAI_KHOAN', 'UQ_TAI_KHOAN_TenDangNhap', 'TrangThai'),
    ('TAI_KHOAN', 'UQ_TAI_KHOAN_TenDangNhap', 'LanDangNhapCuoi'),
    ('LO_HANG', 'IX_LO_HANG_MaSP_HanSuDung_ConTon', 'MaLo'),
    ('LO_HANG', 'IX_LO_HANG_MaSP_HanSuDung_ConTon', 'SoLo'),
    ('LO_HANG', 'IX_LO_HANG_MaSP_HanSuDung_ConTon', 'NgaySanXuat'),
    ('LO_HANG', 'IX_LO_HANG_MaSP_HanSuDung_ConTon', 'SoLuongTon'),
    ('LO_HANG', 'IX_LO_HANG_MaSP_HanSuDung_ConTon', 'TrangThai'),
    ('LO_HANG', 'IX_LO_HANG_MaSP_HanSuDung_ConTon', 'GiaNhap'),
    ('HOA_DON', 'IX_HOA_DON_BaoCao_TrangThai_NgayLap', 'MaHD'),
    ('HOA_DON', 'IX_HOA_DON_BaoCao_TrangThai_NgayLap', 'TongTienHang'),
    ('HOA_DON', 'IX_HOA_DON_BaoCao_TrangThai_NgayLap', 'TongGiamGia'),
    ('HOA_DON', 'IX_HOA_DON_BaoCao_TrangThai_NgayLap', 'TongThanhToan'),
    ('NHAT_KY_HE_THONG', 'IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian', 'MaTK'),
    ('NHAT_KY_HE_THONG', 'IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian', 'HanhDong'),
    ('NHAT_KY_HE_THONG', 'IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian', 'DiaChiIP'),
    ('PHIEU_NHAP', 'IX_PHIEU_NHAP_TrangThai_NgayNhap', 'MaPN'),
    ('PHIEU_NHAP', 'IX_PHIEU_NHAP_TrangThai_NgayNhap', 'MaNV'),
    ('PHIEU_NHAP', 'IX_PHIEU_NHAP_TrangThai_NgayNhap', 'MaNCC'),
    ('PHIEU_NHAP', 'IX_PHIEU_NHAP_TrangThai_NgayNhap', 'TongTien'),
    ('PHIEU_NHAP', 'IX_PHIEU_NHAP_TrangThai_NgayNhap', 'NgayXacNhan');

IF EXISTS (
    SELECT 1
    FROM @ExpectedIncludes AS expected
    WHERE NOT EXISTS (
        SELECT 1
        FROM sys.indexes AS index_definition
        JOIN sys.index_columns AS index_column
            ON index_column.object_id = index_definition.object_id
           AND index_column.index_id = index_definition.index_id
        JOIN sys.columns AS table_column
            ON table_column.object_id = index_column.object_id
           AND table_column.column_id = index_column.column_id
        WHERE index_definition.object_id = OBJECT_ID(N'dbo.' + expected.TableName)
          AND index_definition.name = expected.IndexName
          AND table_column.name = expected.ColumnName
          AND index_column.is_included_column = 1
    )
)
    THROW 53504, 'A benchmark covering index is missing a documented INCLUDE column.', 1;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.LO_HANG')
      AND name = 'IX_LO_HANG_MaSP_HanSuDung_ConTon'
      AND filter_definition LIKE '%SoLuongTon%>%'
) OR NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.NHAT_KY_HE_THONG')
      AND name = 'IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian'
      AND filter_definition LIKE '%MaBanGhi%IS NOT NULL%'
)
    THROW 53505, 'A benchmark filtered index predicate differs from its documented DDL.', 1;
GO

PRINT 'Index inventory tests passed: 43 standalone indexes and five benchmark index definitions are intact.';
GO
