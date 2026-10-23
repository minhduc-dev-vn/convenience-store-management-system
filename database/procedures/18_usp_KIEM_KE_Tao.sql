SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_KIEM_KE_Tao;
GO

CREATE PROCEDURE dbo.usp_KIEM_KE_Tao
    @MaKK VARCHAR(15),
    @MaNV VARCHAR(10),
    @NgayKiemKe DATETIME2(0) = NULL,
    @GhiChu NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @MaKK = NULLIF(LTRIM(RTRIM(@MaKK)), '');
    SET @MaNV = NULLIF(LTRIM(RTRIM(@MaNV)), '');
    SET @GhiChu = NULLIF(LTRIM(RTRIM(@GhiChu)), N'');

    IF @MaKK IS NULL
        THROW 51701, 'Stocktake code is required.', 1;

    IF @MaNV IS NULL
       OR NOT EXISTS (
           SELECT 1
           FROM dbo.NHAN_VIEN
           WHERE MaNV = @MaNV
             AND TrangThai = 'ACTIVE'
       )
        THROW 51702, 'An active stocktake employee is required.', 1;

    DECLARE @InitialTransactionCount INT = @@TRANCOUNT;

    BEGIN TRY
        IF @InitialTransactionCount = 0
            BEGIN TRANSACTION;
        ELSE
            SAVE TRANSACTION CreateStocktake;

        IF EXISTS (
            SELECT 1
            FROM dbo.KIEM_KE WITH (UPDLOCK, HOLDLOCK)
            WHERE MaKK = @MaKK
        )
            THROW 51703, 'Stocktake code already exists.', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.KIEM_KE WITH (UPDLOCK, HOLDLOCK)
            WHERE TrangThai = 'DRAFT'
        )
            THROW 51704, 'Another DRAFT stocktake is already in progress.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.LO_HANG)
            THROW 51705, 'Stocktake cannot start without inventory lots.', 1;

        INSERT INTO dbo.KIEM_KE (
            MaKK, NgayKiemKe, MaNV, TrangThai, GhiChu
        )
        VALUES (
            @MaKK, COALESCE(@NgayKiemKe, SYSUTCDATETIME()), @MaNV, 'DRAFT', @GhiChu
        );

        INSERT INTO dbo.CHI_TIET_KIEM_KE (
            MaKK, MaLo, SoLuongHeThong, SoLuongThucTe, LyDo
        )
        SELECT
            @MaKK,
            lot.MaLo,
            lot.SoLuongTon,
            lot.SoLuongTon,
            NULL
        FROM dbo.LO_HANG AS lot WITH (UPDLOCK, HOLDLOCK);

        IF @InitialTransactionCount = 0
            COMMIT TRANSACTION;

        SELECT MaKK, NgayKiemKe, MaNV, TrangThai, GhiChu
        FROM dbo.KIEM_KE
        WHERE MaKK = @MaKK;

        SELECT *
        FROM dbo.vw_KIEM_KE_CHI_TIET
        WHERE MaKK = @MaKK
        ORDER BY MaSP, MaLo;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() = -1
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1 AND @InitialTransactionCount = 0
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1
            ROLLBACK TRANSACTION CreateStocktake;

        THROW;
    END CATCH;
END;
GO
