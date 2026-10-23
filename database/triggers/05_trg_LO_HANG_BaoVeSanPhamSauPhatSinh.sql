SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Không cho đổi sản phẩm của lô đã phát sinh lịch sử nghiệp vụ.
CREATE OR ALTER TRIGGER dbo.trg_LO_HANG_BaoVeSanPhamSauPhatSinh
ON dbo.LO_HANG
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF COALESCE(IS_SRVROLEMEMBER('sysadmin'), 0) = 1
       OR COALESCE(IS_ROLEMEMBER('db_owner'), 0) = 1
        RETURN;

    IF EXISTS (
        SELECT 1
        FROM inserted AS current_lot
        JOIN deleted AS previous_lot ON previous_lot.MaLo = current_lot.MaLo
        WHERE current_lot.MaSP <> previous_lot.MaSP
          AND (
              EXISTS (
                  SELECT 1
                  FROM dbo.CHI_TIET_PHIEU_NHAP AS receipt_line
                  JOIN dbo.PHIEU_NHAP AS receipt ON receipt.MaPN = receipt_line.MaPN
                  WHERE receipt_line.MaLo = current_lot.MaLo
                    AND receipt.TrangThai = 'CONFIRMED'
              )
              OR EXISTS (
                  SELECT 1
                  FROM dbo.GIAO_DICH_KHO AS movement
                  WHERE movement.MaLo = current_lot.MaLo
              )
              OR EXISTS (
                  SELECT 1
                  FROM dbo.CHI_TIET_XUAT_LO AS allocation
                  WHERE allocation.MaLo = current_lot.MaLo
              )
              OR EXISTS (
                  SELECT 1
                  FROM dbo.CHI_TIET_PHIEU_TRA AS return_line
                  WHERE return_line.MaLo = current_lot.MaLo
              )
              OR EXISTS (
                  SELECT 1
                  FROM dbo.CHI_TIET_KIEM_KE AS stocktake_line
                  WHERE stocktake_line.MaLo = current_lot.MaLo
              )
          )
    )
        THROW 53203, 'A lot product cannot be reassigned after the lot has business history.', 1;
END;
GO
