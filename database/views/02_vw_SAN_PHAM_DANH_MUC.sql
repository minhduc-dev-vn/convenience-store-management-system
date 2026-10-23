SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP VIEW IF EXISTS dbo.vw_SAN_PHAM_DANH_MUC;
GO

CREATE VIEW dbo.vw_SAN_PHAM_DANH_MUC
AS
SELECT
    product.MaSP,
    product.TenSP,
    product.MaVach,
    product.DonViTinh,
    product.GiaBan,
    product.ImageUrl,
    product.MucTonToiThieu,
    product.MaLoai,
    category.TenLoai,
    category.TrangThai AS TrangThaiLoai,
    product.TrangThai
FROM dbo.SAN_PHAM AS product
JOIN dbo.LOAI_SAN_PHAM AS category
    ON category.MaLoai = product.MaLoai;
GO
