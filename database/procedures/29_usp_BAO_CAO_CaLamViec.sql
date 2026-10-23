SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_BAO_CAO_CaLamViec;
GO

CREATE PROCEDURE dbo.usp_BAO_CAO_CaLamViec
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

    SELECT
        work_shift.MaCa,
        work_shift.MaNV,
        employee.HoTen AS TenNhanVien,
        work_shift.GioBatDau,
        work_shift.GioKetThuc,
        work_shift.TienDauCa,
        work_shift.TienCuoiCa,
        work_shift.TrangThai,
        COALESCE(revenue.SoHoaDonHoanTat, 0) AS SoHoaDonHoanTat,
        COALESCE(revenue.DoanhThuGop, 0) AS DoanhThuGop,
        COALESCE(revenue.TienHoanTra, 0) AS TienHoanTra,
        COALESCE(revenue.DoanhThuThuan, 0) AS DoanhThuThuan,
        COALESCE(cash_payment.DoanhThuTienMatGhiNhan, 0) AS DoanhThuTienMatGhiNhan,
        CASE
            WHEN work_shift.TienCuoiCa IS NULL THEN NULL
            ELSE CONVERT(DECIMAL(18,2),
                work_shift.TienCuoiCa
                - work_shift.TienDauCa
                - COALESCE(cash_payment.DoanhThuTienMatGhiNhan, 0)
            )
        END AS ChenhLechTienMat
    FROM dbo.CA_LAM_VIEC AS work_shift
    JOIN dbo.NHAN_VIEN AS employee
        ON employee.MaNV = work_shift.MaNV
    OUTER APPLY (
        SELECT
            SUM(event.SoHoaDon) AS SoHoaDonHoanTat,
            SUM(event.DoanhThuGop) AS DoanhThuGop,
            SUM(event.TienHoanTra) AS TienHoanTra,
            SUM(event.DoanhThuThuan) AS DoanhThuThuan
        FROM dbo.vw_BAO_CAO_DOANH_THU_SU_KIEN AS event
        WHERE event.MaCa = work_shift.MaCa
    ) AS revenue
    OUTER APPLY (
        SELECT SUM(payment.SoTien) AS DoanhThuTienMatGhiNhan
        FROM dbo.HOA_DON AS invoice
        JOIN dbo.THANH_TOAN AS payment
            ON payment.MaHD = invoice.MaHD
        WHERE invoice.MaCa = work_shift.MaCa
          AND payment.TrangThai = 'SUCCESS'
          AND payment.PhuongThuc = 'CASH'
    ) AS cash_payment
    WHERE work_shift.GioBatDau >= @TuNgayUtc
      AND work_shift.GioBatDau < @DenNgayKeTiepUtc
    ORDER BY work_shift.GioBatDau DESC, work_shift.MaCa DESC;
END;
GO
