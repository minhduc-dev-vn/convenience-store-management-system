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
    ('vw_HOA_DON_CHI_TIET', 'V'),
    ('vw_HOA_DON_THANH_TOAN', 'V'),
    ('usp_CA_LAM_VIEC_Mo', 'P'),
    ('usp_HOA_DON_HoanTatBanHang', 'P'),
    ('usp_HOA_DON_LayChiTiet', 'P');

IF EXISTS (
    SELECT 1
    FROM @RequiredObjects AS required
    WHERE OBJECT_ID(N'dbo.' + required.ObjectName, required.ObjectType) IS NULL
)
    THROW 52500, 'One or more C28 sale objects are missing.', 1;

IF (SELECT COUNT(*) FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo')) <> 23
    THROW 52501, 'C28 must preserve exactly 23 dbo core tables.', 1;
GO

BEGIN TRY
    INSERT INTO dbo.NHAN_VIEN (MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai)
    VALUES ('C28NV001', N'Thu ngân kiểm thử C28', '0280000001', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE');

    INSERT INTO dbo.TAI_KHOAN (TenDangNhap, MatKhauHash, MaVaiTro, MaNV, TrangThai)
    VALUES (
        'c28.cashier',
        '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        'CASHIER',
        'C28NV001',
        'ACTIVE'
    );

    INSERT INTO dbo.KHACH_HANG (MaKH, HoTen, SDT, DiemTichLuy, HangThanhVien, TrangThai)
    VALUES ('C28KH001', N'Khách hàng kiểm thử C28', '0280000002', 10, 'BRONZE', 'ACTIVE');

    INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, TrangThai)
    VALUES ('C28CAT01', N'Danh mục bán hàng C28', 'ACTIVE');

    INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, MaVach, DonViTinh, GiaBan, MucTonToiThieu, MaLoai, TrangThai
    )
    VALUES
        ('C28P001', N'Sản phẩm FEFO C28', 'C28-BAR-001', N'Chai', 10000, 0, 'C28CAT01', 'ACTIVE'),
        ('C28P002', N'Sản phẩm bổ sung C28', 'C28-BAR-002', N'Hộp', 20000, 0, 'C28CAT01', 'ACTIVE'),
        ('C28P003', N'Sản phẩm chỉ có lô hết hạn C28', 'C28-BAR-003', N'Gói', 5000, 0, 'C28CAT01', 'ACTIVE');

    INSERT INTO dbo.LO_HANG (
        MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
    )
    VALUES
        ('C28L001', 'C28P001', 'C28-EXPIRED', DATEADD(DAY, -30, CONVERT(DATE, SYSDATETIME())), DATEADD(DAY, -1, CONVERT(DATE, SYSDATETIME())), 4000, 20, 'ACTIVE'),
        ('C28L002', 'C28P001', 'C28-NEAREST', DATEADD(DAY, -10, CONVERT(DATE, SYSDATETIME())), DATEADD(DAY, 5, CONVERT(DATE, SYSDATETIME())), 4000, 2, 'ACTIVE'),
        ('C28L003', 'C28P001', 'C28-NEXT', DATEADD(DAY, -5, CONVERT(DATE, SYSDATETIME())), DATEADD(DAY, 20, CONVERT(DATE, SYSDATETIME())), 4500, 4, 'ACTIVE'),
        ('C28L004', 'C28P001', 'C28-NO-EXPIRY', NULL, NULL, 4500, 5, 'ACTIVE'),
        ('C28L005', 'C28P001', 'C28-BLOCKED', DATEADD(DAY, -5, CONVERT(DATE, SYSDATETIME())), DATEADD(DAY, 10, CONVERT(DATE, SYSDATETIME())), 4500, 10, 'BLOCKED'),
        ('C28L006', 'C28P002', 'C28-SECOND', DATEADD(DAY, -5, CONVERT(DATE, SYSDATETIME())), DATEADD(DAY, 30, CONVERT(DATE, SYSDATETIME())), 9000, 10, 'ACTIVE'),
        ('C28L007', 'C28P003', 'C28-ONLY-EXPIRED', DATEADD(DAY, -10, CONVERT(DATE, SYSDATETIME())), DATEADD(DAY, -1, CONVERT(DATE, SYSDATETIME())), 2000, 10, 'ACTIVE');

    INSERT INTO dbo.KHUYEN_MAI (
        MaKM, TenKM, LoaiKM, GiaTri, GiaTriDonToiThieu, MucGiamToiDa,
        NgayBatDau, NgayKetThuc, TrangThai
    )
    VALUES (
        'C28KM001', N'Khuyến mãi FEFO C28', 'PERCENT', 10, 50000, 4000,
        DATEADD(DAY, -1, SYSDATETIME()), DATEADD(DAY, 1, SYSDATETIME()), 'ACTIVE'
    );

    INSERT INTO dbo.KHUYEN_MAI_SAN_PHAM (MaKM, MaSP)
    VALUES ('C28KM001', 'C28P001');

    EXEC dbo.usp_CA_LAM_VIEC_Mo
        @MaNV = 'C28NV001',
        @TienDauCa = 500000,
        @GhiChu = N'Ca kiểm thử C28';

    DECLARE @MaCa BIGINT = (
        SELECT MaCa
        FROM dbo.CA_LAM_VIEC
        WHERE MaNV = 'C28NV001'
          AND TrangThai = 'OPEN'
    );

    IF @MaCa IS NULL
        THROW 52502, 'Opening a cashier shift did not return a shift identifier.', 1;

    DECLARE @DuplicateOpenShiftRejected BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_CA_LAM_VIEC_Mo @MaNV = 'C28NV001', @TienDauCa = 0;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51504
            SET @DuplicateOpenShiftRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @DuplicateOpenShiftRejected = 0
        THROW 52503, 'A cashier was allowed to open two shifts concurrently.', 1;

    EXEC dbo.usp_HOA_DON_HoanTatBanHang
        @MaHD = 'C28HD001',
        @MaCa = @MaCa,
        @MaKH = 'C28KH001',
        @DanhSachSanPham = N'[{"MaSP":"C28P001","SoLuong":5},{"MaSP":"C28P002","SoLuong":2}]',
        @MaKM = 'C28KM001',
        @PhuongThuc = 'CARD',
        @SoTienThanhToan = 86000,
        @MaGiaoDichNgoai = 'C28-PAY-001';

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.HOA_DON AS invoice
        JOIN dbo.THANH_TOAN AS payment
            ON payment.MaHD = invoice.MaHD
           AND payment.TrangThai = 'SUCCESS'
        WHERE invoice.MaHD = 'C28HD001'
          AND invoice.TongTienHang = 90000
          AND invoice.TongGiamGia = 4000
          AND invoice.TongThanhToan = 86000
          AND invoice.DiemSuDung = 0
          AND invoice.DiemTichLuy = 8
          AND invoice.TrangThai = 'PAID'
          AND payment.PhuongThuc = 'CARD'
          AND payment.SoTien = 86000
    )
        THROW 52504, 'Successful sale totals, payment, status or earned points are incorrect.', 1;

    IF (SELECT COUNT(*) FROM dbo.CHI_TIET_HOA_DON WHERE MaHD = 'C28HD001') <> 2
       OR NOT EXISTS (
           SELECT 1
           FROM dbo.CHI_TIET_HOA_DON
           WHERE MaHD = 'C28HD001'
             AND MaSP = 'C28P001'
             AND MaKM = 'C28KM001'
             AND SoLuong = 5
             AND DonGiaBan = 10000
             AND TienGiam = 4000
       )
       OR NOT EXISTS (
           SELECT 1
           FROM dbo.CHI_TIET_HOA_DON
           WHERE MaHD = 'C28HD001'
             AND MaSP = 'C28P002'
             AND MaKM IS NULL
             AND SoLuong = 2
             AND DonGiaBan = 20000
             AND TienGiam = 0
       )
        THROW 52505, 'Invoice lines did not persist authoritative prices and promotion allocation.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.CHI_TIET_XUAT_LO AS allocation
        JOIN dbo.CHI_TIET_HOA_DON AS detail ON detail.MaCTHD = allocation.MaCTHD
        WHERE detail.MaHD = 'C28HD001'
          AND detail.MaSP = 'C28P001'
          AND allocation.MaLo = 'C28L002'
          AND allocation.SoLuong = 2
    )
       OR NOT EXISTS (
           SELECT 1
           FROM dbo.CHI_TIET_XUAT_LO AS allocation
           JOIN dbo.CHI_TIET_HOA_DON AS detail ON detail.MaCTHD = allocation.MaCTHD
           WHERE detail.MaHD = 'C28HD001'
             AND detail.MaSP = 'C28P001'
             AND allocation.MaLo = 'C28L003'
             AND allocation.SoLuong = 3
       )
       OR EXISTS (
           SELECT 1
           FROM dbo.CHI_TIET_XUAT_LO AS allocation
           JOIN dbo.CHI_TIET_HOA_DON AS detail ON detail.MaCTHD = allocation.MaCTHD
           WHERE detail.MaHD = 'C28HD001'
             AND allocation.MaLo IN ('C28L001', 'C28L004', 'C28L005')
       )
        THROW 52506, 'Multi-lot allocation did not follow FEFO or admitted an expired/blocked/later lot.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C28L002' AND SoLuongTon = 0)
       OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C28L003' AND SoLuongTon = 1)
       OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C28L001' AND SoLuongTon = 20)
       OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C28L004' AND SoLuongTon = 5)
       OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C28L005' AND SoLuongTon = 10)
        THROW 52507, 'Lot balances after the FEFO sale are incorrect.', 1;

    IF (SELECT COUNT(*) FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'C28HD001' AND LoaiGiaoDich = 'SALE') <> 3
       OR EXISTS (
           SELECT 1
           FROM dbo.GIAO_DICH_KHO
           WHERE MaThamChieu = 'C28HD001'
             AND (LoaiGiaoDich <> 'SALE' OR SoLuongBienDong >= 0 OR MaNV <> 'C28NV001')
       )
        THROW 52508, 'Sale stock transactions are missing or invalid.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.THANH_TOAN
        WHERE MaHD = 'C28HD001'
          AND PhuongThuc = 'CARD'
          AND SoTien = 86000
          AND TrangThai = 'SUCCESS'
          AND MaGiaoDichNgoai = 'C28-PAY-001'
    )
       OR NOT EXISTS (SELECT 1 FROM dbo.KHACH_HANG WHERE MaKH = 'C28KH001' AND DiemTichLuy = 18)
        THROW 52509, 'Payment or loyalty accrual was not persisted correctly.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.vw_HOA_DON_CHI_TIET
        WHERE MaHD = 'C28HD001'
          AND MaSP = 'C28P001'
          AND TrangThaiHoaDon = 'PAID'
    )
       OR NOT EXISTS (
           SELECT 1
           FROM dbo.vw_HOA_DON_THANH_TOAN
           WHERE MaHD = 'C28HD001'
             AND TrangThaiThanhToan = 'SUCCESS'
       )
        THROW 52510, 'Invoice or payment read view did not expose the finalized sale.', 1;

    EXEC dbo.usp_HOA_DON_LayChiTiet @MaHD = 'C28HD001';

    DECLARE @StockBeforeFailure INT = (SELECT SoLuongTon FROM dbo.LO_HANG WHERE MaLo = 'C28L004');
    DECLARE @InsufficientStockRejected BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_HOA_DON_HoanTatBanHang
            @MaHD = 'C28HD002',
            @MaCa = @MaCa,
            @DanhSachSanPham = N'[{"MaSP":"C28P001","SoLuong":100}]',
            @PhuongThuc = 'CASH',
            @SoTienThanhToan = 1000000;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51526
            SET @InsufficientStockRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @InsufficientStockRejected = 0
       OR EXISTS (SELECT 1 FROM dbo.HOA_DON WHERE MaHD = 'C28HD002')
       OR EXISTS (SELECT 1 FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'C28HD002')
       OR EXISTS (SELECT 1 FROM dbo.THANH_TOAN WHERE MaHD = 'C28HD002')
       OR (SELECT SoLuongTon FROM dbo.LO_HANG WHERE MaLo = 'C28L004') <> @StockBeforeFailure
        THROW 52511, 'Insufficient inventory did not roll back the entire sale.', 1;

    DECLARE @ExpiredOnlyRejected BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_HOA_DON_HoanTatBanHang
            @MaHD = 'C28HD003',
            @MaCa = @MaCa,
            @DanhSachSanPham = N'[{"MaSP":"C28P003","SoLuong":1}]',
            @PhuongThuc = 'CASH',
            @SoTienThanhToan = 5000;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51526
            SET @ExpiredOnlyRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @ExpiredOnlyRejected = 0
       OR EXISTS (SELECT 1 FROM dbo.HOA_DON WHERE MaHD = 'C28HD003')
       OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C28L007' AND SoLuongTon = 10)
        THROW 52512, 'An expired lot was admitted to a sale or the failed invoice was retained.', 1;

    DECLARE @PaymentMismatchRejected BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_HOA_DON_HoanTatBanHang
            @MaHD = 'C28HD004',
            @MaCa = @MaCa,
            @DanhSachSanPham = N'[{"MaSP":"C28P002","SoLuong":1}]',
            @PhuongThuc = 'CASH',
            @SoTienThanhToan = 19999;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51524
            SET @PaymentMismatchRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @PaymentMismatchRejected = 0
       OR EXISTS (SELECT 1 FROM dbo.HOA_DON WHERE MaHD = 'C28HD004')
        THROW 52513, 'A payment amount different from the server total was accepted.', 1;

    DECLARE @DuplicateInvoiceRejected BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_HOA_DON_HoanTatBanHang
            @MaHD = 'C28HD001',
            @MaCa = @MaCa,
            @DanhSachSanPham = N'[{"MaSP":"C28P002","SoLuong":1}]',
            @PhuongThuc = 'CASH',
            @SoTienThanhToan = 20000;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51516
            SET @DuplicateInvoiceRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @DuplicateInvoiceRejected = 0
        THROW 52514, 'Duplicate invoice finalization was not rejected.', 1;

    DELETE FROM dbo.THANH_TOAN WHERE MaHD = 'C28HD001';
    DELETE FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'C28HD001';
    DELETE allocation
    FROM dbo.CHI_TIET_XUAT_LO AS allocation
    JOIN dbo.CHI_TIET_HOA_DON AS detail ON detail.MaCTHD = allocation.MaCTHD
    WHERE detail.MaHD = 'C28HD001';
    DELETE FROM dbo.CHI_TIET_HOA_DON WHERE MaHD = 'C28HD001';
    DELETE FROM dbo.HOA_DON WHERE MaHD = 'C28HD001';
    DELETE FROM dbo.CA_LAM_VIEC WHERE MaNV = 'C28NV001';
    DELETE FROM dbo.KHUYEN_MAI_SAN_PHAM WHERE MaKM = 'C28KM001';
    DELETE FROM dbo.KHUYEN_MAI WHERE MaKM = 'C28KM001';
    DELETE FROM dbo.TAI_KHOAN WHERE MaNV = 'C28NV001';
    DELETE FROM dbo.NHAN_VIEN WHERE MaNV = 'C28NV001';
    DELETE FROM dbo.KHACH_HANG WHERE MaKH = 'C28KH001';
    DELETE FROM dbo.LO_HANG WHERE MaSP IN ('C28P001', 'C28P002', 'C28P003');
    DELETE FROM dbo.SAN_PHAM WHERE MaSP IN ('C28P001', 'C28P002', 'C28P003');
    DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'C28CAT01';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

IF EXISTS (SELECT 1 FROM dbo.HOA_DON WHERE MaHD LIKE 'C28HD%')
   OR EXISTS (SELECT 1 FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C28P%')
   OR EXISTS (SELECT 1 FROM dbo.NHAN_VIEN WHERE MaNV LIKE 'C28NV%')
    THROW 52515, 'Transactional C28 fixtures were not rolled back completely.', 1;
GO

INSERT INTO dbo.NHAN_VIEN (MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai)
VALUES ('C28NVR01', N'Thu ngân rollback C28', '0280000011', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE');

INSERT INTO dbo.TAI_KHOAN (TenDangNhap, MatKhauHash, MaVaiTro, MaNV, TrangThai)
VALUES (
    'c28.rollback',
    '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'CASHIER',
    'C28NVR01',
    'ACTIVE'
);

INSERT INTO dbo.KHACH_HANG (MaKH, HoTen, SDT, DiemTichLuy, HangThanhVien, TrangThai)
VALUES ('C28KHR01', N'Khách hàng rollback C28', '0280000012', 7, 'BRONZE', 'ACTIVE');

INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, TrangThai)
VALUES ('C28CATR1', N'Danh mục rollback C28', 'ACTIVE');

INSERT INTO dbo.SAN_PHAM (
    MaSP, TenSP, MaVach, DonViTinh, GiaBan, MucTonToiThieu, MaLoai, TrangThai
)
VALUES ('C28PR001', N'Sản phẩm rollback C28', 'C28-BAR-R01', N'Hộp', 15000, 0, 'C28CATR1', 'ACTIVE');

INSERT INTO dbo.LO_HANG (
    MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
)
VALUES (
    'C28LR001', 'C28PR001', 'C28-ROLLBACK', CONVERT(DATE, SYSDATETIME()),
    DATEADD(DAY, 30, CONVERT(DATE, SYSDATETIME())), 7000, 5, 'ACTIVE'
);

EXEC dbo.usp_CA_LAM_VIEC_Mo @MaNV = 'C28NVR01', @TienDauCa = 0;
GO

CREATE TRIGGER dbo.trg_C28_ForceSaleFailure
ON dbo.GIAO_DICH_KHO
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted
        WHERE LoaiGiaoDich = 'SALE'
          AND MaThamChieu = 'C28HDR01'
    )
        THROW 52590, 'Forced C28 SQL failure after FEFO stock mutation.', 1;
END;
GO

DECLARE @ForcedFailureCaught BIT = 0;
DECLARE @RollbackShiftId BIGINT = (
    SELECT MaCa
    FROM dbo.CA_LAM_VIEC
    WHERE MaNV = 'C28NVR01'
      AND TrangThai = 'OPEN'
);

BEGIN TRY
    EXEC dbo.usp_HOA_DON_HoanTatBanHang
        @MaHD = 'C28HDR01',
        @MaCa = @RollbackShiftId,
        @MaKH = 'C28KHR01',
        @DanhSachSanPham = N'[{"MaSP":"C28PR001","SoLuong":2}]',
        @PhuongThuc = 'TRANSFER',
        @SoTienThanhToan = 30000,
        @MaGiaoDichNgoai = 'C28-ROLLBACK-PAY';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 52590
        SET @ForcedFailureCaught = 1;
    ELSE
        THROW;
END CATCH;

IF @ForcedFailureCaught = 0
   OR EXISTS (SELECT 1 FROM dbo.HOA_DON WHERE MaHD = 'C28HDR01')
   OR EXISTS (SELECT 1 FROM dbo.CHI_TIET_HOA_DON WHERE MaHD = 'C28HDR01')
   OR EXISTS (SELECT 1 FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'C28HDR01')
   OR EXISTS (SELECT 1 FROM dbo.THANH_TOAN WHERE MaHD = 'C28HDR01')
   OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C28LR001' AND SoLuongTon = 5)
   OR NOT EXISTS (SELECT 1 FROM dbo.KHACH_HANG WHERE MaKH = 'C28KHR01' AND DiemTichLuy = 7)
    THROW 52516, 'A forced SQL failure left partial invoice, stock, payment or loyalty data.', 1;
GO

DROP TRIGGER IF EXISTS dbo.trg_C28_ForceSaleFailure;
GO

DELETE FROM dbo.CA_LAM_VIEC WHERE MaNV = 'C28NVR01';
DELETE FROM dbo.TAI_KHOAN WHERE MaNV = 'C28NVR01';
DELETE FROM dbo.NHAN_VIEN WHERE MaNV = 'C28NVR01';
DELETE FROM dbo.KHACH_HANG WHERE MaKH = 'C28KHR01';
DELETE FROM dbo.LO_HANG WHERE MaLo = 'C28LR001';
DELETE FROM dbo.SAN_PHAM WHERE MaSP = 'C28PR001';
DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'C28CATR1';
GO

IF EXISTS (SELECT 1 FROM dbo.NHAN_VIEN WHERE MaNV = 'C28NVR01')
   OR EXISTS (SELECT 1 FROM dbo.KHACH_HANG WHERE MaKH = 'C28KHR01')
   OR EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C28LR001')
    THROW 52517, 'Forced-failure C28 fixtures were not cleaned up.', 1;
GO

DECLARE @ExpectedIndexes TABLE (TableName SYSNAME, IndexName SYSNAME, HasFilter BIT);

INSERT INTO @ExpectedIndexes (TableName, IndexName, HasFilter)
VALUES
    ('LO_HANG', 'IX_LO_HANG_FEFO', 0),
    ('LO_HANG', 'IX_LO_HANG_MaSP_HanSuDung_ConTon', 1),
    ('CA_LAM_VIEC', 'UX_CA_LAM_VIEC_MaNV_OPEN', 1),
    ('GIAO_DICH_KHO', 'UX_GIAO_DICH_KHO_SALE_MaThamChieu_MaLo', 1),
    ('THANH_TOAN', 'UX_THANH_TOAN_SUCCESS_MaHD', 1);

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
    THROW 52518, 'A required enabled C28 FEFO or transaction invariant index is missing.', 1;
GO

PRINT 'C28 sale tests passed: shift, totals, promotion, multi-lot FEFO, expired-lot exclusion, payment, points and full rollback.';
GO
