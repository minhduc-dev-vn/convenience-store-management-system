SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_CHI_TIET_PHIEU_NHAP_Xoa;
GO

CREATE PROCEDURE dbo.usp_CHI_TIET_PHIEU_NHAP_Xoa
    @MaPN VARCHAR(15),
    @MaCTPN BIGINT
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
            SAVE TRANSACTION DeleteReceiptDetail;

        DECLARE @ReceiptStatus VARCHAR(20);

        SELECT @ReceiptStatus = TrangThai
        FROM dbo.PHIEU_NHAP WITH (UPDLOCK, HOLDLOCK)
        WHERE MaPN = @MaPN;

        IF @ReceiptStatus IS NULL
            THROW 51322, 'Receipt does not exist.', 1;

        IF @ReceiptStatus <> 'DRAFT'
            THROW 51323, 'Receipt details can only be deleted while the receipt is DRAFT.', 1;

        DELETE FROM dbo.CHI_TIET_PHIEU_NHAP
        WHERE MaPN = @MaPN
          AND MaCTPN = @MaCTPN;

        IF @@ROWCOUNT = 0
            THROW 51324, 'Receipt detail does not exist.', 1;

        UPDATE dbo.PHIEU_NHAP
        SET TongTien = COALESCE((
            SELECT SUM(detail.ThanhTien)
            FROM dbo.CHI_TIET_PHIEU_NHAP AS detail
            WHERE detail.MaPN = @MaPN
        ), 0)
        WHERE MaPN = @MaPN;

        IF @InitialTransactionCount = 0
            COMMIT TRANSACTION;

        SELECT MaPN, TongTien, TrangThai
        FROM dbo.PHIEU_NHAP
        WHERE MaPN = @MaPN;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() = -1
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1 AND @InitialTransactionCount = 0
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1
            ROLLBACK TRANSACTION DeleteReceiptDetail;

        THROW;
    END CATCH;
END;
GO
