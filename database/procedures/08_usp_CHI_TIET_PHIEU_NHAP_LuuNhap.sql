SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
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
