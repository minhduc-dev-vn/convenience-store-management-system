SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER FUNCTION dbo.ufn_HOA_DON_PhanBoCoTheTra
(
    @MaHD VARCHAR(15)
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        lot_output.MaCTHD,
        lot_output.MaLo,
        lot.SoLo,
        lot_output.SoLuong AS SoLuongXuat,
        CONVERT(INT, COALESCE(returned.SoLuongDaTra, 0)) AS SoLuongDaTra,
        CONVERT(INT, lot_output.SoLuong - COALESCE(returned.SoLuongDaTra, 0))
            AS SoLuongConLaiCoTheTra
    FROM dbo.CHI_TIET_XUAT_LO AS lot_output
    JOIN dbo.CHI_TIET_HOA_DON AS detail
        ON detail.MaCTHD = lot_output.MaCTHD
    JOIN dbo.LO_HANG AS lot
        ON lot.MaLo = lot_output.MaLo
    OUTER APPLY (
        SELECT SUM(CONVERT(BIGINT, return_line.SoLuongTra)) AS SoLuongDaTra
        FROM dbo.CHI_TIET_PHIEU_TRA AS return_line
        JOIN dbo.PHIEU_TRA AS return_header
            ON return_header.MaPT = return_line.MaPT
        WHERE return_line.MaCTHD = lot_output.MaCTHD
          AND return_line.MaLo = lot_output.MaLo
          AND return_header.MaHD = @MaHD
          AND return_header.TrangThai = 'COMPLETED'
    ) AS returned
    WHERE detail.MaHD = @MaHD
      AND @MaHD IS NOT NULL
);
GO
