SET NOCOUNT ON;
SET XACT_ABORT ON;
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
            @MaKK, COALESCE(@NgayKiemKe, SYSDATETIME()), @MaNV, 'DRAFT', @GhiChu
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
            SYSDATETIME(),
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

PRINT 'Stocktake snapshot, count and approval transactions are ready.';
GO
