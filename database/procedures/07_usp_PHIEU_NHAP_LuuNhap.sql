SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_PHIEU_NHAP_LuuNhap;
GO

CREATE PROCEDURE dbo.usp_PHIEU_NHAP_LuuNhap
    @MaPN VARCHAR(15),
    @MaNV VARCHAR(10),
    @MaNCC VARCHAR(10),
    @NgayNhap DATETIME2(0) = NULL,
    @GhiChu NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @MaPN = NULLIF(LTRIM(RTRIM(@MaPN)), '');
    SET @MaNV = NULLIF(LTRIM(RTRIM(@MaNV)), '');
    SET @MaNCC = NULLIF(LTRIM(RTRIM(@MaNCC)), '');
    SET @GhiChu = NULLIF(LTRIM(RTRIM(@GhiChu)), N'');

    IF @MaPN IS NULL
        THROW 51301, 'Receipt code is required.', 1;

    IF @MaNV IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.NHAN_VIEN WHERE MaNV = @MaNV)
        THROW 51302, 'Receipt employee does not exist.', 1;

    IF @MaNCC IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.NHA_CUNG_CAP WHERE MaNCC = @MaNCC)
        THROW 51303, 'Receipt supplier does not exist.', 1;

    DECLARE @InitialTransactionCount INT = @@TRANCOUNT;

    BEGIN TRY
        IF @InitialTransactionCount = 0
            BEGIN TRANSACTION;
        ELSE
            SAVE TRANSACTION SaveReceiptDraft;

        DECLARE @CurrentStatus VARCHAR(20);

        SELECT @CurrentStatus = TrangThai
        FROM dbo.PHIEU_NHAP WITH (UPDLOCK, HOLDLOCK)
        WHERE MaPN = @MaPN;

        IF @CurrentStatus IS NULL
        BEGIN
            INSERT INTO dbo.PHIEU_NHAP (
                MaPN, NgayNhap, MaNV, MaNCC, TongTien, TrangThai, NgayXacNhan, GhiChu
            )
            VALUES (
                @MaPN, COALESCE(@NgayNhap, SYSUTCDATETIME()), @MaNV, @MaNCC, 0, 'DRAFT', NULL, @GhiChu
            );
        END
        ELSE
        BEGIN
            IF @CurrentStatus <> 'DRAFT'
                THROW 51304, 'Only a DRAFT receipt can be updated.', 1;

            UPDATE dbo.PHIEU_NHAP
            SET NgayNhap = COALESCE(@NgayNhap, NgayNhap),
                MaNV = @MaNV,
                MaNCC = @MaNCC,
                GhiChu = @GhiChu
            WHERE MaPN = @MaPN;
        END;

        IF @InitialTransactionCount = 0
            COMMIT TRANSACTION;

        SELECT
            MaPN, NgayNhap, MaNV, MaNCC, TongTien, TrangThai, NgayXacNhan, GhiChu
        FROM dbo.PHIEU_NHAP
        WHERE MaPN = @MaPN;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() = -1
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1 AND @InitialTransactionCount = 0
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1
            ROLLBACK TRANSACTION SaveReceiptDraft;

        THROW;
    END CATCH;
END;
GO
