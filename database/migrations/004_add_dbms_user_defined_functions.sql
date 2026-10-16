SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;

IF OBJECT_ID(N'dbo.LO_HANG', N'U') IS NULL
   OR OBJECT_ID(N'dbo.SAN_PHAM', N'U') IS NULL
   OR OBJECT_ID(N'dbo.HOA_DON', N'U') IS NULL
   OR OBJECT_ID(N'dbo.usp_TON_KHO_SAN_PHAM_TraCuu', N'P') IS NULL
   OR OBJECT_ID(N'dbo.usp_LO_HANG_TraCuu', N'P') IS NULL
    THROW 51050, 'UDF migration requires the final Phase 2 inventory and sales schema.', 1;

EXEC sys.sp_executesql N'
CREATE OR ALTER FUNCTION dbo.ufn_LO_HANG_PhanLoaiHanDung
(
    @HanSuDung DATE,
    @TrangThaiLo VARCHAR(20),
    @NgayThamChieu DATE,
    @NguongCanHanNgay INT
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        CASE
            WHEN @NgayThamChieu IS NULL
              OR @NguongCanHanNgay IS NULL
              OR @NguongCanHanNgay < 0
              OR @NguongCanHanNgay > 3650
                THEN CONVERT(VARCHAR(20), NULL)
            WHEN @TrangThaiLo = ''EXPIRED''
              OR (@HanSuDung IS NOT NULL AND @HanSuDung <= @NgayThamChieu)
                THEN CONVERT(VARCHAR(20), ''EXPIRED'')
            WHEN @HanSuDung > @NgayThamChieu
             AND @HanSuDung <= DATEADD(DAY, @NguongCanHanNgay, @NgayThamChieu)
                THEN CONVERT(VARCHAR(20), ''NEAR_EXPIRY'')
            ELSE CONVERT(VARCHAR(20), ''VALID'')
        END AS TinhTrangHanDung,
        CASE
            WHEN @NgayThamChieu IS NULL OR @HanSuDung IS NULL THEN CONVERT(INT, NULL)
            ELSE DATEDIFF(DAY, @NgayThamChieu, @HanSuDung)
        END AS SoNgayConLai
);';

EXEC sys.sp_executesql N'
CREATE OR ALTER FUNCTION dbo.ufn_LO_HANG_TheoSanPham
(
    @MaSP VARCHAR(10),
    @NgayThamChieu DATE,
    @NguongCanHanNgay INT
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        lot.MaLo, lot.MaSP, lot.TenSP, lot.DonViTinh, lot.MaLoai, lot.TenLoai,
        lot.SoLo, lot.NgaySanXuat, lot.HanSuDung, lot.GiaNhap, lot.SoLuongTon,
        lot.TrangThaiLo, expiry.SoNgayConLai, expiry.TinhTrangHanDung
    FROM dbo.vw_TON_KHO_THEO_LO AS lot
    CROSS APPLY dbo.ufn_LO_HANG_PhanLoaiHanDung(
        lot.HanSuDung, lot.TrangThaiLo, @NgayThamChieu, @NguongCanHanNgay
    ) AS expiry
    WHERE (@MaSP IS NULL OR lot.MaSP = @MaSP)
      AND @NgayThamChieu IS NOT NULL
      AND @NguongCanHanNgay BETWEEN 0 AND 3650
);';

EXEC sys.sp_executesql N'
CREATE OR ALTER FUNCTION dbo.ufn_TON_KHO_TheoSanPham
(
    @MaSP VARCHAR(10),
    @NgayThamChieu DATE,
    @NguongCanHanNgay INT
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        product.MaSP,
        SUM(CONVERT(BIGINT, COALESCE(lot.SoLuongTon, 0))) AS TongTon,
        COALESCE(SUM(CONVERT(BIGINT, CASE
            WHEN lot.TrangThaiLo = ''ACTIVE''
             AND lot.TinhTrangHanDung IN (''VALID'', ''NEAR_EXPIRY'')
                THEN lot.SoLuongTon ELSE 0 END)), 0) AS TongTonKhaDung,
        COALESCE(SUM(CONVERT(BIGINT, CASE
            WHEN lot.TrangThaiLo = ''ACTIVE''
             AND lot.TinhTrangHanDung = ''NEAR_EXPIRY''
                THEN lot.SoLuongTon ELSE 0 END)), 0) AS TongTonCanHan,
        COALESCE(SUM(CONVERT(BIGINT, CASE
            WHEN lot.TinhTrangHanDung = ''EXPIRED'' THEN lot.SoLuongTon ELSE 0 END)), 0)
            AS TongTonHetHan,
        COALESCE(SUM(CONVERT(BIGINT, CASE
            WHEN lot.TrangThaiLo = ''BLOCKED''
             AND lot.TinhTrangHanDung <> ''EXPIRED''
                THEN lot.SoLuongTon ELSE 0 END)), 0) AS TongTonBiKhoa,
        SUM(CONVERT(BIGINT, CASE WHEN lot.SoLuongTon > 0 THEN 1 ELSE 0 END)) AS SoLoConTon,
        SUM(CONVERT(BIGINT, CASE
            WHEN lot.SoLuongTon > 0
             AND lot.TrangThaiLo = ''ACTIVE''
             AND lot.TinhTrangHanDung = ''NEAR_EXPIRY''
                THEN 1 ELSE 0 END)) AS SoLoCanHan,
        SUM(CONVERT(BIGINT, CASE
            WHEN lot.SoLuongTon > 0
             AND lot.TinhTrangHanDung = ''EXPIRED''
                THEN 1 ELSE 0 END)) AS SoLoHetHan
    FROM dbo.SAN_PHAM AS product
    LEFT JOIN dbo.ufn_LO_HANG_TheoSanPham(
        @MaSP, @NgayThamChieu, @NguongCanHanNgay
    ) AS lot ON lot.MaSP = product.MaSP
    WHERE (@MaSP IS NULL OR product.MaSP = @MaSP)
      AND @NgayThamChieu IS NOT NULL
      AND @NguongCanHanNgay BETWEEN 0 AND 3650
    GROUP BY product.MaSP
);';

EXEC sys.sp_executesql N'
CREATE OR ALTER FUNCTION dbo.ufn_SAN_PHAM_CoTheBan
(
    @NgayThamChieu DATE
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        product.MaSP, product.TenSP, product.MaVach, product.DonViTinh,
        product.GiaBan, product.MaLoai, category.TenLoai,
        inventory.TongTonKhaDung AS TonKhaDung
    FROM dbo.ufn_TON_KHO_TheoSanPham(NULL, @NgayThamChieu, 0) AS inventory
    JOIN dbo.SAN_PHAM AS product ON product.MaSP = inventory.MaSP
    JOIN dbo.LOAI_SAN_PHAM AS category
        ON category.MaLoai = product.MaLoai
       AND category.TrangThai = ''ACTIVE''
    WHERE product.TrangThai = ''ACTIVE''
      AND inventory.TongTonKhaDung > 0
);';

EXEC sys.sp_executesql N'
CREATE OR ALTER FUNCTION dbo.ufn_HOA_DON_PhanBoCoTheTra
(
    @MaHD VARCHAR(15)
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        lot_output.MaCTHD,
        lot_output.MaLo,
        lot.SoLo,
        lot_output.SoLuong AS SoLuongXuat,
        CONVERT(INT, COALESCE(returned.SoLuongDaTra, 0)) AS SoLuongDaTra,
        CONVERT(INT, lot_output.SoLuong - COALESCE(returned.SoLuongDaTra, 0))
            AS SoLuongConLaiCoTheTra
    FROM dbo.CHI_TIET_XUAT_LO AS lot_output
    JOIN dbo.CHI_TIET_HOA_DON AS detail ON detail.MaCTHD = lot_output.MaCTHD
    JOIN dbo.LO_HANG AS lot ON lot.MaLo = lot_output.MaLo
    OUTER APPLY (
        SELECT SUM(CONVERT(BIGINT, return_line.SoLuongTra)) AS SoLuongDaTra
        FROM dbo.CHI_TIET_PHIEU_TRA AS return_line
        JOIN dbo.PHIEU_TRA AS return_header ON return_header.MaPT = return_line.MaPT
        WHERE return_line.MaCTHD = lot_output.MaCTHD
          AND return_line.MaLo = lot_output.MaLo
          AND return_header.MaHD = @MaHD
          AND return_header.TrangThai = ''COMPLETED''
    ) AS returned
    WHERE detail.MaHD = @MaHD
      AND @MaHD IS NOT NULL
);';

DECLARE @Definition NVARCHAR(MAX);
DECLARE @Lf NCHAR(1) = NCHAR(10);
DECLARE @Start INT;
DECLARE @NextBlock INT;

SELECT @Definition = REPLACE(definition, NCHAR(13), N'')
FROM sys.sql_modules
WHERE object_id = OBJECT_ID(N'dbo.usp_TON_KHO_SAN_PHAM_TraCuu');

SET @Start = CHARINDEX(N'    ;WITH LotMetrics AS (', @Definition);
SET @NextBlock = CHARINDEX(N'    Inventory AS (', @Definition, @Start);

IF @Start = 0 OR @NextBlock = 0
    THROW 51051, 'Could not locate inventory-summary procedure integration point.', 1;

SET @Definition = STUFF(
    @Definition,
    @Start,
    @NextBlock - @Start,
    N'    ;WITH LotMetrics AS (' + @Lf
        + N'        SELECT' + @Lf
        + N'            MaSP, TongTon, TongTonKhaDung, TongTonCanHan,' + @Lf
        + N'            TongTonHetHan, TongTonBiKhoa, SoLoConTon, SoLoCanHan, SoLoHetHan' + @Lf
        + N'        FROM dbo.ufn_TON_KHO_TheoSanPham(NULL, @NgayThamChieu, @NguongCanHanNgay)' + @Lf
        + N'    ),' + @Lf
);

SET @Definition = N'ALTER ' + SUBSTRING(
    @Definition,
    CHARINDEX(N'PROCEDURE', @Definition),
    LEN(@Definition)
);
EXEC sys.sp_executesql @Definition;

SELECT @Definition = REPLACE(definition, NCHAR(13), N'')
FROM sys.sql_modules
WHERE object_id = OBJECT_ID(N'dbo.usp_LO_HANG_TraCuu');

SET @Start = CHARINDEX(N'    ;WITH ClassifiedLots AS (', @Definition);
SET @NextBlock = CHARINDEX(
    @Lf + N'    SELECT' + @Lf + N'        lot.MaLo,',
    @Definition,
    @Start
);

IF @Start = 0 OR @NextBlock = 0
    THROW 51052, 'Could not locate lot-query procedure integration point.', 1;

SET @Definition = STUFF(
    @Definition,
    @Start,
    @NextBlock - @Start,
    N'    ;WITH ClassifiedLots AS (' + @Lf
        + N'        SELECT' + @Lf
        + N'            MaLo, MaSP, TenSP, DonViTinh, MaLoai, TenLoai, SoLo,' + @Lf
        + N'            NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThaiLo,' + @Lf
        + N'            SoNgayConLai, TinhTrangHanDung' + @Lf
        + N'        FROM dbo.ufn_LO_HANG_TheoSanPham(NULL, @NgayThamChieu, @NguongCanHanNgay)' + @Lf
        + N'        WHERE SoLuongTon > 0' + @Lf
        + N'    )' + @Lf
);

SET @Definition = N'ALTER ' + SUBSTRING(
    @Definition,
    CHARINDEX(N'PROCEDURE', @Definition),
    LEN(@Definition)
);
EXEC sys.sp_executesql @Definition;

EXEC sys.sp_refreshsqlmodule N'dbo.usp_TON_KHO_SAN_PHAM_TraCuu';
EXEC sys.sp_refreshsqlmodule N'dbo.usp_LO_HANG_TraCuu';

IF (
    SELECT COUNT(*)
    FROM sys.objects
    WHERE schema_id = SCHEMA_ID(N'dbo')
      AND type IN ('FN', 'IF', 'TF')
) <> 5
    THROW 51053, 'Phase 3 schema must contain exactly five dbo user-defined functions.', 1;

IF OBJECT_DEFINITION(OBJECT_ID(N'dbo.usp_TON_KHO_SAN_PHAM_TraCuu'))
        NOT LIKE N'%ufn_TON_KHO_TheoSanPham%'
   OR OBJECT_DEFINITION(OBJECT_ID(N'dbo.usp_LO_HANG_TraCuu'))
        NOT LIKE N'%ufn_LO_HANG_TheoSanPham%'
    THROW 51054, 'Inventory procedures were not integrated with the Phase 3 UDFs.', 1;
