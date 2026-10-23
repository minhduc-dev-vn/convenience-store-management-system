SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_CHI_TIET_KIEM_KE_GhiNhan;
GO

CREATE PROCEDURE dbo.usp_CHI_TIET_KIEM_KE_GhiNhan
    @MaKK VARCHAR(15),
    @MaLo VARCHAR(20),
    @SoLuongThucTe INT,
    @LyDo NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @MaKK = NULLIF(LTRIM(RTRIM(@MaKK)), '');
    SET @MaLo = NULLIF(LTRIM(RTRIM(@MaLo)), '');
    SET @LyDo = NULLIF(LTRIM(RTRIM(@LyDo)), N'');

    IF @MaKK IS NULL OR @MaLo IS NULL
        THROW 51706, 'Stocktake and lot codes are required.', 1;

    IF @SoLuongThucTe IS NULL OR @SoLuongThucTe < 0
        THROW 51707, 'Actual stock quantity must be greater than or equal to zero.', 1;

    DECLARE @InitialTransactionCount INT = @@TRANCOUNT;

    BEGIN TRY
        IF @InitialTransactionCount = 0
            BEGIN TRANSACTION;
        ELSE
            SAVE TRANSACTION SaveStocktakeCount;

        DECLARE @TrangThai VARCHAR(20);

        SELECT @TrangThai = TrangThai
        FROM dbo.KIEM_KE WITH (UPDLOCK, HOLDLOCK)
        WHERE MaKK = @MaKK;

        IF @TrangThai IS NULL
            THROW 51708, 'Stocktake does not exist.', 1;

        IF @TrangThai <> 'DRAFT'
            THROW 51709, 'Stocktake counts can only be changed while DRAFT.', 1;

        DECLARE @SoLuongHeThong INT;

        SELECT @SoLuongHeThong = SoLuongHeThong
        FROM dbo.CHI_TIET_KIEM_KE WITH (UPDLOCK, HOLDLOCK)
        WHERE MaKK = @MaKK
          AND MaLo = @MaLo;

        IF @SoLuongHeThong IS NULL
            THROW 51710, 'The lot is not part of the stocktake snapshot.', 1;

        IF @SoLuongThucTe <> @SoLuongHeThong AND @LyDo IS NULL
            THROW 51711, 'A discrepancy reason is required when actual stock differs from the snapshot.', 1;

        UPDATE dbo.CHI_TIET_KIEM_KE
        SET SoLuongThucTe = @SoLuongThucTe,
            LyDo = CASE
                WHEN @SoLuongThucTe = @SoLuongHeThong THEN NULL
                ELSE @LyDo
            END
        WHERE MaKK = @MaKK
          AND MaLo = @MaLo;

        IF @InitialTransactionCount = 0
            COMMIT TRANSACTION;

        SELECT *
        FROM dbo.vw_KIEM_KE_CHI_TIET
        WHERE MaKK = @MaKK
          AND MaLo = @MaLo;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() = -1
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1 AND @InitialTransactionCount = 0
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1
            ROLLBACK TRANSACTION SaveStocktakeCount;

        THROW;
    END CATCH;
END;
GO
