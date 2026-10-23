SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_BAO_CAO_DoanhThuNhanVien;
GO

CREATE PROCEDURE dbo.usp_BAO_CAO_DoanhThuNhanVien
    @TuNgay DATE,
    @DenNgay DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
        THROW 51910, 'A valid inclusive report date range is required.', 1;

    DECLARE
        @TuNgayUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (CONVERT(DATETIME2(0), @TuNgay) AT TIME ZONE 'SE Asia Standard Time') AT TIME ZONE 'UTC'
        ),
        @DenNgayKeTiepUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay)) AT TIME ZONE 'SE Asia Standard Time') AT TIME ZONE 'UTC'
        );

    ;WITH ShiftTotals AS (
        SELECT work_shift.MaNV, COUNT_BIG(*) AS SoCaDaMo
        FROM dbo.CA_LAM_VIEC AS work_shift
        WHERE work_shift.GioBatDau >= @TuNgayUtc
          AND work_shift.GioBatDau < @DenNgayKeTiepUtc
        GROUP BY work_shift.MaNV
    ), RevenueTotals AS (
        SELECT
            event.MaNV,
            SUM(event.SoHoaDon) AS SoHoaDonHoanTat,
            SUM(event.DoanhThuGop) AS DoanhThuGop,
            SUM(event.TienHoanTra) AS TienHoanTra,
            SUM(event.DoanhThuThuan) AS DoanhThuThuan
        FROM dbo.vw_BAO_CAO_DOANH_THU_SU_KIEN AS event
        WHERE event.NgayGiaoDich >= @TuNgayUtc
          AND event.NgayGiaoDich < @DenNgayKeTiepUtc
        GROUP BY event.MaNV
    ), EmployeeKeys AS (
        SELECT MaNV FROM ShiftTotals
        UNION
        SELECT MaNV FROM RevenueTotals
    )
    SELECT
        employee.MaNV,
        employee.HoTen AS TenNhanVien,
        COALESCE(shift_total.SoCaDaMo, 0) AS SoCaDaMo,
        COALESCE(revenue.SoHoaDonHoanTat, 0) AS SoHoaDonHoanTat,
        COALESCE(revenue.DoanhThuGop, 0) AS DoanhThuGop,
        COALESCE(revenue.TienHoanTra, 0) AS TienHoanTra,
        COALESCE(revenue.DoanhThuThuan, 0) AS DoanhThuThuan
    FROM EmployeeKeys AS employee_key
    JOIN dbo.NHAN_VIEN AS employee
        ON employee.MaNV = employee_key.MaNV
    LEFT JOIN ShiftTotals AS shift_total
        ON shift_total.MaNV = employee.MaNV
    LEFT JOIN RevenueTotals AS revenue
        ON revenue.MaNV = employee.MaNV
    ORDER BY DoanhThuThuan DESC, employee.MaNV;
END;
GO
