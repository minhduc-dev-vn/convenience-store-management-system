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
    ('vw_TON_KHO_SAN_PHAM', 'V'),
    ('vw_TON_KHO_THEO_LO', 'V'),
    ('usp_TON_KHO_SAN_PHAM_TraCuu', 'P'),
    ('usp_LO_HANG_TraCuu', 'P');

IF EXISTS (
    SELECT 1
    FROM @RequiredObjects AS required
    WHERE OBJECT_ID(N'dbo.' + required.ObjectName, required.ObjectType) IS NULL
)
    THROW 52400, 'One or more C25 inventory query objects are missing.', 1;

IF (
    SELECT COUNT(*) FROM sys.tables
    WHERE schema_id = SCHEMA_ID('dbo') AND name <> 'SCHEMA_MIGRATIONS'
) <> 23
    THROW 52401, 'C25 must preserve exactly 23 dbo core tables.', 1;
GO

DECLARE @SeedInventory TABLE (
    MaSP VARCHAR(10), TenSP NVARCHAR(150), DonViTinh NVARCHAR(20),
    MucTonToiThieu INT, MaLoai VARCHAR(10), TenLoai NVARCHAR(100),
    TrangThaiSanPham VARCHAR(20), TongTon BIGINT, TongTonKhaDung BIGINT,
    TongTonCanHan BIGINT, TongTonHetHan BIGINT, TongTonBiKhoa BIGINT,
    SoLoConTon BIGINT, SoLoCanHan BIGINT, SoLoHetHan BIGINT,
    CanhBaoTonThap BIT, TongSoBanGhi BIGINT
);

INSERT INTO @SeedInventory
EXEC dbo.usp_TON_KHO_SAN_PHAM_TraCuu
    @TuKhoa = N'SPDEV001',
    @NgayThamChieu = '2026-09-29',
    @NguongCanHanNgay = 30;

IF (SELECT COUNT(*) FROM @SeedInventory) <> 1
   OR NOT EXISTS (
       SELECT 1
       FROM @SeedInventory
       WHERE MaSP = 'SPDEV001'
         AND TongTon = 0
         AND TongTonKhaDung = 0
         AND SoLoConTon = 0
         AND SoLoCanHan = 0
         AND SoLoHetHan = 0
         AND CanhBaoTonThap = 0
   )
    THROW 52418, 'Baseline seed inventory or alert classification is incorrect.', 1;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, MoTa, TrangThai)
    VALUES ('C25CAT01', N'Danh mục C25', N'Dữ liệu kiểm thử truy vấn tồn kho.', 'ACTIVE');

    INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, MaVach, DonViTinh, GiaBan, MucTonToiThieu, MaLoai, TrangThai
    )
    VALUES
        ('C25SAFE01', N'C25 sản phẩm đủ tồn', 'C25-BAR-001', N'Chai', 12000, 5, 'C25CAT01', 'ACTIVE'),
        ('C25LOW001', N'C25 sản phẩm tồn thấp', 'C25-BAR-002', N'Hộp', 18000, 10, 'C25CAT01', 'ACTIVE'),
        ('C25EXP001', N'C25 sản phẩm chỉ còn hàng hết hạn', 'C25-BAR-003', N'Gói', 9000, 1, 'C25CAT01', 'ACTIVE'),
        ('C25ZERO01', N'C25 sản phẩm ngưỡng không', 'C25-BAR-004', N'Cái', 7000, 0, 'C25CAT01', 'ACTIVE');

    INSERT INTO dbo.LO_HANG (
        MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
    )
    VALUES
        ('C25L001', 'C25SAFE01', 'C25-EXPIRED-DATE', '2026-01-01', '2026-09-29', 5000, 2, 'ACTIVE'),
        ('C25L002', 'C25SAFE01', 'C25-NEAR', '2026-01-01', '2026-10-10', 5000, 1, 'ACTIVE'),
        ('C25L003', 'C25SAFE01', 'C25-VALID', '2026-01-01', '2026-12-31', 5000, 4, 'ACTIVE'),
        ('C25L004', 'C25SAFE01', 'C25-BLOCKED', '2026-01-01', '2026-12-31', 5000, 3, 'BLOCKED'),
        ('C25L005', 'C25SAFE01', 'C25-NO-EXPIRY', NULL, NULL, 5000, 2, 'ACTIVE'),
        ('C25L006', 'C25LOW001', 'C25-LOW', '2026-01-01', '2026-12-31', 8000, 5, 'ACTIVE'),
        ('C25L007', 'C25EXP001', 'C25-EXPIRED-STATUS', '2026-01-01', '2026-12-31', 4000, 4, 'EXPIRED');

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.vw_TON_KHO_SAN_PHAM
        WHERE MaSP = 'C25SAFE01'
          AND TongTon = 12
          AND SoLoConTon = 5
    )
        THROW 52402, 'Product inventory view does not equal the sum of its lot quantities.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.vw_TON_KHO_THEO_LO
        WHERE MaLo = 'C25L004'
          AND MaSP = 'C25SAFE01'
          AND SoLuongTon = 3
          AND TrangThaiLo = 'BLOCKED'
    )
        THROW 52403, 'Lot inventory view did not preserve the real lot fields.', 1;

    DECLARE @InventoryAll TABLE (
        MaSP VARCHAR(10), TenSP NVARCHAR(150), DonViTinh NVARCHAR(20),
        MucTonToiThieu INT, MaLoai VARCHAR(10), TenLoai NVARCHAR(100),
        TrangThaiSanPham VARCHAR(20), TongTon BIGINT, TongTonKhaDung BIGINT,
        TongTonCanHan BIGINT, TongTonHetHan BIGINT, TongTonBiKhoa BIGINT,
        SoLoConTon BIGINT, SoLoCanHan BIGINT, SoLoHetHan BIGINT,
        CanhBaoTonThap BIT, TongSoBanGhi BIGINT
    );

    INSERT INTO @InventoryAll
    EXEC dbo.usp_TON_KHO_SAN_PHAM_TraCuu
        @MaLoai = 'C25CAT01',
        @NgayThamChieu = '2026-09-29',
        @NguongCanHanNgay = 30,
        @SoTrang = 1,
        @KichThuocTrang = 10;

    IF (SELECT COUNT(*) FROM @InventoryAll) <> 4
       OR EXISTS (SELECT 1 FROM @InventoryAll WHERE TongSoBanGhi <> 4)
        THROW 52404, 'Inventory category query returned incorrect records or total count.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM @InventoryAll
        WHERE MaSP = 'C25SAFE01'
          AND TongTon = 12
          AND TongTonKhaDung = 7
          AND TongTonCanHan = 1
          AND TongTonHetHan = 2
          AND TongTonBiKhoa = 3
          AND SoLoConTon = 5
          AND SoLoCanHan = 1
          AND SoLoHetHan = 1
          AND CanhBaoTonThap = 0
    )
        THROW 52405, 'Inventory summary did not separate available, near-expiry, expired and blocked stock.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM @InventoryAll
        WHERE MaSP = 'C25LOW001'
          AND TongTon = 5
          AND TongTonKhaDung = 5
          AND MucTonToiThieu = 10
          AND CanhBaoTonThap = 1
    )
       OR NOT EXISTS (
           SELECT 1
           FROM @InventoryAll
           WHERE MaSP = 'C25EXP001'
             AND TongTon = 4
             AND TongTonKhaDung = 0
             AND TongTonHetHan = 4
             AND CanhBaoTonThap = 1
       )
       OR NOT EXISTS (
           SELECT 1
           FROM @InventoryAll
           WHERE MaSP = 'C25ZERO01'
             AND TongTon = 0
             AND MucTonToiThieu = 0
             AND CanhBaoTonThap = 0
       )
        THROW 52406, 'Low-stock warning does not compare effective stock with MucTonToiThieu.', 1;

    DECLARE @LowStock TABLE (
        MaSP VARCHAR(10), TenSP NVARCHAR(150), DonViTinh NVARCHAR(20),
        MucTonToiThieu INT, MaLoai VARCHAR(10), TenLoai NVARCHAR(100),
        TrangThaiSanPham VARCHAR(20), TongTon BIGINT, TongTonKhaDung BIGINT,
        TongTonCanHan BIGINT, TongTonHetHan BIGINT, TongTonBiKhoa BIGINT,
        SoLoConTon BIGINT, SoLoCanHan BIGINT, SoLoHetHan BIGINT,
        CanhBaoTonThap BIT, TongSoBanGhi BIGINT
    );

    INSERT INTO @LowStock
    EXEC dbo.usp_TON_KHO_SAN_PHAM_TraCuu
        @MaLoai = 'C25CAT01', @CheDo = 'LOW_STOCK',
        @NgayThamChieu = '2026-09-29', @NguongCanHanNgay = 30;

    IF (SELECT COUNT(*) FROM @LowStock) <> 2
       OR NOT EXISTS (SELECT 1 FROM @LowStock WHERE MaSP = 'C25LOW001')
       OR NOT EXISTS (SELECT 1 FROM @LowStock WHERE MaSP = 'C25EXP001')
       OR EXISTS (SELECT 1 FROM @LowStock WHERE MaSP IN ('C25SAFE01', 'C25ZERO01'))
        THROW 52407, 'LOW_STOCK mode returned an unexpected product set.', 1;

    DECLARE @NearExpiryProducts TABLE (
        MaSP VARCHAR(10), TenSP NVARCHAR(150), DonViTinh NVARCHAR(20),
        MucTonToiThieu INT, MaLoai VARCHAR(10), TenLoai NVARCHAR(100),
        TrangThaiSanPham VARCHAR(20), TongTon BIGINT, TongTonKhaDung BIGINT,
        TongTonCanHan BIGINT, TongTonHetHan BIGINT, TongTonBiKhoa BIGINT,
        SoLoConTon BIGINT, SoLoCanHan BIGINT, SoLoHetHan BIGINT,
        CanhBaoTonThap BIT, TongSoBanGhi BIGINT
    );

    INSERT INTO @NearExpiryProducts
    EXEC dbo.usp_TON_KHO_SAN_PHAM_TraCuu
        @MaLoai = 'C25CAT01', @CheDo = 'NEAR_EXPIRY',
        @NgayThamChieu = '2026-09-29', @NguongCanHanNgay = 30;

    IF (SELECT COUNT(*) FROM @NearExpiryProducts) <> 1
       OR NOT EXISTS (SELECT 1 FROM @NearExpiryProducts WHERE MaSP = 'C25SAFE01')
        THROW 52408, 'NEAR_EXPIRY mode did not use the requested threshold.', 1;

    DECLARE @ExpiredProducts TABLE (
        MaSP VARCHAR(10), TenSP NVARCHAR(150), DonViTinh NVARCHAR(20),
        MucTonToiThieu INT, MaLoai VARCHAR(10), TenLoai NVARCHAR(100),
        TrangThaiSanPham VARCHAR(20), TongTon BIGINT, TongTonKhaDung BIGINT,
        TongTonCanHan BIGINT, TongTonHetHan BIGINT, TongTonBiKhoa BIGINT,
        SoLoConTon BIGINT, SoLoCanHan BIGINT, SoLoHetHan BIGINT,
        CanhBaoTonThap BIT, TongSoBanGhi BIGINT
    );

    INSERT INTO @ExpiredProducts
    EXEC dbo.usp_TON_KHO_SAN_PHAM_TraCuu
        @MaLoai = 'C25CAT01', @CheDo = 'EXPIRED',
        @NgayThamChieu = '2026-09-29', @NguongCanHanNgay = 30;

    IF (SELECT COUNT(*) FROM @ExpiredProducts) <> 2
       OR NOT EXISTS (SELECT 1 FROM @ExpiredProducts WHERE MaSP = 'C25SAFE01')
       OR NOT EXISTS (SELECT 1 FROM @ExpiredProducts WHERE MaSP = 'C25EXP001')
        THROW 52409, 'EXPIRED mode did not include date-expired and status-expired lots.', 1;

    DECLARE @Lots TABLE (
        MaLo VARCHAR(20), MaSP VARCHAR(10), TenSP NVARCHAR(150), DonViTinh NVARCHAR(20),
        MaLoai VARCHAR(10), TenLoai NVARCHAR(100), SoLo VARCHAR(50),
        NgaySanXuat DATE, HanSuDung DATE, GiaNhap DECIMAL(18,2), SoLuongTon INT,
        TrangThaiLo VARCHAR(20), SoNgayConLai INT, TinhTrangHanDung VARCHAR(20),
        TongSoBanGhi BIGINT
    );

    INSERT INTO @Lots
    EXEC dbo.usp_LO_HANG_TraCuu
        @MaSP = 'C25SAFE01', @NgayThamChieu = '2026-09-29',
        @NguongCanHanNgay = 30, @KichThuocTrang = 10;

    IF (SELECT COUNT(*) FROM @Lots) <> 5
       OR EXISTS (SELECT 1 FROM @Lots WHERE TongSoBanGhi <> 5)
       OR NOT EXISTS (SELECT 1 FROM @Lots WHERE MaLo = 'C25L001' AND TinhTrangHanDung = 'EXPIRED' AND SoNgayConLai = 0)
       OR NOT EXISTS (SELECT 1 FROM @Lots WHERE MaLo = 'C25L002' AND TinhTrangHanDung = 'NEAR_EXPIRY' AND SoNgayConLai = 11)
       OR NOT EXISTS (SELECT 1 FROM @Lots WHERE MaLo = 'C25L003' AND TinhTrangHanDung = 'VALID')
       OR NOT EXISTS (SELECT 1 FROM @Lots WHERE MaLo = 'C25L005' AND TinhTrangHanDung = 'VALID' AND SoNgayConLai IS NULL)
        THROW 52410, 'Lot expiry classification returned unexpected detail.', 1;

    DELETE FROM @Lots;

    INSERT INTO @Lots
    EXEC dbo.usp_LO_HANG_TraCuu
        @MaSP = 'C25SAFE01', @TinhTrangHanDung = 'NEAR_EXPIRY',
        @NgayThamChieu = '2026-09-29', @NguongCanHanNgay = 5;

    IF EXISTS (SELECT 1 FROM @Lots)
        THROW 52411, 'Lot near-expiry query ignored the caller-supplied five-day threshold.', 1;

    DELETE FROM @Lots;

    INSERT INTO @Lots
    EXEC dbo.usp_LO_HANG_TraCuu
        @MaSP = 'C25SAFE01', @TinhTrangHanDung = 'NEAR_EXPIRY',
        @NgayThamChieu = '2026-09-29', @NguongCanHanNgay = 30;

    IF (SELECT COUNT(*) FROM @Lots WHERE MaLo = 'C25L002') <> 1
        THROW 52412, 'Lot near-expiry query did not admit the lot under a thirty-day threshold.', 1;

    DELETE FROM @Lots;

    INSERT INTO @Lots
    EXEC dbo.usp_LO_HANG_TraCuu
        @MaSP = 'C25SAFE01', @TrangThaiLo = 'BLOCKED',
        @NgayThamChieu = '2026-09-29', @NguongCanHanNgay = 30;

    IF (SELECT COUNT(*) FROM @Lots) <> 1
       OR NOT EXISTS (SELECT 1 FROM @Lots WHERE MaLo = 'C25L004' AND TrangThaiLo = 'BLOCKED')
        THROW 52413, 'Lot status filter returned an unexpected result.', 1;

    DECLARE @InvalidThresholdRejected BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_TON_KHO_SAN_PHAM_TraCuu @NguongCanHanNgay = -1;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51411
            SET @InvalidThresholdRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @InvalidThresholdRejected = 0
        THROW 52414, 'Inventory query accepted a negative near-expiry threshold.', 1;

    DECLARE @InvalidModeRejected BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_LO_HANG_TraCuu @TinhTrangHanDung = 'SOON';
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51420
            SET @InvalidModeRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @InvalidModeRejected = 0
        THROW 52415, 'Lot query accepted an unsupported expiry status.', 1;

    ROLLBACK TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

IF EXISTS (SELECT 1 FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C25%')
   OR EXISTS (SELECT 1 FROM dbo.LOAI_SAN_PHAM WHERE MaLoai LIKE 'C25%')
   OR EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo LIKE 'C25%')
    THROW 52416, 'C25 inventory query fixtures were not rolled back completely.', 1;
GO

DECLARE @ExpectedIndexes TABLE (TableName SYSNAME, IndexName SYSNAME, HasFilter BIT);

INSERT INTO @ExpectedIndexes (TableName, IndexName, HasFilter)
VALUES
    ('LO_HANG', 'IX_LO_HANG_FEFO', 0),
    ('LO_HANG', 'IX_LO_HANG_HanSuDung_TrangThai', 0),
    ('LO_HANG', 'IX_LO_HANG_MaSP_HanSuDung_ConTon', 1),
    ('SAN_PHAM', 'IX_SAN_PHAM_MaLoai_TrangThai', 0),
    ('SAN_PHAM', 'IX_SAN_PHAM_TenSP_TrangThai', 0);

IF EXISTS (
    SELECT 1
    FROM @ExpectedIndexes AS expected
    WHERE NOT EXISTS (
        SELECT 1
        FROM sys.indexes AS actual
        WHERE actual.object_id = OBJECT_ID(N'dbo.' + expected.TableName)
          AND actual.name = expected.IndexName
          AND actual.has_filter = expected.HasFilter
          AND actual.is_disabled = 0
    )
)
    THROW 52417, 'A required enabled C25 query index is missing or invalid.', 1;
GO

PRINT 'C25 inventory tests passed: lot-summed totals, low stock, parameterized expiry alerts, validation, indexes and rollback.';
GO
