SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
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
