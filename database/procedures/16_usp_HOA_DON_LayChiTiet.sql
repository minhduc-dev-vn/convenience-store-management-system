SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_HOA_DON_LayChiTiet;
GO

CREATE PROCEDURE dbo.usp_HOA_DON_LayChiTiet
    @MaHD VARCHAR(15)
AS
BEGIN
    SET NOCOUNT ON;

    SET @MaHD = NULLIF(LTRIM(RTRIM(@MaHD)), '');

    IF @MaHD IS NULL
        THROW 51530, 'Invoice code is required.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.HOA_DON
        WHERE MaHD = @MaHD
          AND TrangThai = 'PAID'
    )
        THROW 51531, 'A paid invoice with the requested code does not exist.', 1;

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
        invoice.TrangThai,
        invoice.GhiChu
    FROM dbo.HOA_DON AS invoice
    JOIN dbo.CA_LAM_VIEC AS work_shift ON work_shift.MaCa = invoice.MaCa
    JOIN dbo.NHAN_VIEN AS employee ON employee.MaNV = work_shift.MaNV
    LEFT JOIN dbo.KHACH_HANG AS customer ON customer.MaKH = invoice.MaKH
    WHERE invoice.MaHD = @MaHD;

    SELECT
        MaCTHD, MaSP, TenSP, MaVach, DonViTinh,
        SoLuong, DonGiaBan, TienGiam, ThanhTien, MaKM, TenKM
    FROM dbo.vw_HOA_DON_CHI_TIET
    WHERE MaHD = @MaHD
    ORDER BY MaCTHD;

    SELECT
        MaThanhToan, PhuongThuc, SoTien, ThoiGian,
        MaGiaoDichNgoai, TrangThaiThanhToan
    FROM dbo.vw_HOA_DON_THANH_TOAN
    WHERE MaHD = @MaHD
      AND TrangThaiThanhToan = 'SUCCESS'
    ORDER BY MaThanhToan;
END;
GO
