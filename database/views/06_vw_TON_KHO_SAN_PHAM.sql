SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP VIEW IF EXISTS dbo.vw_TON_KHO_SAN_PHAM;
GO

CREATE VIEW dbo.vw_TON_KHO_SAN_PHAM
AS
SELECT
    product.MaSP,
    product.TenSP,
    product.DonViTinh,
    product.MucTonToiThieu,
    product.MaLoai,
    category.TenLoai,
    product.TrangThai AS TrangThaiSanPham,
    SUM(CONVERT(BIGINT, COALESCE(lot.SoLuongTon, 0))) AS TongTon,
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
    product.MucTonToiThieu,
    product.MaLoai,
    category.TenLoai,
    product.TrangThai;
GO
