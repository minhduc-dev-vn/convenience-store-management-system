SET NOCOUNT ON;
SET XACT_ABORT ON;
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

DROP VIEW IF EXISTS dbo.vw_BAO_CAO_TON_KHO_HIEN_TAI;
GO

CREATE VIEW dbo.vw_BAO_CAO_TON_KHO_HIEN_TAI
AS
    SELECT
        product.MaSP,
        product.TenSP,
        product.DonViTinh,
        product.MaLoai,
        category.TenLoai,
        product.MucTonToiThieu,
        product.TrangThai AS TrangThaiSanPham,
        SUM(CONVERT(BIGINT, COALESCE(lot.SoLuongTon, 0))) AS TongTon,
        SUM(CONVERT(BIGINT, CASE
            WHEN lot.TrangThai = 'ACTIVE'
             AND (lot.HanSuDung IS NULL OR lot.HanSuDung >= CONVERT(DATE, SYSDATETIME()))
                THEN lot.SoLuongTon
            ELSE 0
        END)) AS TonCoTheBan,
        SUM(CONVERT(BIGINT, CASE
            WHEN lot.TrangThai = 'BLOCKED' THEN lot.SoLuongTon ELSE 0
        END)) AS TonBiKhoa,
        SUM(CONVERT(BIGINT, CASE
            WHEN lot.TrangThai = 'EXPIRED'
              OR (lot.HanSuDung IS NOT NULL AND lot.HanSuDung < CONVERT(DATE, SYSDATETIME()))
                THEN lot.SoLuongTon
            ELSE 0
        END)) AS TonHetHan,
        SUM(CONVERT(DECIMAL(38,2), COALESCE(lot.SoLuongTon, 0) * COALESCE(lot.GiaNhap, 0))) AS GiaTriTonTheoGiaNhap,
        SUM(CONVERT(BIGINT, CASE WHEN lot.SoLuongTon > 0 THEN 1 ELSE 0 END)) AS SoLoConTon
    FROM dbo.SAN_PHAM AS product
    JOIN dbo.LOAI_SAN_PHAM AS category
        ON category.MaLoai = product.MaLoai
    LEFT JOIN dbo.LO_HANG AS lot
        ON lot.MaSP = product.MaSP
    GROUP BY
        product.MaSP,
        product.TenSP,
        product.DonViTinh,
        product.MaLoai,
        category.TenLoai,
        product.MucTonToiThieu,
        product.TrangThai;
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

PRINT 'Business-report event, inventory and receiving views are ready.';
GO
