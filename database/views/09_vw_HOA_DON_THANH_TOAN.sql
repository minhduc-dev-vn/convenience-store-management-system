SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
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
