SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DROP VIEW IF EXISTS dbo.vw_PHIEU_TRA_CHI_TIET;
GO

CREATE VIEW dbo.vw_PHIEU_TRA_CHI_TIET
AS
    SELECT
        return_header.MaPT,
        return_header.MaHD,
        return_header.MaNV,
        employee.HoTen AS TenNhanVien,
        return_header.NgayTra,
        return_header.LyDo,
        return_header.TongTienHoan,
        return_header.TrangThai AS TrangThaiPhieuTra,
        invoice.TrangThai AS TrangThaiHoaDon,
        return_line.MaCTHD,
        invoice_line.MaSP,
        product.TenSP,
        product.DonViTinh,
        return_line.MaLo,
        lot.SoLo,
        return_line.SoLuongTra,
        return_line.TienHoan,
        return_line.TinhTrangHang
    FROM dbo.PHIEU_TRA AS return_header
    JOIN dbo.HOA_DON AS invoice
        ON invoice.MaHD = return_header.MaHD
    JOIN dbo.NHAN_VIEN AS employee
        ON employee.MaNV = return_header.MaNV
    JOIN dbo.CHI_TIET_PHIEU_TRA AS return_line
        ON return_line.MaPT = return_header.MaPT
    JOIN dbo.CHI_TIET_HOA_DON AS invoice_line
        ON invoice_line.MaCTHD = return_line.MaCTHD
    JOIN dbo.SAN_PHAM AS product
        ON product.MaSP = invoice_line.MaSP
    JOIN dbo.LO_HANG AS lot
        ON lot.MaLo = return_line.MaLo;
GO

PRINT 'Return and refund detail view is ready.';
GO
