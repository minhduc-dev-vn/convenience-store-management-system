SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DROP VIEW IF EXISTS dbo.vw_TAI_KHOAN_VAI_TRO;
GO

CREATE VIEW dbo.vw_TAI_KHOAN_VAI_TRO
AS
SELECT
    account.MaTK,
    account.TenDangNhap,
    account.MaVaiTro,
    role.TenVaiTro,
    account.TrangThai,
    account.LanDangNhapCuoi,
    account.NgayTao,
    CASE WHEN account.MaKH IS NOT NULL THEN 'CUSTOMER' ELSE 'EMPLOYEE' END AS LoaiChuSoHuu,
    COALESCE(account.MaKH, account.MaNV) AS MaChuSoHuu,
    COALESCE(customer.HoTen, employee.HoTen) AS TenChuSoHuu,
    COALESCE(customer.TrangThai, employee.TrangThai) AS TrangThaiChuSoHuu
FROM dbo.TAI_KHOAN AS account
JOIN dbo.VAI_TRO AS role
    ON role.MaVaiTro = account.MaVaiTro
LEFT JOIN dbo.KHACH_HANG AS customer
    ON customer.MaKH = account.MaKH
LEFT JOIN dbo.NHAN_VIEN AS employee
    ON employee.MaNV = account.MaNV;
GO

PRINT 'Account and role view is ready without exposing password hashes.';
GO
