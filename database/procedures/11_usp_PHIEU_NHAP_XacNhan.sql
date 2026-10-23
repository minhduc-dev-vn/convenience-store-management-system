SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_PHIEU_NHAP_XacNhan;
GO

CREATE PROCEDURE dbo.usp_PHIEU_NHAP_XacNhan
    @MaPN VARCHAR(15)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @MaPN = NULLIF(LTRIM(RTRIM(@MaPN)), '');

    IF @MaPN IS NULL
        THROW 51330, 'Receipt code is required.', 1;

    DECLARE @InitialTransactionCount INT = @@TRANCOUNT;

    BEGIN TRY
        IF @InitialTransactionCount = 0
            BEGIN TRANSACTION;
        ELSE
            SAVE TRANSACTION ConfirmReceipt;

        DECLARE
            @ReceiptStatus VARCHAR(20),
            @EmployeeCode VARCHAR(10),
            @ConfirmationTime DATETIME2(0) = SYSUTCDATETIME(),
            @ReceiptTotal DECIMAL(18,2);

        SELECT
            @ReceiptStatus = TrangThai,
            @EmployeeCode = MaNV
        FROM dbo.PHIEU_NHAP WITH (UPDLOCK, HOLDLOCK)
        WHERE MaPN = @MaPN;

        IF @ReceiptStatus IS NULL
            THROW 51331, 'Receipt does not exist.', 1;

        IF @ReceiptStatus = 'CONFIRMED'
            THROW 51332, 'Receipt has already been confirmed.', 1;

        IF @ReceiptStatus <> 'DRAFT'
            THROW 51333, 'Only a DRAFT receipt can be confirmed.', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.GIAO_DICH_KHO WITH (UPDLOCK, HOLDLOCK)
            WHERE LoaiGiaoDich = 'IMPORT'
              AND MaThamChieu = @MaPN
        )
            THROW 51334, 'Receipt already has an import stock transaction.', 1;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_PHIEU_NHAP
            WHERE MaPN = @MaPN
        )
            THROW 51335, 'Receipt must contain at least one detail before confirmation.', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_PHIEU_NHAP AS detail
            LEFT JOIN dbo.LO_HANG AS lot WITH (UPDLOCK, HOLDLOCK)
                ON lot.MaLo = detail.MaLo
            WHERE detail.MaPN = @MaPN
              AND (
                  detail.SoLuong <= 0
                  OR detail.DonGiaNhap < 0
                  OR lot.MaLo IS NULL
                  OR (lot.HanSuDung IS NOT NULL AND lot.NgaySanXuat IS NOT NULL AND lot.HanSuDung <= lot.NgaySanXuat)
              )
        )
            THROW 51336, 'Receipt contains an invalid quantity, unit cost or lot date relation.', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_PHIEU_NHAP AS detail
            JOIN dbo.LO_HANG AS lot WITH (UPDLOCK, HOLDLOCK)
                ON lot.MaLo = detail.MaLo
            WHERE detail.MaPN = @MaPN
              AND lot.SoLuongTon > 2147483647 - detail.SoLuong
        )
            THROW 51337, 'Confirming the receipt would overflow lot inventory.', 1;

        SELECT @ReceiptTotal = SUM(detail.ThanhTien)
        FROM dbo.CHI_TIET_PHIEU_NHAP AS detail
        WHERE detail.MaPN = @MaPN;

        UPDATE dbo.PHIEU_NHAP
        SET TongTien = @ReceiptTotal,
            TrangThai = 'CONFIRMED',
            NgayXacNhan = @ConfirmationTime
        WHERE MaPN = @MaPN;

        UPDATE lot
        SET lot.SoLuongTon = lot.SoLuongTon + detail.SoLuong,
            lot.GiaNhap = detail.DonGiaNhap
        FROM dbo.LO_HANG AS lot
        JOIN dbo.CHI_TIET_PHIEU_NHAP AS detail
            ON detail.MaLo = lot.MaLo
        WHERE detail.MaPN = @MaPN;

        INSERT INTO dbo.GIAO_DICH_KHO (
            MaSP,
            MaLo,
            LoaiGiaoDich,
            SoLuongBienDong,
            ThoiGian,
            MaThamChieu,
            MaNV,
            GhiChu
        )
        SELECT
            lot.MaSP,
            detail.MaLo,
            'IMPORT',
            detail.SoLuong,
            @ConfirmationTime,
            @MaPN,
            @EmployeeCode,
            N'Xác nhận nhập kho từ phiếu nhập ' + @MaPN
        FROM dbo.CHI_TIET_PHIEU_NHAP AS detail
        JOIN dbo.LO_HANG AS lot
            ON lot.MaLo = detail.MaLo
        WHERE detail.MaPN = @MaPN;

        IF @InitialTransactionCount = 0
            COMMIT TRANSACTION;

        SELECT
            receipt.MaPN,
            receipt.TrangThai,
            receipt.NgayXacNhan,
            receipt.TongTien,
            COUNT_BIG(stock_transaction.MaGiaoDich) AS SoGiaoDichNhap
        FROM dbo.PHIEU_NHAP AS receipt
        LEFT JOIN dbo.GIAO_DICH_KHO AS stock_transaction
            ON stock_transaction.MaThamChieu = receipt.MaPN
           AND stock_transaction.LoaiGiaoDich = 'IMPORT'
        WHERE receipt.MaPN = @MaPN
        GROUP BY receipt.MaPN, receipt.TrangThai, receipt.NgayXacNhan, receipt.TongTien;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() = -1
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1 AND @InitialTransactionCount = 0
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1
            ROLLBACK TRANSACTION ConfirmReceipt;

        THROW;
    END CATCH;
END;
GO
