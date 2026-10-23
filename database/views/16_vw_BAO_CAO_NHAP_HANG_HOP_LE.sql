SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP VIEW IF EXISTS dbo.vw_BAO_CAO_NHAP_HANG_HOP_LE;
GO

CREATE VIEW dbo.vw_BAO_CAO_NHAP_HANG_HOP_LE
AS
    SELECT
        receipt.MaPN,
        receipt.NgayXacNhan,
        receipt.MaNCC,
        supplier.TenNCC,
        receipt.MaNV,
        employee.HoTen AS TenNhanVien,
        detail.MaCTPN,
        detail.MaLo,
        lot.MaSP,
        product.TenSP,
        product.MaLoai,
        category.TenLoai,
        detail.SoLuong,
        detail.DonGiaNhap,
        detail.ThanhTien
    FROM dbo.PHIEU_NHAP AS receipt
    JOIN dbo.NHA_CUNG_CAP AS supplier
        ON supplier.MaNCC = receipt.MaNCC
    JOIN dbo.NHAN_VIEN AS employee
        ON employee.MaNV = receipt.MaNV
    JOIN dbo.CHI_TIET_PHIEU_NHAP AS detail
        ON detail.MaPN = receipt.MaPN
    JOIN dbo.LO_HANG AS lot
        ON lot.MaLo = detail.MaLo
    JOIN dbo.SAN_PHAM AS product
        ON product.MaSP = lot.MaSP
    JOIN dbo.LOAI_SAN_PHAM AS category
        ON category.MaLoai = product.MaLoai
    WHERE receipt.TrangThai = 'CONFIRMED'
      AND receipt.NgayXacNhan IS NOT NULL;
GO
