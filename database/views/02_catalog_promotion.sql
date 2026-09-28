SET NOCOUNT ON;
SET XACT_ABORT ON;
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
    product.MucTonToiThieu,
    product.MaLoai,
    category.TenLoai,
    category.TrangThai AS TrangThaiLoai,
    product.TrangThai
FROM dbo.SAN_PHAM AS product
JOIN dbo.LOAI_SAN_PHAM AS category
    ON category.MaLoai = product.MaLoai;
GO

DROP VIEW IF EXISTS dbo.vw_KHUYEN_MAI_SAN_PHAM_CHI_TIET;
GO

CREATE VIEW dbo.vw_KHUYEN_MAI_SAN_PHAM_CHI_TIET
AS
SELECT
    promotion.MaKM,
    promotion.TenKM,
    promotion.LoaiKM,
    promotion.GiaTri,
    promotion.GiaTriDonToiThieu,
    promotion.MucGiamToiDa,
    promotion.NgayBatDau,
    promotion.NgayKetThuc,
    promotion.TrangThai,
    promotion_product.MaSP,
    product.TenSP,
    product.MaVach,
    product.TrangThai AS TrangThaiSanPham
FROM dbo.KHUYEN_MAI AS promotion
LEFT JOIN dbo.KHUYEN_MAI_SAN_PHAM AS promotion_product
    ON promotion_product.MaKM = promotion.MaKM
LEFT JOIN dbo.SAN_PHAM AS product
    ON product.MaSP = promotion_product.MaSP;
GO

PRINT 'Catalog/category and promotion/product query views are ready.';
GO
