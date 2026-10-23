SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
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
