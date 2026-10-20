SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DROP VIEW IF EXISTS dbo.vw_KIEM_KE_CHI_TIET;
GO

CREATE VIEW dbo.vw_KIEM_KE_CHI_TIET
AS
    SELECT
        stocktake.MaKK,
        stocktake.NgayKiemKe,
        stocktake.MaNV,
        employee.HoTen AS TenNhanVien,
        stocktake.TrangThai,
        stocktake.GhiChu,
        detail.MaLo,
        lot.SoLo,
        lot.MaSP,
        product.TenSP,
        product.DonViTinh,
        detail.SoLuongHeThong,
        detail.SoLuongThucTe,
        detail.ChenhLech,
        detail.LyDo,
        lot.SoLuongTon AS SoLuongTonHienTai,
        CONVERT(BIT, CASE
            WHEN lot.SoLuongTon <> detail.SoLuongHeThong THEN 1
            ELSE 0
        END) AS SnapshotDaThayDoi
    FROM dbo.KIEM_KE AS stocktake
    JOIN dbo.NHAN_VIEN AS employee
        ON employee.MaNV = stocktake.MaNV
    JOIN dbo.CHI_TIET_KIEM_KE AS detail
        ON detail.MaKK = stocktake.MaKK
    JOIN dbo.LO_HANG AS lot
        ON lot.MaLo = detail.MaLo
    JOIN dbo.SAN_PHAM AS product
        ON product.MaSP = lot.MaSP;
GO

PRINT 'Stocktake detail view is ready.';
GO
