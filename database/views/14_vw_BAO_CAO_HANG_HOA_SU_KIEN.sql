SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP VIEW IF EXISTS dbo.vw_BAO_CAO_HANG_HOA_SU_KIEN;
GO

CREATE VIEW dbo.vw_BAO_CAO_HANG_HOA_SU_KIEN
AS
    SELECT
        invoice.NgayLap AS NgayGiaoDich,
        CONVERT(VARCHAR(10), 'SALE') AS LoaiGiaoDich,
        invoice.MaHD,
        CONVERT(VARCHAR(15), NULL) AS MaPT,
        invoice.MaCa,
        work_shift.MaNV,
        detail.MaCTHD,
        detail.MaSP,
        product.TenSP,
        product.MaLoai,
        category.TenLoai,
        CONVERT(BIGINT, detail.SoLuong) AS SoLuongBan,
        CONVERT(BIGINT, 0) AS SoLuongTra,
        detail.ThanhTien AS DoanhThuGop,
        CONVERT(DECIMAL(18,2), 0) AS TienHoanTra,
        detail.ThanhTien AS DoanhThuThuan
    FROM dbo.HOA_DON AS invoice
    JOIN dbo.CA_LAM_VIEC AS work_shift
        ON work_shift.MaCa = invoice.MaCa
    JOIN dbo.CHI_TIET_HOA_DON AS detail
        ON detail.MaHD = invoice.MaHD
    JOIN dbo.SAN_PHAM AS product
        ON product.MaSP = detail.MaSP
    JOIN dbo.LOAI_SAN_PHAM AS category
        ON category.MaLoai = product.MaLoai
    WHERE invoice.TrangThai IN ('PAID', 'REFUNDED')

    UNION ALL

    SELECT
        return_header.NgayTra,
        CONVERT(VARCHAR(10), 'REFUND'),
        return_header.MaHD,
        return_header.MaPT,
        invoice.MaCa,
        work_shift.MaNV,
        return_line.MaCTHD,
        invoice_line.MaSP,
        product.TenSP,
        product.MaLoai,
        category.TenLoai,
        CONVERT(BIGINT, 0),
        CONVERT(BIGINT, return_line.SoLuongTra),
        CONVERT(DECIMAL(18,2), 0),
        return_line.TienHoan,
        CONVERT(DECIMAL(18,2), -return_line.TienHoan)
    FROM dbo.PHIEU_TRA AS return_header
    JOIN dbo.CHI_TIET_PHIEU_TRA AS return_line
        ON return_line.MaPT = return_header.MaPT
    JOIN dbo.CHI_TIET_HOA_DON AS invoice_line
        ON invoice_line.MaCTHD = return_line.MaCTHD
    JOIN dbo.HOA_DON AS invoice
        ON invoice.MaHD = return_header.MaHD
       AND invoice.MaHD = invoice_line.MaHD
    JOIN dbo.CA_LAM_VIEC AS work_shift
        ON work_shift.MaCa = invoice.MaCa
    JOIN dbo.SAN_PHAM AS product
        ON product.MaSP = invoice_line.MaSP
    JOIN dbo.LOAI_SAN_PHAM AS category
        ON category.MaLoai = product.MaLoai
    WHERE return_header.TrangThai = 'COMPLETED';
GO
