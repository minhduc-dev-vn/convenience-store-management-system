SET NOCOUNT ON;
SET XACT_ABORT ON;
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
                @MaPN, COALESCE(@NgayNhap, SYSDATETIME()), @MaNV, @MaNCC, 0, 'DRAFT', NULL, @GhiChu
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

DROP PROCEDURE IF EXISTS dbo.usp_CHI_TIET_PHIEU_NHAP_LuuNhap;
GO

CREATE PROCEDURE dbo.usp_CHI_TIET_PHIEU_NHAP_LuuNhap
    @MaPN VARCHAR(15),
    @MaLo VARCHAR(20),
    @MaSP VARCHAR(10),
    @SoLo VARCHAR(50),
    @NgaySanXuat DATE = NULL,
    @HanSuDung DATE = NULL,
    @SoLuong INT,
    @DonGiaNhap DECIMAL(18,2)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @MaPN = NULLIF(LTRIM(RTRIM(@MaPN)), '');
    SET @MaLo = NULLIF(LTRIM(RTRIM(@MaLo)), '');
    SET @MaSP = NULLIF(LTRIM(RTRIM(@MaSP)), '');
    SET @SoLo = NULLIF(LTRIM(RTRIM(@SoLo)), '');

    IF @MaPN IS NULL OR @MaLo IS NULL OR @MaSP IS NULL OR @SoLo IS NULL
        THROW 51308, 'Receipt, lot, product and manufacturer lot codes are required.', 1;

    IF @SoLuong IS NULL OR @SoLuong <= 0
        THROW 51309, 'Receipt detail quantity must be greater than zero.', 1;

    IF @DonGiaNhap IS NULL OR @DonGiaNhap < 0
        THROW 51310, 'Receipt detail unit cost must be greater than or equal to zero.', 1;

    IF @HanSuDung IS NOT NULL AND @NgaySanXuat IS NOT NULL AND @HanSuDung <= @NgaySanXuat
        THROW 51311, 'Lot expiry date must be later than its manufacture date.', 1;

    DECLARE @InitialTransactionCount INT = @@TRANCOUNT;

    BEGIN TRY
        IF @InitialTransactionCount = 0
            BEGIN TRANSACTION;
        ELSE
            SAVE TRANSACTION SaveReceiptDetail;

        DECLARE @ReceiptStatus VARCHAR(20);

        SELECT @ReceiptStatus = TrangThai
        FROM dbo.PHIEU_NHAP WITH (UPDLOCK, HOLDLOCK)
        WHERE MaPN = @MaPN;

        IF @ReceiptStatus IS NULL
            THROW 51312, 'Receipt does not exist.', 1;

        IF @ReceiptStatus <> 'DRAFT'
            THROW 51313, 'Receipt details can only be changed while the receipt is DRAFT.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.SAN_PHAM WHERE MaSP = @MaSP)
            THROW 51314, 'Receipt product does not exist.', 1;

        DECLARE
            @ExistingProductCode VARCHAR(10),
            @ExistingManufacturerLot VARCHAR(50),
            @ExistingManufactureDate DATE,
            @ExistingExpiryDate DATE,
            @ConflictingLotCode VARCHAR(20);

        SELECT
            @ExistingProductCode = MaSP,
            @ExistingManufacturerLot = SoLo,
            @ExistingManufactureDate = NgaySanXuat,
            @ExistingExpiryDate = HanSuDung
        FROM dbo.LO_HANG WITH (UPDLOCK, HOLDLOCK)
        WHERE MaLo = @MaLo;

        IF @ExistingProductCode IS NOT NULL
        BEGIN
            IF @ExistingProductCode <> @MaSP OR @ExistingManufacturerLot <> @SoLo
                THROW 51315, 'The internal lot code belongs to a different product or manufacturer lot.', 1;

            IF ISNULL(@ExistingManufactureDate, CONVERT(DATE, '00010101'))
                   <> ISNULL(@NgaySanXuat, CONVERT(DATE, '00010101'))
               OR ISNULL(@ExistingExpiryDate, CONVERT(DATE, '00010101'))
                   <> ISNULL(@HanSuDung, CONVERT(DATE, '00010101'))
                THROW 51316, 'Lot manufacture/expiry dates conflict with the existing lot.', 1;
        END
        ELSE
        BEGIN
            SELECT @ConflictingLotCode = MaLo
            FROM dbo.LO_HANG WITH (UPDLOCK, HOLDLOCK)
            WHERE MaSP = @MaSP
              AND SoLo = @SoLo;

            IF @ConflictingLotCode IS NOT NULL
                THROW 51317, 'The product/manufacturer lot pair already uses another internal lot code.', 1;

            INSERT INTO dbo.LO_HANG (
                MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
            )
            VALUES (
                @MaLo, @MaSP, @SoLo, @NgaySanXuat, @HanSuDung, @DonGiaNhap, 0, 'ACTIVE'
            );
        END;

        IF EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_PHIEU_NHAP WITH (UPDLOCK, HOLDLOCK)
            WHERE MaPN = @MaPN
              AND MaLo = @MaLo
        )
        BEGIN
            UPDATE dbo.CHI_TIET_PHIEU_NHAP
            SET SoLuong = @SoLuong,
                DonGiaNhap = @DonGiaNhap
            WHERE MaPN = @MaPN
              AND MaLo = @MaLo;
        END
        ELSE
        BEGIN
            INSERT INTO dbo.CHI_TIET_PHIEU_NHAP (MaPN, MaLo, SoLuong, DonGiaNhap)
            VALUES (@MaPN, @MaLo, @SoLuong, @DonGiaNhap);
        END;

        UPDATE dbo.PHIEU_NHAP
        SET TongTien = COALESCE((
            SELECT SUM(detail.ThanhTien)
            FROM dbo.CHI_TIET_PHIEU_NHAP AS detail
            WHERE detail.MaPN = @MaPN
        ), 0)
        WHERE MaPN = @MaPN;

        IF @InitialTransactionCount = 0
            COMMIT TRANSACTION;

        SELECT
            detail.MaCTPN,
            detail.MaPN,
            detail.MaLo,
            lot.MaSP,
            lot.SoLo,
            lot.NgaySanXuat,
            lot.HanSuDung,
            detail.SoLuong,
            detail.DonGiaNhap,
            detail.ThanhTien
        FROM dbo.CHI_TIET_PHIEU_NHAP AS detail
        JOIN dbo.LO_HANG AS lot ON lot.MaLo = detail.MaLo
        WHERE detail.MaPN = @MaPN
          AND detail.MaLo = @MaLo;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() = -1
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1 AND @InitialTransactionCount = 0
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1
            ROLLBACK TRANSACTION SaveReceiptDetail;

        THROW;
    END CATCH;
END;
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
            @ConfirmationTime DATETIME2(0) = SYSDATETIME(),
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

PRINT 'Draft receipt, detail maintenance, cancellation and atomic import confirmation procedures are ready.';
GO
