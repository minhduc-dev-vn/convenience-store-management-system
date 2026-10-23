SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_PHIEU_NHAP_Huy;
GO

CREATE PROCEDURE dbo.usp_PHIEU_NHAP_Huy
    @MaPN VARCHAR(15)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @MaPN = NULLIF(LTRIM(RTRIM(@MaPN)), '');

    DECLARE @InitialTransactionCount INT = @@TRANCOUNT;

    BEGIN TRY
        IF @InitialTransactionCount = 0
            BEGIN TRANSACTION;
        ELSE
            SAVE TRANSACTION CancelReceipt;

        DECLARE @ReceiptStatus VARCHAR(20);

        SELECT @ReceiptStatus = TrangThai
        FROM dbo.PHIEU_NHAP WITH (UPDLOCK, HOLDLOCK)
        WHERE MaPN = @MaPN;

        IF @ReceiptStatus IS NULL
            THROW 51327, 'Receipt does not exist.', 1;

        IF @ReceiptStatus <> 'DRAFT'
            THROW 51328, 'Only a DRAFT receipt can be cancelled.', 1;

        UPDATE dbo.PHIEU_NHAP
        SET TrangThai = 'CANCELLED',
            NgayXacNhan = NULL
        WHERE MaPN = @MaPN;

        IF @InitialTransactionCount = 0
            COMMIT TRANSACTION;

        SELECT MaPN, TongTien, TrangThai, NgayXacNhan
        FROM dbo.PHIEU_NHAP
        WHERE MaPN = @MaPN;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() = -1
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1 AND @InitialTransactionCount = 0
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1
            ROLLBACK TRANSACTION CancelReceipt;

        THROW;
    END CATCH;
END;
GO
