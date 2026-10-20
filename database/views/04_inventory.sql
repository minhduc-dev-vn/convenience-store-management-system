SET NOCOUNT ON;
SET XACT_ABORT ON;
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

DROP VIEW IF EXISTS dbo.vw_TON_KHO_THEO_LO;
GO

CREATE VIEW dbo.vw_TON_KHO_THEO_LO
AS
SELECT
    lot.MaLo,
    lot.MaSP,
    product.TenSP,
    product.DonViTinh,
    product.MaLoai,
    category.TenLoai,
    lot.SoLo,
    lot.NgaySanXuat,
    lot.HanSuDung,
    lot.GiaNhap,
    lot.SoLuongTon,
    lot.TrangThai AS TrangThaiLo
FROM dbo.LO_HANG AS lot
JOIN dbo.SAN_PHAM AS product
    ON product.MaSP = lot.MaSP
JOIN dbo.LOAI_SAN_PHAM AS category
    ON category.MaLoai = product.MaLoai;
GO

PRINT 'Inventory totals and lot-detail views are ready without storing duplicate product stock.';
GO
