SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

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
            WHEN @TrangThaiLo = 'EXPIRED'
              OR (@HanSuDung IS NOT NULL AND @HanSuDung <= @NgayThamChieu)
                THEN CONVERT(VARCHAR(20), 'EXPIRED')
            WHEN @HanSuDung > @NgayThamChieu
             AND @HanSuDung <= DATEADD(DAY, @NguongCanHanNgay, @NgayThamChieu)
                THEN CONVERT(VARCHAR(20), 'NEAR_EXPIRY')
            ELSE CONVERT(VARCHAR(20), 'VALID')
        END AS TinhTrangHanDung,
        CASE
            WHEN @NgayThamChieu IS NULL OR @HanSuDung IS NULL THEN CONVERT(INT, NULL)
            ELSE DATEDIFF(DAY, @NgayThamChieu, @HanSuDung)
        END AS SoNgayConLai
);
GO

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
        lot.MaLo,
        lot.MaSP,
        lot.TenSP,
        lot.DonViTinh,
        lot.MaLoai,
        lot.TenLoai,
        lot.SoLo,
        lot.NgaySanXuat,
        lot.HanSuDung,
        lot.GiaNhap,
        lot.SoLuongTon,
        lot.TrangThaiLo,
        expiry.SoNgayConLai,
        expiry.TinhTrangHanDung
    FROM dbo.vw_TON_KHO_THEO_LO AS lot
    CROSS APPLY dbo.ufn_LO_HANG_PhanLoaiHanDung(
        lot.HanSuDung,
        lot.TrangThaiLo,
        @NgayThamChieu,
        @NguongCanHanNgay
    ) AS expiry
    WHERE (@MaSP IS NULL OR lot.MaSP = @MaSP)
      AND @NgayThamChieu IS NOT NULL
      AND @NguongCanHanNgay BETWEEN 0 AND 3650
);
GO

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
            WHEN lot.TrangThaiLo = 'ACTIVE'
             AND lot.TinhTrangHanDung IN ('VALID', 'NEAR_EXPIRY')
                THEN lot.SoLuongTon
            ELSE 0
        END)), 0) AS TongTonKhaDung,
        COALESCE(SUM(CONVERT(BIGINT, CASE
            WHEN lot.TrangThaiLo = 'ACTIVE'
             AND lot.TinhTrangHanDung = 'NEAR_EXPIRY'
                THEN lot.SoLuongTon
            ELSE 0
        END)), 0) AS TongTonCanHan,
        COALESCE(SUM(CONVERT(BIGINT, CASE
            WHEN lot.TinhTrangHanDung = 'EXPIRED' THEN lot.SoLuongTon ELSE 0
        END)), 0) AS TongTonHetHan,
        COALESCE(SUM(CONVERT(BIGINT, CASE
            WHEN lot.TrangThaiLo = 'BLOCKED'
             AND lot.TinhTrangHanDung <> 'EXPIRED'
                THEN lot.SoLuongTon
            ELSE 0
        END)), 0) AS TongTonBiKhoa,
        SUM(CONVERT(BIGINT, CASE WHEN lot.SoLuongTon > 0 THEN 1 ELSE 0 END)) AS SoLoConTon,
        SUM(CONVERT(BIGINT, CASE
            WHEN lot.SoLuongTon > 0
             AND lot.TrangThaiLo = 'ACTIVE'
             AND lot.TinhTrangHanDung = 'NEAR_EXPIRY'
                THEN 1
            ELSE 0
        END)) AS SoLoCanHan,
        SUM(CONVERT(BIGINT, CASE
            WHEN lot.SoLuongTon > 0
             AND lot.TinhTrangHanDung = 'EXPIRED'
                THEN 1
            ELSE 0
        END)) AS SoLoHetHan
    FROM dbo.SAN_PHAM AS product
    LEFT JOIN dbo.ufn_LO_HANG_TheoSanPham(
        @MaSP,
        @NgayThamChieu,
        @NguongCanHanNgay
    ) AS lot ON lot.MaSP = product.MaSP
    WHERE (@MaSP IS NULL OR product.MaSP = @MaSP)
      AND @NgayThamChieu IS NOT NULL
      AND @NguongCanHanNgay BETWEEN 0 AND 3650
    GROUP BY product.MaSP
);
GO

CREATE OR ALTER FUNCTION dbo.ufn_SAN_PHAM_CoTheBan
(
    @NgayThamChieu DATE
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        product.MaSP,
        product.TenSP,
        product.MaVach,
        product.DonViTinh,
        product.GiaBan,
        product.MaLoai,
        category.TenLoai,
        inventory.TongTonKhaDung AS TonKhaDung
    FROM dbo.ufn_TON_KHO_TheoSanPham(NULL, @NgayThamChieu, 0) AS inventory
    JOIN dbo.SAN_PHAM AS product ON product.MaSP = inventory.MaSP
    JOIN dbo.LOAI_SAN_PHAM AS category
        ON category.MaLoai = product.MaLoai
       AND category.TrangThai = 'ACTIVE'
    WHERE product.TrangThai = 'ACTIVE'
      AND inventory.TongTonKhaDung > 0
);
GO

PRINT 'Inventory classification, lot, summary and sellable-product functions are ready.';
GO
