SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DROP VIEW IF EXISTS dbo.vw_PHIEU_NHAP_CHI_TIET;
GO

CREATE VIEW dbo.vw_PHIEU_NHAP_CHI_TIET
AS
SELECT
    receipt.MaPN,
    receipt.NgayNhap,
    receipt.MaNV,
    employee.HoTen AS TenNhanVien,
    receipt.MaNCC,
    supplier.TenNCC,
    receipt.TongTien,
    receipt.TrangThai,
    receipt.NgayXacNhan,
    receipt.GhiChu,
    detail.MaCTPN,
    detail.MaLo,
    lot.MaSP,
    product.TenSP,
    lot.SoLo,
    lot.NgaySanXuat,
    lot.HanSuDung,
    detail.SoLuong,
    detail.DonGiaNhap,
    detail.ThanhTien
FROM dbo.PHIEU_NHAP AS receipt
JOIN dbo.NHAN_VIEN AS employee
    ON employee.MaNV = receipt.MaNV
JOIN dbo.NHA_CUNG_CAP AS supplier
    ON supplier.MaNCC = receipt.MaNCC
LEFT JOIN dbo.CHI_TIET_PHIEU_NHAP AS detail
    ON detail.MaPN = receipt.MaPN
LEFT JOIN dbo.LO_HANG AS lot
    ON lot.MaLo = detail.MaLo
LEFT JOIN dbo.SAN_PHAM AS product
    ON product.MaSP = lot.MaSP;
GO

DROP VIEW IF EXISTS dbo.vw_LO_HANG_THEO_DOI;
GO

CREATE VIEW dbo.vw_LO_HANG_THEO_DOI
AS
SELECT
    lot.MaLo,
    lot.MaSP,
    product.TenSP,
    product.DonViTinh,
    lot.SoLo,
    lot.NgaySanXuat,
    lot.HanSuDung,
    lot.GiaNhap,
    lot.SoLuongTon,
    lot.TrangThai,
    CASE
        WHEN lot.HanSuDung IS NULL THEN NULL
        ELSE DATEDIFF(DAY, CONVERT(DATE, SYSDATETIME()), lot.HanSuDung)
    END AS SoNgayConLai,
    CONVERT(BIT, CASE
        WHEN lot.HanSuDung < CONVERT(DATE, SYSDATETIME()) THEN 1
        ELSE 0
    END) AS DaHetHan,
    CONVERT(BIT, CASE
        WHEN lot.HanSuDung >= CONVERT(DATE, SYSDATETIME())
         AND lot.HanSuDung <= DATEADD(DAY, 30, CONVERT(DATE, SYSDATETIME())) THEN 1
        ELSE 0
    END) AS SapHetHan
FROM dbo.LO_HANG AS lot
JOIN dbo.SAN_PHAM AS product
    ON product.MaSP = lot.MaSP
WHERE lot.SoLuongTon > 0;
GO

PRINT 'Receiving detail and lot/expiry tracking views are ready.';
GO
