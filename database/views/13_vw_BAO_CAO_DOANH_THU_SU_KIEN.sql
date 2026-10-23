SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP VIEW IF EXISTS dbo.vw_BAO_CAO_DOANH_THU_SU_KIEN;
GO

CREATE VIEW dbo.vw_BAO_CAO_DOANH_THU_SU_KIEN
AS
    SELECT
        invoice.NgayLap AS NgayGiaoDich,
        CONVERT(VARCHAR(10), 'SALE') AS LoaiGiaoDich,
        invoice.MaHD,
        CONVERT(VARCHAR(15), NULL) AS MaPT,
        invoice.MaCa,
        work_shift.MaNV,
        employee.HoTen AS TenNhanVien,
        CONVERT(BIGINT, 1) AS SoHoaDon,
        invoice.TongThanhToan AS DoanhThuGop,
        CONVERT(DECIMAL(18,2), 0) AS TienHoanTra,
        invoice.TongThanhToan AS DoanhThuThuan
    FROM dbo.HOA_DON AS invoice
    JOIN dbo.CA_LAM_VIEC AS work_shift
        ON work_shift.MaCa = invoice.MaCa
    JOIN dbo.NHAN_VIEN AS employee
        ON employee.MaNV = work_shift.MaNV
    WHERE invoice.TrangThai IN ('PAID', 'REFUNDED')

    UNION ALL

    SELECT
        return_header.NgayTra,
        CONVERT(VARCHAR(10), 'REFUND'),
        return_header.MaHD,
        return_header.MaPT,
        invoice.MaCa,
        work_shift.MaNV,
        employee.HoTen,
        CONVERT(BIGINT, 0),
        CONVERT(DECIMAL(18,2), 0),
        return_header.TongTienHoan,
        CONVERT(DECIMAL(18,2), -return_header.TongTienHoan)
    FROM dbo.PHIEU_TRA AS return_header
    JOIN dbo.HOA_DON AS invoice
        ON invoice.MaHD = return_header.MaHD
    JOIN dbo.CA_LAM_VIEC AS work_shift
        ON work_shift.MaCa = invoice.MaCa
    JOIN dbo.NHAN_VIEN AS employee
        ON employee.MaNV = work_shift.MaNV
    WHERE return_header.TrangThai = 'COMPLETED';
GO
