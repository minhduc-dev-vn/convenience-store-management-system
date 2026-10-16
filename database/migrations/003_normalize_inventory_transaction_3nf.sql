SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;

IF OBJECT_ID(N'dbo.GIAO_DICH_KHO', N'U') IS NULL
   OR OBJECT_ID(N'dbo.LO_HANG', N'U') IS NULL
    THROW 51040, '3NF migration requires dbo.GIAO_DICH_KHO and dbo.LO_HANG.', 1;

IF OBJECT_ID(N'dbo.usp_PHIEU_NHAP_XacNhan', N'P') IS NULL
   OR OBJECT_ID(N'dbo.usp_HOA_DON_HoanTatBanHang', N'P') IS NULL
   OR OBJECT_ID(N'dbo.usp_PHIEU_TRA_HoanTat', N'P') IS NULL
   OR OBJECT_ID(N'dbo.usp_KIEM_KE_PheDuyetDieuChinh', N'P') IS NULL
    THROW 51041, '3NF migration requires all inventory-writing procedures.', 1;

DECLARE @MovementCountBefore BIGINT = (SELECT COUNT_BIG(*) FROM dbo.GIAO_DICH_KHO);
DECLARE @Definition NVARCHAR(MAX);
DECLARE @Lf NCHAR(1) = NCHAR(10);

-- Existing databases must not silently discard a conflicting product snapshot.
-- Dynamic SQL keeps the migration valid for clean builds where MaSP is already absent.
IF COL_LENGTH(N'dbo.GIAO_DICH_KHO', N'MaSP') IS NOT NULL
BEGIN
    EXEC sys.sp_executesql N'
        IF EXISTS (
            SELECT 1
            FROM dbo.GIAO_DICH_KHO AS movement
            JOIN dbo.LO_HANG AS lot ON lot.MaLo = movement.MaLo
            WHERE movement.MaSP <> lot.MaSP
        )
            THROW 51042, ''Cannot normalize GIAO_DICH_KHO because historical product/lot values conflict.'', 1;
    ';
END;

-- Upgrade the receipt-confirmation procedure in place.
SELECT @Definition = REPLACE(definition, NCHAR(13), N'')
FROM sys.sql_modules
WHERE object_id = OBJECT_ID(N'dbo.usp_PHIEU_NHAP_XacNhan');

SET @Definition = REPLACE(
    @Definition,
    N'INSERT INTO dbo.GIAO_DICH_KHO (' + @Lf
        + N'            MaSP,' + @Lf
        + N'            MaLo,',
    N'INSERT INTO dbo.GIAO_DICH_KHO (' + @Lf
        + N'            MaLo,'
);
SET @Definition = REPLACE(
    @Definition,
    N'SELECT' + @Lf
        + N'            lot.MaSP,' + @Lf
        + N'            detail.MaLo,' + @Lf
        + N'            ''IMPORT'',',
    N'SELECT' + @Lf
        + N'            detail.MaLo,' + @Lf
        + N'            ''IMPORT'','
);
SET @Definition = REPLACE(
    @Definition,
    N'FROM dbo.CHI_TIET_PHIEU_NHAP AS detail' + @Lf
        + N'        JOIN dbo.LO_HANG AS lot' + @Lf
        + N'            ON lot.MaLo = detail.MaLo' + @Lf
        + N'        WHERE detail.MaPN = @MaPN;',
    N'FROM dbo.CHI_TIET_PHIEU_NHAP AS detail' + @Lf
        + N'        WHERE detail.MaPN = @MaPN;'
);
SET @Definition = N'ALTER ' + SUBSTRING(
    @Definition,
    CHARINDEX(N'PROCEDURE', @Definition),
    LEN(@Definition)
);
EXEC sys.sp_executesql @Definition;

-- Upgrade the FEFO sale procedure in place.
SELECT @Definition = REPLACE(definition, NCHAR(13), N'')
FROM sys.sql_modules
WHERE object_id = OBJECT_ID(N'dbo.usp_HOA_DON_HoanTatBanHang');

SET @Definition = REPLACE(
    @Definition,
    N'INSERT INTO dbo.GIAO_DICH_KHO (' + @Lf
        + N'                    MaSP, MaLo, LoaiGiaoDich, SoLuongBienDong,',
    N'INSERT INTO dbo.GIAO_DICH_KHO (' + @Lf
        + N'                    MaLo, LoaiGiaoDich, SoLuongBienDong,'
);
SET @Definition = REPLACE(
    @Definition,
    N'VALUES (' + @Lf
        + N'                    @MaSP, @MaLo, ''SALE'', -@SoLuongXuat,',
    N'VALUES (' + @Lf
        + N'                    @MaLo, ''SALE'', -@SoLuongXuat,'
);
SET @Definition = N'ALTER ' + SUBSTRING(
    @Definition,
    CHARINDEX(N'PROCEDURE', @Definition),
    LEN(@Definition)
);
EXEC sys.sp_executesql @Definition;

-- Upgrade the return procedure and remove its now-unused prepared product value.
SELECT @Definition = REPLACE(definition, NCHAR(13), N'')
FROM sys.sql_modules
WHERE object_id = OBJECT_ID(N'dbo.usp_PHIEU_TRA_HoanTat');

SET @Definition = REPLACE(
    @Definition,
    N'        MaSP VARCHAR(10) NOT NULL,' + @Lf,
    N''
);
SET @Definition = REPLACE(
    @Definition,
    N'            RowNumber, MaCTHD, MaLo, MaSP, SoLuongTra, TinhTrangHang,',
    N'            RowNumber, MaCTHD, MaLo, SoLuongTra, TinhTrangHang,'
);
SET @Definition = REPLACE(
    @Definition,
    N'            invoice_line.MaSP,' + @Lf,
    N''
);
SET @Definition = REPLACE(
    @Definition,
    N'INSERT INTO dbo.GIAO_DICH_KHO (' + @Lf
        + N'            MaSP, MaLo, LoaiGiaoDich, SoLuongBienDong,',
    N'INSERT INTO dbo.GIAO_DICH_KHO (' + @Lf
        + N'            MaLo, LoaiGiaoDich, SoLuongBienDong,'
);
SET @Definition = REPLACE(
    @Definition,
    N'SELECT' + @Lf
        + N'            prepared.MaSP,' + @Lf
        + N'            prepared.MaLo,' + @Lf
        + N'            ''RETURN'',',
    N'SELECT' + @Lf
        + N'            prepared.MaLo,' + @Lf
        + N'            ''RETURN'','
);
SET @Definition = N'ALTER ' + SUBSTRING(
    @Definition,
    CHARINDEX(N'PROCEDURE', @Definition),
    LEN(@Definition)
);
EXEC sys.sp_executesql @Definition;

-- Upgrade the stocktake-approval procedure in place.
SELECT @Definition = REPLACE(definition, NCHAR(13), N'')
FROM sys.sql_modules
WHERE object_id = OBJECT_ID(N'dbo.usp_KIEM_KE_PheDuyetDieuChinh');

SET @Definition = REPLACE(
    @Definition,
    N'INSERT INTO dbo.GIAO_DICH_KHO (' + @Lf
        + N'            MaSP, MaLo, LoaiGiaoDich, SoLuongBienDong,',
    N'INSERT INTO dbo.GIAO_DICH_KHO (' + @Lf
        + N'            MaLo, LoaiGiaoDich, SoLuongBienDong,'
);
SET @Definition = REPLACE(
    @Definition,
    N'SELECT' + @Lf
        + N'            lot.MaSP,' + @Lf
        + N'            detail.MaLo,' + @Lf
        + N'            ''ADJUSTMENT'',',
    N'SELECT' + @Lf
        + N'            detail.MaLo,' + @Lf
        + N'            ''ADJUSTMENT'','
);
SET @Definition = REPLACE(
    @Definition,
    N'FROM dbo.CHI_TIET_KIEM_KE AS detail' + @Lf
        + N'        JOIN dbo.LO_HANG AS lot' + @Lf
        + N'            ON lot.MaLo = detail.MaLo' + @Lf
        + N'        WHERE detail.MaKK = @MaKK',
    N'FROM dbo.CHI_TIET_KIEM_KE AS detail' + @Lf
        + N'        WHERE detail.MaKK = @MaKK'
);
SET @Definition = N'ALTER ' + SUBSTRING(
    @Definition,
    CHARINDEX(N'PROCEDURE', @Definition),
    LEN(@Definition)
);
EXEC sys.sp_executesql @Definition;

IF OBJECT_ID(N'dbo.FK_GIAO_DICH_KHO_SAN_PHAM', N'F') IS NOT NULL
    ALTER TABLE dbo.GIAO_DICH_KHO DROP CONSTRAINT FK_GIAO_DICH_KHO_SAN_PHAM;

DROP INDEX IF EXISTS UX_GIAO_DICH_KHO_SALE_MaThamChieu_MaLo
    ON dbo.GIAO_DICH_KHO;
DROP INDEX IF EXISTS UX_GIAO_DICH_KHO_RETURN_MaThamChieu_MaLo
    ON dbo.GIAO_DICH_KHO;

IF COL_LENGTH(N'dbo.GIAO_DICH_KHO', N'MaSP') IS NOT NULL
    ALTER TABLE dbo.GIAO_DICH_KHO DROP COLUMN MaSP;

CREATE UNIQUE INDEX UX_GIAO_DICH_KHO_SALE_MaThamChieu_MaLo
    ON dbo.GIAO_DICH_KHO (MaThamChieu, MaLo)
    INCLUDE (SoLuongBienDong, ThoiGian, MaNV)
    WHERE LoaiGiaoDich = 'SALE';

CREATE UNIQUE INDEX UX_GIAO_DICH_KHO_RETURN_MaThamChieu_MaLo
    ON dbo.GIAO_DICH_KHO (MaThamChieu, MaLo)
    INCLUDE (SoLuongBienDong, ThoiGian, MaNV)
    WHERE LoaiGiaoDich = 'RETURN';

EXEC sys.sp_refreshsqlmodule N'dbo.usp_PHIEU_NHAP_XacNhan';
EXEC sys.sp_refreshsqlmodule N'dbo.usp_HOA_DON_HoanTatBanHang';
EXEC sys.sp_refreshsqlmodule N'dbo.usp_PHIEU_TRA_HoanTat';
EXEC sys.sp_refreshsqlmodule N'dbo.usp_KIEM_KE_PheDuyetDieuChinh';

IF COL_LENGTH(N'dbo.GIAO_DICH_KHO', N'MaSP') IS NOT NULL
   OR OBJECT_ID(N'dbo.FK_GIAO_DICH_KHO_SAN_PHAM', N'F') IS NOT NULL
    THROW 51043, 'GIAO_DICH_KHO product redundancy was not removed.', 1;

IF (SELECT COUNT_BIG(*) FROM dbo.GIAO_DICH_KHO) <> @MovementCountBefore
    THROW 51044, 'GIAO_DICH_KHO row count changed during normalization.', 1;

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
    FROM sys.foreign_keys AS foreign_key
    JOIN sys.tables AS core_table ON core_table.object_id = foreign_key.parent_object_id
    WHERE foreign_key.schema_id = SCHEMA_ID('dbo')
      AND EXISTS (
          SELECT 1 FROM @CoreTables AS expected WHERE expected.TableName = core_table.name
      )
) <> 30
    THROW 51045, 'Normalized core schema must contain exactly 30 foreign keys.', 1;

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
    THROW 51046, 'All normalized core foreign keys must remain enabled and trusted.', 1;
