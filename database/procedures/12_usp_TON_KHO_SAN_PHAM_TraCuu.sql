SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_TON_KHO_SAN_PHAM_TraCuu;
GO

CREATE PROCEDURE dbo.usp_TON_KHO_SAN_PHAM_TraCuu
    @TuKhoa NVARCHAR(150) = NULL,
    @MaLoai VARCHAR(10) = NULL,
    @CheDo VARCHAR(20) = 'ALL',
    @NgayThamChieu DATE = NULL,
    @NguongCanHanNgay INT = 30,
    @SoTrang INT = 1,
    @KichThuocTrang INT = 20
AS
BEGIN
    SET NOCOUNT ON;

    SET @TuKhoa = NULLIF(LTRIM(RTRIM(@TuKhoa)), N'');
    SET @MaLoai = NULLIF(LTRIM(RTRIM(@MaLoai)), '');
    SET @CheDo = UPPER(COALESCE(NULLIF(LTRIM(RTRIM(@CheDo)), ''), 'ALL'));
    SET @NgayThamChieu = COALESCE(
        @NgayThamChieu,
        CONVERT(DATE, (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'SE Asia Standard Time')
    );

    IF @CheDo NOT IN ('ALL', 'LOW_STOCK', 'NEAR_EXPIRY', 'EXPIRED')
        THROW 51410, 'Inventory mode must be ALL, LOW_STOCK, NEAR_EXPIRY or EXPIRED.', 1;

    IF @NguongCanHanNgay IS NULL OR @NguongCanHanNgay < 0 OR @NguongCanHanNgay > 3650
        THROW 51411, 'Near-expiry threshold must be between 0 and 3650 days.', 1;

    IF @SoTrang < 1
        THROW 51412, 'Inventory page must be greater than or equal to 1.', 1;

    IF @KichThuocTrang < 1 OR @KichThuocTrang > 100
        THROW 51413, 'Inventory page size must be between 1 and 100.', 1;

    IF @MaLoai IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = @MaLoai)
        THROW 51414, 'Inventory category does not exist.', 1;

    DECLARE @Offset BIGINT = CONVERT(BIGINT, @SoTrang - 1) * @KichThuocTrang;

    IF @Offset > 2147483647
        THROW 51415, 'Inventory page offset is too large.', 1;

    DECLARE @TenPrefix NVARCHAR(304) = NULL;

    IF @TuKhoa IS NOT NULL
        SET @TenPrefix = REPLACE(REPLACE(REPLACE(@TuKhoa, N'~', N'~~'), N'%', N'~%'), N'_', N'~_') + N'%';

    ;WITH LotMetrics AS (
        SELECT
            product.MaSP,
            SUM(CONVERT(BIGINT, COALESCE(lot.SoLuongTon, 0))) AS TongTon,
            COALESCE(SUM(CONVERT(BIGINT, CASE
                WHEN lot.TrangThai = 'ACTIVE'
                 AND (lot.HanSuDung IS NULL OR lot.HanSuDung > @NgayThamChieu)
                    THEN lot.SoLuongTon
                ELSE 0
            END)), 0) AS TongTonKhaDung,
            COALESCE(SUM(CONVERT(BIGINT, CASE
                WHEN lot.TrangThai = 'ACTIVE'
                 AND lot.HanSuDung > @NgayThamChieu
                 AND lot.HanSuDung <= DATEADD(DAY, @NguongCanHanNgay, @NgayThamChieu)
                    THEN lot.SoLuongTon
                ELSE 0
            END)), 0) AS TongTonCanHan,
            COALESCE(SUM(CONVERT(BIGINT, CASE
                WHEN lot.TrangThai = 'EXPIRED'
                  OR (lot.HanSuDung IS NOT NULL AND lot.HanSuDung <= @NgayThamChieu)
                    THEN lot.SoLuongTon
                ELSE 0
            END)), 0) AS TongTonHetHan,
            COALESCE(SUM(CONVERT(BIGINT, CASE
                WHEN lot.TrangThai = 'BLOCKED'
                 AND (lot.HanSuDung IS NULL OR lot.HanSuDung > @NgayThamChieu)
                    THEN lot.SoLuongTon
                ELSE 0
            END)), 0) AS TongTonBiKhoa,
            SUM(CONVERT(BIGINT, CASE WHEN lot.SoLuongTon > 0 THEN 1 ELSE 0 END)) AS SoLoConTon,
            SUM(CONVERT(BIGINT, CASE
                WHEN lot.SoLuongTon > 0
                 AND lot.TrangThai = 'ACTIVE'
                 AND lot.HanSuDung > @NgayThamChieu
                 AND lot.HanSuDung <= DATEADD(DAY, @NguongCanHanNgay, @NgayThamChieu)
                    THEN 1
                ELSE 0
            END)) AS SoLoCanHan,
            SUM(CONVERT(BIGINT, CASE
                WHEN lot.SoLuongTon > 0
                 AND (
                     lot.TrangThai = 'EXPIRED'
                     OR (lot.HanSuDung IS NOT NULL AND lot.HanSuDung <= @NgayThamChieu)
                 )
                    THEN 1
                ELSE 0
            END)) AS SoLoHetHan
        FROM dbo.SAN_PHAM AS product
        LEFT JOIN dbo.LO_HANG AS lot
            ON lot.MaSP = product.MaSP
        GROUP BY product.MaSP
    ),
    Inventory AS (
        SELECT
            product.MaSP,
            product.TenSP,
            product.DonViTinh,
            product.MucTonToiThieu,
            product.MaLoai,
            category.TenLoai,
            product.TrangThai AS TrangThaiSanPham,
            metrics.TongTon,
            metrics.TongTonKhaDung,
            metrics.TongTonCanHan,
            metrics.TongTonHetHan,
            metrics.TongTonBiKhoa,
            metrics.SoLoConTon,
            metrics.SoLoCanHan,
            metrics.SoLoHetHan,
            CONVERT(BIT, CASE
                WHEN metrics.TongTonKhaDung < product.MucTonToiThieu THEN 1
                ELSE 0
            END) AS CanhBaoTonThap
        FROM dbo.SAN_PHAM AS product
        JOIN dbo.LOAI_SAN_PHAM AS category
            ON category.MaLoai = product.MaLoai
        JOIN LotMetrics AS metrics
            ON metrics.MaSP = product.MaSP
    )
    SELECT
        inventory.MaSP,
        inventory.TenSP,
        inventory.DonViTinh,
        inventory.MucTonToiThieu,
        inventory.MaLoai,
        inventory.TenLoai,
        inventory.TrangThaiSanPham,
        inventory.TongTon,
        inventory.TongTonKhaDung,
        inventory.TongTonCanHan,
        inventory.TongTonHetHan,
        inventory.TongTonBiKhoa,
        inventory.SoLoConTon,
        inventory.SoLoCanHan,
        inventory.SoLoHetHan,
        inventory.CanhBaoTonThap,
        COUNT_BIG(*) OVER () AS TongSoBanGhi
    FROM Inventory AS inventory
    WHERE (@MaLoai IS NULL OR inventory.MaLoai = @MaLoai)
      AND (
          @TuKhoa IS NULL
          OR (LEN(@TuKhoa) <= 10 AND inventory.MaSP = CONVERT(VARCHAR(10), @TuKhoa))
          OR inventory.TenSP LIKE @TenPrefix ESCAPE N'~'
      )
      AND (
          @CheDo = 'ALL'
          OR (@CheDo = 'LOW_STOCK' AND inventory.CanhBaoTonThap = 1)
          OR (@CheDo = 'NEAR_EXPIRY' AND inventory.SoLoCanHan > 0)
          OR (@CheDo = 'EXPIRED' AND inventory.SoLoHetHan > 0)
      )
    ORDER BY inventory.TenSP, inventory.MaSP
    OFFSET CONVERT(INT, @Offset) ROWS FETCH NEXT @KichThuocTrang ROWS ONLY;
END;
GO
