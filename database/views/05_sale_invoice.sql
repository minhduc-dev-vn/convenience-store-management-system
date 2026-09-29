SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DROP VIEW IF EXISTS dbo.vw_HOA_DON_CHI_TIET;
GO

CREATE VIEW dbo.vw_HOA_DON_CHI_TIET
AS
    SELECT
        invoice.MaHD,
        invoice.NgayLap,
        invoice.MaCa,
        work_shift.MaNV,
        employee.HoTen AS TenNhanVien,
        invoice.MaKH,
        customer.HoTen AS TenKhachHang,
        invoice.TongTienHang,
        invoice.TongGiamGia,
        invoice.TongThanhToan,
        invoice.DiemSuDung,
        invoice.DiemTichLuy,
        invoice.TrangThai AS TrangThaiHoaDon,
        invoice.GhiChu,
        detail.MaCTHD,
        detail.MaSP,
        product.TenSP,
        product.MaVach,
        product.DonViTinh,
        detail.SoLuong,
        detail.DonGiaBan,
        detail.TienGiam,
        detail.ThanhTien,
        detail.MaKM,
        promotion.TenKM
    FROM dbo.HOA_DON AS invoice
    JOIN dbo.CA_LAM_VIEC AS work_shift
        ON work_shift.MaCa = invoice.MaCa
    JOIN dbo.NHAN_VIEN AS employee
        ON employee.MaNV = work_shift.MaNV
    LEFT JOIN dbo.KHACH_HANG AS customer
        ON customer.MaKH = invoice.MaKH
    JOIN dbo.CHI_TIET_HOA_DON AS detail
        ON detail.MaHD = invoice.MaHD
    JOIN dbo.SAN_PHAM AS product
        ON product.MaSP = detail.MaSP
    LEFT JOIN dbo.KHUYEN_MAI AS promotion
        ON promotion.MaKM = detail.MaKM;
GO

DROP VIEW IF EXISTS dbo.vw_HOA_DON_THANH_TOAN;
GO

CREATE VIEW dbo.vw_HOA_DON_THANH_TOAN
AS
    SELECT
        payment.MaThanhToan,
        payment.MaHD,
        invoice.NgayLap,
        invoice.TongThanhToan,
        invoice.TrangThai AS TrangThaiHoaDon,
        payment.PhuongThuc,
        payment.SoTien,
        payment.ThoiGian,
        payment.MaGiaoDichNgoai,
        payment.TrangThai AS TrangThaiThanhToan
    FROM dbo.THANH_TOAN AS payment
    JOIN dbo.HOA_DON AS invoice
        ON invoice.MaHD = payment.MaHD;
GO

PRINT 'Invoice detail and payment read views are ready.';
GO
