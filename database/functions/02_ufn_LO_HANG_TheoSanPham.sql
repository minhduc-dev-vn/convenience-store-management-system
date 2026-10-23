SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
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
