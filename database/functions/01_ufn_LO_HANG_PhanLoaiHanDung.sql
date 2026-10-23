SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER FUNCTION dbo.ufn_LO_HANG_PhanLoaiHanDung
(
    @HanSuDung DATE,
    @TrangThaiLo VARCHAR(20),
    @NgayThamChieu DATE,
    @NguongCanHanNgay INT
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        CASE
            WHEN @NgayThamChieu IS NULL
              OR @NguongCanHanNgay IS NULL
              OR @NguongCanHanNgay < 0
              OR @NguongCanHanNgay > 3650
                THEN CONVERT(VARCHAR(20), NULL)
            WHEN @TrangThaiLo = 'EXPIRED'
              OR (@HanSuDung IS NOT NULL AND @HanSuDung <= @NgayThamChieu)
                THEN CONVERT(VARCHAR(20), 'EXPIRED')
            WHEN @HanSuDung > @NgayThamChieu
             AND @HanSuDung <= DATEADD(DAY, @NguongCanHanNgay, @NgayThamChieu)
                THEN CONVERT(VARCHAR(20), 'NEAR_EXPIRY')
            ELSE CONVERT(VARCHAR(20), 'VALID')
        END AS TinhTrangHanDung,
        CASE
            WHEN @NgayThamChieu IS NULL OR @HanSuDung IS NULL THEN CONVERT(INT, NULL)
            ELSE DATEDIFF(DAY, @NgayThamChieu, @HanSuDung)
        END AS SoNgayConLai
);
GO
