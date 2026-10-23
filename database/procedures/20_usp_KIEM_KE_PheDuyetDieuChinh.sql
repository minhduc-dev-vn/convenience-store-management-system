SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_KIEM_KE_PheDuyetDieuChinh;
GO

CREATE PROCEDURE dbo.usp_KIEM_KE_PheDuyetDieuChinh
    @MaKK VARCHAR(15),
    @MaNV VARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @MaKK = NULLIF(LTRIM(RTRIM(@MaKK)), '');
    SET @MaNV = NULLIF(LTRIM(RTRIM(@MaNV)), '');

    IF @MaKK IS NULL
        THROW 51712, 'Stocktake code is required.', 1;

    IF @MaNV IS NULL
       OR NOT EXISTS (
           SELECT 1
           FROM dbo.NHAN_VIEN
           WHERE MaNV = @MaNV
             AND TrangThai = 'ACTIVE'
       )
        THROW 51713, 'An active approving employee is required.', 1;

    DECLARE @InitialTransactionCount INT = @@TRANCOUNT;

    BEGIN TRY
        IF @InitialTransactionCount = 0
            BEGIN TRANSACTION;
        ELSE
            SAVE TRANSACTION ApproveStocktake;

        DECLARE @TrangThai VARCHAR(20);

        SELECT @TrangThai = TrangThai
        FROM dbo.KIEM_KE WITH (UPDLOCK, HOLDLOCK)
        WHERE MaKK = @MaKK;

        IF @TrangThai IS NULL
            THROW 51714, 'Stocktake does not exist.', 1;

        IF @TrangThai <> 'DRAFT'
            THROW 51715, 'Only a DRAFT stocktake can be approved.', 1;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_KIEM_KE
            WHERE MaKK = @MaKK
        )
            THROW 51716, 'Stocktake has no snapshot details.', 1;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_KIEM_KE
            WHERE MaKK = @MaKK
              AND ChenhLech <> 0
        )
            THROW 51717, 'Stocktake has no discrepancy to approve.', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_KIEM_KE
            WHERE MaKK = @MaKK
              AND ChenhLech <> 0
              AND NULLIF(LTRIM(RTRIM(LyDo)), N'') IS NULL
        )
            THROW 51718, 'Every stocktake discrepancy requires a reason.', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_KIEM_KE AS detail
            JOIN dbo.LO_HANG AS lot WITH (UPDLOCK, HOLDLOCK)
                ON lot.MaLo = detail.MaLo
            WHERE detail.MaKK = @MaKK
              AND lot.SoLuongTon <> detail.SoLuongHeThong
        )
            THROW 51719, 'Inventory changed after the stocktake snapshot; approval was rejected.', 1;

        UPDATE lot
        SET SoLuongTon = detail.SoLuongThucTe
        FROM dbo.LO_HANG AS lot
        JOIN dbo.CHI_TIET_KIEM_KE AS detail
            ON detail.MaLo = lot.MaLo
        WHERE detail.MaKK = @MaKK
          AND detail.ChenhLech <> 0;

        INSERT INTO dbo.GIAO_DICH_KHO (
            MaSP, MaLo, LoaiGiaoDich, SoLuongBienDong,
            ThoiGian, MaThamChieu, MaNV, GhiChu
        )
        SELECT
            lot.MaSP,
            detail.MaLo,
            'ADJUSTMENT',
            detail.ChenhLech,
            SYSUTCDATETIME(),
            @MaKK,
            @MaNV,
            LEFT(CONCAT(N'Điều chỉnh kiểm kê: ', detail.LyDo), 255)
        FROM dbo.CHI_TIET_KIEM_KE AS detail
        JOIN dbo.LO_HANG AS lot
            ON lot.MaLo = detail.MaLo
        WHERE detail.MaKK = @MaKK
          AND detail.ChenhLech <> 0;

        UPDATE dbo.KIEM_KE
        SET TrangThai = 'APPROVED'
        WHERE MaKK = @MaKK;

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
            ROLLBACK TRANSACTION ApproveStocktake;

        THROW;
    END CATCH;
END;
GO
