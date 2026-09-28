:ON ERROR EXIT

SET NOCOUNT ON;
SET XACT_ABORT OFF;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO

DECLARE @RequiredObjects TABLE (ObjectName SYSNAME, ObjectType CHAR(2));

INSERT INTO @RequiredObjects (ObjectName, ObjectType)
VALUES
    ('vw_PHIEU_NHAP_CHI_TIET', 'V'),
    ('vw_LO_HANG_THEO_DOI', 'V'),
    ('usp_PHIEU_NHAP_LuuNhap', 'P'),
    ('usp_CHI_TIET_PHIEU_NHAP_LuuNhap', 'P'),
    ('usp_CHI_TIET_PHIEU_NHAP_Xoa', 'P'),
    ('usp_PHIEU_NHAP_Huy', 'P'),
    ('usp_PHIEU_NHAP_XacNhan', 'P');

IF EXISTS (
    SELECT 1
    FROM @RequiredObjects AS required
    WHERE OBJECT_ID(N'dbo.' + required.ObjectName, required.ObjectType) IS NULL
)
    THROW 52300, 'One or more C22 receiving objects are missing.', 1;

IF (
    SELECT COUNT(*)
    FROM sys.tables
    WHERE schema_id = SCHEMA_ID('dbo')
) <> 23
    THROW 52301, 'C22 must preserve exactly 23 dbo core tables.', 1;
GO

BEGIN TRY
    EXEC dbo.usp_PHIEU_NHAP_LuuNhap
        @MaPN = 'PNC22001',
        @MaNV = 'NVDEV001',
        @MaNCC = 'NCCDEV001',
        @NgayNhap = '2026-09-28T09:00:00',
        @GhiChu = N'Phiếu kiểm thử C22';

    EXEC dbo.usp_CHI_TIET_PHIEU_NHAP_LuuNhap
        @MaPN = 'PNC22001',
        @MaLo = 'LOC22001',
        @MaSP = 'SPDEV001',
        @SoLo = 'C22-SUCCESS-001',
        @NgaySanXuat = '2026-09-01',
        @HanSuDung = '2027-09-01',
        @SoLuong = 2,
        @DonGiaNhap = 6500;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.PHIEU_NHAP
        WHERE MaPN = 'PNC22001'
          AND TrangThai = 'DRAFT'
          AND TongTien = 13000
    )
        THROW 52302, 'Draft receipt total was not calculated from its details.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.LO_HANG
        WHERE MaLo = 'LOC22001'
          AND SoLuongTon = 0
    )
        THROW 52303, 'Saving a draft detail changed inventory before confirmation.', 1;

    EXEC dbo.usp_CHI_TIET_PHIEU_NHAP_LuuNhap
        @MaPN = 'PNC22001',
        @MaLo = 'LOC22001',
        @MaSP = 'SPDEV001',
        @SoLo = 'C22-SUCCESS-001',
        @NgaySanXuat = '2026-09-01',
        @HanSuDung = '2027-09-01',
        @SoLuong = 3,
        @DonGiaNhap = 7000;

    EXEC dbo.usp_CHI_TIET_PHIEU_NHAP_LuuNhap
        @MaPN = 'PNC22001',
        @MaLo = 'LOC22002',
        @MaSP = 'SPDEV001',
        @SoLo = 'C22-DELETE-001',
        @NgaySanXuat = '2026-09-02',
        @HanSuDung = '2027-09-02',
        @SoLuong = 1,
        @DonGiaNhap = 5000;

    DECLARE @DeletedDetailCode BIGINT = (
        SELECT MaCTPN
        FROM dbo.CHI_TIET_PHIEU_NHAP
        WHERE MaPN = 'PNC22001'
          AND MaLo = 'LOC22002'
    );

    EXEC dbo.usp_CHI_TIET_PHIEU_NHAP_Xoa
        @MaPN = 'PNC22001',
        @MaCTPN = @DeletedDetailCode;

    IF (SELECT COUNT(*) FROM dbo.CHI_TIET_PHIEU_NHAP WHERE MaPN = 'PNC22001') <> 1
       OR NOT EXISTS (
           SELECT 1
           FROM dbo.PHIEU_NHAP
           WHERE MaPN = 'PNC22001'
             AND TongTien = 21000
       )
        THROW 52304, 'Draft detail update/delete did not keep the receipt total consistent.', 1;

    DECLARE @InvalidQuantityRejected BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_CHI_TIET_PHIEU_NHAP_LuuNhap
            @MaPN = 'PNC22001',
            @MaLo = 'LOC22003',
            @MaSP = 'SPDEV001',
            @SoLo = 'C22-INVALID-QTY',
            @SoLuong = 0,
            @DonGiaNhap = 5000;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51309
            SET @InvalidQuantityRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @InvalidQuantityRejected = 0
        THROW 52305, 'Draft detail accepted a non-positive quantity.', 1;

    DECLARE @InvalidCostRejected BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_CHI_TIET_PHIEU_NHAP_LuuNhap
            @MaPN = 'PNC22001',
            @MaLo = 'LOC22003',
            @MaSP = 'SPDEV001',
            @SoLo = 'C22-INVALID-COST',
            @SoLuong = 1,
            @DonGiaNhap = -1;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51310
            SET @InvalidCostRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @InvalidCostRejected = 0
        THROW 52306, 'Draft detail accepted a negative unit cost.', 1;

    DECLARE @InvalidExpiryRejected BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_CHI_TIET_PHIEU_NHAP_LuuNhap
            @MaPN = 'PNC22001',
            @MaLo = 'LOC22003',
            @MaSP = 'SPDEV001',
            @SoLo = 'C22-INVALID-DATE',
            @NgaySanXuat = '2027-01-02',
            @HanSuDung = '2027-01-01',
            @SoLuong = 1,
            @DonGiaNhap = 5000;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51311
            SET @InvalidExpiryRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @InvalidExpiryRejected = 0
        THROW 52307, 'Draft detail accepted an invalid expiry/manufacture date relation.', 1;

    DECLARE @DuplicateLotRejected BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_CHI_TIET_PHIEU_NHAP_LuuNhap
            @MaPN = 'PNC22001',
            @MaLo = 'LOC22099',
            @MaSP = 'SPDEV001',
            @SoLo = 'C22-SUCCESS-001',
            @NgaySanXuat = '2026-09-01',
            @HanSuDung = '2027-09-01',
            @SoLuong = 1,
            @DonGiaNhap = 7000;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51317
            SET @DuplicateLotRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @DuplicateLotRejected = 0
        THROW 52308, 'Draft detail accepted a duplicate product/manufacturer lot pair.', 1;

    EXEC dbo.usp_PHIEU_NHAP_XacNhan @MaPN = 'PNC22001';

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.PHIEU_NHAP
        WHERE MaPN = 'PNC22001'
          AND TrangThai = 'CONFIRMED'
          AND NgayXacNhan IS NOT NULL
          AND TongTien = 21000
    )
        THROW 52309, 'Successful confirmation did not finalize the receipt.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.LO_HANG
        WHERE MaLo = 'LOC22001'
          AND SoLuongTon = 3
          AND GiaNhap = 7000
    )
        THROW 52310, 'Successful confirmation did not update lot inventory/cost.', 1;

    IF (
        SELECT COUNT(*)
        FROM dbo.GIAO_DICH_KHO
        WHERE MaThamChieu = 'PNC22001'
          AND MaLo = 'LOC22001'
          AND LoaiGiaoDich = 'IMPORT'
          AND SoLuongBienDong = 3
    ) <> 1
        THROW 52311, 'Successful confirmation did not append exactly one IMPORT transaction.', 1;

    DECLARE @DuplicateConfirmationRejected BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_PHIEU_NHAP_XacNhan @MaPN = 'PNC22001';
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51332
            SET @DuplicateConfirmationRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @DuplicateConfirmationRejected = 0
        THROW 52312, 'A receipt was confirmed more than once.', 1;

    DECLARE @ConfirmedDetailEditRejected BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_CHI_TIET_PHIEU_NHAP_LuuNhap
            @MaPN = 'PNC22001',
            @MaLo = 'LOC22001',
            @MaSP = 'SPDEV001',
            @SoLo = 'C22-SUCCESS-001',
            @NgaySanXuat = '2026-09-01',
            @HanSuDung = '2027-09-01',
            @SoLuong = 4,
            @DonGiaNhap = 7000;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51313
            SET @ConfirmedDetailEditRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @ConfirmedDetailEditRejected = 0
        THROW 52313, 'A confirmed receipt detail was modified.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.vw_PHIEU_NHAP_CHI_TIET
        WHERE MaPN = 'PNC22001'
          AND MaLo = 'LOC22001'
          AND SoLuong = 3
    )
        THROW 52314, 'Receiving detail view did not expose the confirmed receipt line.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.vw_LO_HANG_THEO_DOI
        WHERE MaLo = 'LOC22001'
          AND DaHetHan = 0
          AND SoLuongTon = 3
    )
        THROW 52315, 'Lot/expiry tracking view did not expose the imported lot.', 1;

    DELETE FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'PNC22001';
    DELETE FROM dbo.CHI_TIET_PHIEU_NHAP WHERE MaPN = 'PNC22001';
    DELETE FROM dbo.PHIEU_NHAP WHERE MaPN = 'PNC22001';
    DELETE FROM dbo.LO_HANG WHERE MaLo IN ('LOC22001', 'LOC22002');
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

IF EXISTS (SELECT 1 FROM dbo.PHIEU_NHAP WHERE MaPN = 'PNC22001')
   OR EXISTS (SELECT 1 FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'PNC22001')
    THROW 52316, 'C22 success-test data was not rolled back completely.', 1;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    EXEC dbo.usp_PHIEU_NHAP_LuuNhap
        @MaPN = 'PNC22003',
        @MaNV = 'NVDEV001',
        @MaNCC = 'NCCDEV001',
        @NgayNhap = '2026-09-28T09:30:00';

    EXEC dbo.usp_CHI_TIET_PHIEU_NHAP_LuuNhap
        @MaPN = 'PNC22003',
        @MaLo = 'LODEV001',
        @MaSP = 'SPDEV001',
        @SoLo = 'DEV-LOT-001',
        @NgaySanXuat = '2026-01-01',
        @HanSuDung = '2099-12-31',
        @SoLuong = 4,
        @DonGiaNhap = 5100;

    EXEC dbo.usp_PHIEU_NHAP_XacNhan @MaPN = 'PNC22003';

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.LO_HANG
        WHERE MaLo = 'LODEV001'
          AND SoLuongTon = 4
          AND GiaNhap = 5100
    )
        THROW 52323, 'Confirmation did not increase an existing matching lot.', 1;

    ROLLBACK TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

IF EXISTS (SELECT 1 FROM dbo.PHIEU_NHAP WHERE MaPN = 'PNC22003')
   OR EXISTS (SELECT 1 FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'PNC22003')
   OR NOT EXISTS (
       SELECT 1
       FROM dbo.LO_HANG
       WHERE MaLo = 'LODEV001'
         AND SoLuongTon = 0
         AND GiaNhap = 5000
   )
    THROW 52324, 'Existing-lot confirmation test was not rolled back completely.', 1;
GO

EXEC dbo.usp_PHIEU_NHAP_LuuNhap
    @MaPN = 'PNC22004',
    @MaNV = 'NVDEV001',
    @MaNCC = 'NCCDEV001',
    @NgayNhap = '2026-09-28T09:45:00';

EXEC dbo.usp_CHI_TIET_PHIEU_NHAP_LuuNhap
    @MaPN = 'PNC22004',
    @MaLo = 'LOC22005',
    @MaSP = 'SPDEV001',
    @SoLo = 'C22-CANCEL-001',
    @NgaySanXuat = '2026-09-01',
    @HanSuDung = '2027-09-01',
    @SoLuong = 2,
    @DonGiaNhap = 6000;

EXEC dbo.usp_PHIEU_NHAP_Huy @MaPN = 'PNC22004';
GO

IF NOT EXISTS (
    SELECT 1
    FROM dbo.PHIEU_NHAP
    WHERE MaPN = 'PNC22004'
      AND TrangThai = 'CANCELLED'
      AND NgayXacNhan IS NULL
)
   OR NOT EXISTS (
       SELECT 1
       FROM dbo.LO_HANG
       WHERE MaLo = 'LOC22005'
         AND SoLuongTon = 0
   )
    THROW 52325, 'Cancelling a draft receipt did not preserve zero inventory.', 1;
GO

DECLARE @CancelledConfirmationRejected BIT = 0;

BEGIN TRY
    EXEC dbo.usp_PHIEU_NHAP_XacNhan @MaPN = 'PNC22004';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 51333
        SET @CancelledConfirmationRejected = 1;
    ELSE
        THROW;
END CATCH;

IF @CancelledConfirmationRejected = 0
    THROW 52326, 'A cancelled receipt was accepted for confirmation.', 1;
GO

DELETE FROM dbo.CHI_TIET_PHIEU_NHAP WHERE MaPN = 'PNC22004';
DELETE FROM dbo.PHIEU_NHAP WHERE MaPN = 'PNC22004';
DELETE FROM dbo.LO_HANG WHERE MaLo = 'LOC22005';
GO

EXEC dbo.usp_PHIEU_NHAP_LuuNhap
    @MaPN = 'PNC22002',
    @MaNV = 'NVDEV001',
    @MaNCC = 'NCCDEV001',
    @NgayNhap = '2026-09-28T10:00:00',
    @GhiChu = N'Phiếu kiểm thử rollback C22';

EXEC dbo.usp_CHI_TIET_PHIEU_NHAP_LuuNhap
    @MaPN = 'PNC22002',
    @MaLo = 'LOC22004',
    @MaSP = 'SPDEV001',
    @SoLo = 'C22-ROLLBACK-001',
    @NgaySanXuat = '2026-09-01',
    @HanSuDung = '2027-09-01',
    @SoLuong = 5,
    @DonGiaNhap = 8000;
GO

DROP TRIGGER IF EXISTS dbo.trg_C22_ForceImportFailure;
GO

CREATE TRIGGER dbo.trg_C22_ForceImportFailure
ON dbo.GIAO_DICH_KHO
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted
        WHERE LoaiGiaoDich = 'IMPORT'
          AND MaThamChieu = 'PNC22002'
    )
        THROW 52390, 'Forced C22 import failure for rollback verification.', 1;
END;
GO

CREATE TABLE #C22ForcedFailure (ErrorNumber INT NOT NULL);
GO

BEGIN TRY
    EXEC dbo.usp_PHIEU_NHAP_XacNhan @MaPN = 'PNC22002';
END TRY
BEGIN CATCH
    INSERT INTO #C22ForcedFailure (ErrorNumber) VALUES (ERROR_NUMBER());
END CATCH;
GO

DROP TRIGGER IF EXISTS dbo.trg_C22_ForceImportFailure;
GO

IF NOT EXISTS (SELECT 1 FROM #C22ForcedFailure WHERE ErrorNumber = 52390)
    THROW 52317, 'Forced import failure did not reach the expected transaction step.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.PHIEU_NHAP
    WHERE MaPN = 'PNC22002'
      AND TrangThai = 'DRAFT'
      AND NgayXacNhan IS NULL
      AND TongTien = 40000
)
    THROW 52318, 'Forced failure did not roll back the receipt status/confirmation time.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.LO_HANG
    WHERE MaLo = 'LOC22004'
      AND SoLuongTon = 0
)
    THROW 52319, 'Forced failure did not roll back the lot inventory update.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.GIAO_DICH_KHO
    WHERE MaThamChieu = 'PNC22002'
      AND LoaiGiaoDich = 'IMPORT'
)
    THROW 52320, 'Forced failure left a partial IMPORT stock transaction.', 1;
GO

DELETE FROM dbo.CHI_TIET_PHIEU_NHAP WHERE MaPN = 'PNC22002';
DELETE FROM dbo.PHIEU_NHAP WHERE MaPN = 'PNC22002';
DELETE FROM dbo.LO_HANG WHERE MaLo = 'LOC22004';
DROP TABLE #C22ForcedFailure;
GO

IF EXISTS (SELECT 1 FROM dbo.PHIEU_NHAP WHERE MaPN LIKE 'PNC22%')
   OR EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo LIKE 'LOC22%')
   OR EXISTS (SELECT 1 FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu LIKE 'PNC22%')
   OR OBJECT_ID('dbo.trg_C22_ForceImportFailure', 'TR') IS NOT NULL
    THROW 52321, 'C22 transaction test data or test trigger was not cleaned up.', 1;
GO

DECLARE @ExpectedIndexes TABLE (TableName SYSNAME, IndexName SYSNAME, IsUnique BIT);

INSERT INTO @ExpectedIndexes (TableName, IndexName, IsUnique)
VALUES
    ('PHIEU_NHAP', 'IX_PHIEU_NHAP_TrangThai_NgayNhap', 0),
    ('CHI_TIET_PHIEU_NHAP', 'IX_CHI_TIET_PHIEU_NHAP_MaLo', 0),
    ('LO_HANG', 'IX_LO_HANG_HanSuDung_TrangThai', 0),
    ('GIAO_DICH_KHO', 'UX_GIAO_DICH_KHO_IMPORT_MaThamChieu_MaLo', 1);

IF EXISTS (
    SELECT 1
    FROM @ExpectedIndexes AS expected
    WHERE NOT EXISTS (
        SELECT 1
        FROM sys.indexes AS actual
        WHERE actual.object_id = OBJECT_ID(N'dbo.' + expected.TableName)
          AND actual.name = expected.IndexName
          AND actual.is_unique = expected.IsUnique
          AND actual.is_disabled = 0
    )
)
    THROW 52322, 'A required enabled C22 index is missing or invalid.', 1;
GO

PRINT 'C22 receiving tests passed: draft add/update/delete, validation, atomic confirm, duplicate rejection, forced rollback, views, indexes and cleanup.';
GO
