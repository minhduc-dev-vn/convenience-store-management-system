SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP VIEW IF EXISTS dbo.vw_BAO_CAO_TON_KHO_HIEN_TAI;
GO

CREATE VIEW dbo.vw_BAO_CAO_TON_KHO_HIEN_TAI
AS
    SELECT
        product.MaSP,
        product.TenSP,
        product.DonViTinh,
        product.MaLoai,
        category.TenLoai,
        product.MucTonToiThieu,
        product.TrangThai AS TrangThaiSanPham,
        SUM(CONVERT(BIGINT, COALESCE(lot.SoLuongTon, 0))) AS TongTon,
        SUM(CONVERT(BIGINT, CASE
            WHEN lot.TrangThai = 'ACTIVE'
             AND (
                 lot.HanSuDung IS NULL
                 OR lot.HanSuDung >= CONVERT(
                     DATE,
                     (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'SE Asia Standard Time'
                 )
             )
                THEN lot.SoLuongTon
            ELSE 0
        END)) AS TonCoTheBan,
        SUM(CONVERT(BIGINT, CASE
            WHEN lot.TrangThai = 'BLOCKED' THEN lot.SoLuongTon ELSE 0
        END)) AS TonBiKhoa,
        SUM(CONVERT(BIGINT, CASE
            WHEN lot.TrangThai = 'EXPIRED'
              OR (
                  lot.HanSuDung IS NOT NULL
                  AND lot.HanSuDung < CONVERT(
                      DATE,
                      (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'SE Asia Standard Time'
                  )
              )
                THEN lot.SoLuongTon
            ELSE 0
        END)) AS TonHetHan,
        SUM(CONVERT(DECIMAL(38,2), COALESCE(lot.SoLuongTon, 0) * COALESCE(lot.GiaNhap, 0))) AS GiaTriTonTheoGiaNhap,
        SUM(CONVERT(BIGINT, CASE WHEN lot.SoLuongTon > 0 THEN 1 ELSE 0 END)) AS SoLoConTon
    FROM dbo.SAN_PHAM AS product
    JOIN dbo.LOAI_SAN_PHAM AS category
        ON category.MaLoai = product.MaLoai
    LEFT JOIN dbo.LO_HANG AS lot
        ON lot.MaSP = product.MaSP
    GROUP BY
        product.MaSP,
        product.TenSP,
        product.DonViTinh,
        product.MaLoai,
        category.TenLoai,
        product.MucTonToiThieu,
        product.TrangThai;
GO
