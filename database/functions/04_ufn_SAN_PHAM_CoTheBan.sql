SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
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
