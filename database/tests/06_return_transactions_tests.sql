SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    INSERT INTO dbo.NHAN_VIEN (
        MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai
    )
    VALUES ('C36NV001', N'Thu ngân C36', '0836000001', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE');

    INSERT INTO dbo.TAI_KHOAN (
        TenDangNhap, MatKhauHash, MaVaiTro, MaNV, TrangThai
    )
    VALUES (
        'c36.cashier',
        '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        'CASHIER',
        'C36NV001',
        'ACTIVE'
    );

    INSERT INTO dbo.KHACH_HANG (
        MaKH, HoTen, SDT, DiemTichLuy, HangThanhVien, TrangThai
    )
    VALUES ('C36KH001', N'Khách hàng C36', '0836000002', 10, 'BRONZE', 'ACTIVE');

    INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, TrangThai)
    VALUES ('C36CAT01', N'Danh mục C36', 'ACTIVE');

    INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, MaVach, DonViTinh, GiaBan,
        MucTonToiThieu, MaLoai, TrangThai
    )
    VALUES (
        'C36P001', N'Sản phẩm C36', 'C36-BAR-001', N'Cái', 11000,
        0, 'C36CAT01', 'ACTIVE'
    );

    INSERT INTO dbo.KHUYEN_MAI (
        MaKM, TenKM, LoaiKM, GiaTri, GiaTriDonToiThieu,
        MucGiamToiDa, NgayBatDau, NgayKetThuc, TrangThai
    )
    VALUES (
        'C36KM001', N'Khuyến mãi C36', 'PERCENT', 10, 0,
        NULL, DATEADD(DAY, -1, SYSDATETIME()), DATEADD(DAY, 1, SYSDATETIME()), 'ACTIVE'
    );

    INSERT INTO dbo.KHUYEN_MAI_SAN_PHAM (MaKM, MaSP)
    VALUES ('C36KM001', 'C36P001');

    INSERT INTO dbo.LO_HANG (
        MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung,
        GiaNhap, SoLuongTon, TrangThai
    )
    VALUES
        (
            'C36LOT001', 'C36P001', 'C36-BATCH-1',
            DATEADD(DAY, -10, CONVERT(DATE, SYSDATETIME())),
            DATEADD(DAY, 20, CONVERT(DATE, SYSDATETIME())),
            5000, 2, 'ACTIVE'
        ),
        (
            'C36LOT002', 'C36P001', 'C36-BATCH-2',
            DATEADD(DAY, -5, CONVERT(DATE, SYSDATETIME())),
            DATEADD(DAY, 40, CONVERT(DATE, SYSDATETIME())),
            5000, 5, 'ACTIVE'
        );

    EXEC dbo.usp_CA_LAM_VIEC_Mo
        @MaNV = 'C36NV001',
        @TienDauCa = 100000;

    DECLARE @MaCa BIGINT = (
        SELECT MaCa
        FROM dbo.CA_LAM_VIEC
        WHERE MaNV = 'C36NV001'
          AND TrangThai = 'OPEN'
    );

    EXEC dbo.usp_HOA_DON_HoanTatBanHang
        @MaHD = 'C36HD001',
        @MaCa = @MaCa,
        @MaKH = 'C36KH001',
        @DanhSachSanPham = N'[{"MaSP":"C36P001","SoLuong":5}]',
        @MaKM = 'C36KM001',
        @PhuongThuc = 'CASH',
        @SoTienThanhToan = 49500;

    DECLARE @MaCTHD BIGINT = (
        SELECT MaCTHD
        FROM dbo.CHI_TIET_HOA_DON
        WHERE MaHD = 'C36HD001'
          AND MaSP = 'C36P001'
    );

    IF @MaCTHD IS NULL
       OR NOT EXISTS (
           SELECT 1
           FROM dbo.CHI_TIET_XUAT_LO
           WHERE MaCTHD = @MaCTHD
             AND MaLo = 'C36LOT001'
             AND SoLuong = 2
       )
       OR NOT EXISTS (
           SELECT 1
           FROM dbo.CHI_TIET_XUAT_LO
           WHERE MaCTHD = @MaCTHD
             AND MaLo = 'C36LOT002'
             AND SoLuong = 3
       )
        THROW 52601, 'C36 sale fixture was not allocated across the expected FEFO lots.', 1;

    DECLARE @D1GuardCaught BIT = 0;
    UPDATE dbo.HOA_DON SET DiemSuDung = 1 WHERE MaHD = 'C36HD001';

    BEGIN TRY
        DECLARE @D1Items NVARCHAR(MAX) = CONCAT(
            N'[{"MaCTHD":', @MaCTHD,
            N',"MaLo":"C36LOT001","SoLuongTra":1,"TinhTrangHang":"RESALABLE"}]'
        );

        EXEC dbo.usp_PHIEU_TRA_HoanTat
            @MaPT = 'C36PTD1001',
            @MaHD = 'C36HD001',
            @MaNV = 'C36NV001',
            @LyDo = N'Kiểm tra guard D1',
            @DanhSachHangTra = @D1Items;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51612
            SET @D1GuardCaught = 1;
        ELSE
            THROW;
    END CATCH;

    UPDATE dbo.HOA_DON SET DiemSuDung = 0 WHERE MaHD = 'C36HD001';

    IF @D1GuardCaught = 0
       OR EXISTS (SELECT 1 FROM dbo.PHIEU_TRA WHERE MaPT = 'C36PTD1001')
        THROW 52602, 'Unresolved loyalty-redemption input was accepted or left partial data.', 1;

    DECLARE @ReturnOneItems NVARCHAR(MAX) = CONCAT(
        N'[{"MaCTHD":', @MaCTHD,
        N',"MaLo":"C36LOT001","SoLuongTra":1,"TinhTrangHang":"RESALABLE"}]'
    );

    EXEC dbo.usp_PHIEU_TRA_HoanTat
        @MaPT = 'C36PT001',
        @MaHD = 'C36HD001',
        @MaNV = 'C36NV001',
        @LyDo = N'Khách đổi ý',
        @DanhSachHangTra = @ReturnOneItems;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.PHIEU_TRA
        WHERE MaPT = 'C36PT001'
          AND MaHD = 'C36HD001'
          AND TongTienHoan = 9900
          AND TrangThai = 'COMPLETED'
    )
       OR NOT EXISTS (
           SELECT 1
           FROM dbo.CHI_TIET_PHIEU_TRA
           WHERE MaPT = 'C36PT001'
             AND MaCTHD = @MaCTHD
             AND MaLo = 'C36LOT001'
             AND SoLuongTra = 1
             AND TienHoan = 9900
             AND TinhTrangHang = 'RESALABLE'
       )
       OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C36LOT001' AND SoLuongTon = 1)
       OR NOT EXISTS (
           SELECT 1
           FROM dbo.GIAO_DICH_KHO
           WHERE MaThamChieu = 'C36PT001'
             AND MaLo = 'C36LOT001'
             AND LoaiGiaoDich = 'RETURN'
             AND SoLuongBienDong = 1
       )
       OR NOT EXISTS (SELECT 1 FROM dbo.KHACH_HANG WHERE MaKH = 'C36KH001' AND DiemTichLuy = 13)
       OR NOT EXISTS (SELECT 1 FROM dbo.HOA_DON WHERE MaHD = 'C36HD001' AND TrangThai = 'PAID')
       OR NOT EXISTS (SELECT 1 FROM dbo.THANH_TOAN WHERE MaHD = 'C36HD001' AND TrangThai = 'SUCCESS')
        THROW 52603, 'The first partial RESALABLE return did not persist refund, stock or loyalty effects.', 1;

    DECLARE @ReturnTwoItems NVARCHAR(MAX) = CONCAT(
        N'[{"MaCTHD":', @MaCTHD,
        N',"MaLo":"C36LOT001","SoLuongTra":1,"TinhTrangHang":"DAMAGED"}]'
    );

    EXEC dbo.usp_PHIEU_TRA_HoanTat
        @MaPT = 'C36PT002',
        @MaHD = 'C36HD001',
        @MaNV = 'C36NV001',
        @LyDo = N'Hàng hư hỏng',
        @DanhSachHangTra = @ReturnTwoItems;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.CHI_TIET_PHIEU_TRA
        WHERE MaPT = 'C36PT002'
          AND TienHoan = 9900
          AND TinhTrangHang = 'DAMAGED'
    )
       OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C36LOT001' AND SoLuongTon = 1)
       OR EXISTS (SELECT 1 FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'C36PT002')
       OR NOT EXISTS (SELECT 1 FROM dbo.KHACH_HANG WHERE MaKH = 'C36KH001' AND DiemTichLuy = 12)
        THROW 52604, 'DAMAGED return incorrectly restored stock or calculated refund/points incorrectly.', 1;

    DECLARE @OverReturnCaught BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_PHIEU_TRA_HoanTat
            @MaPT = 'C36PT003',
            @MaHD = 'C36HD001',
            @MaNV = 'C36NV001',
            @LyDo = N'Trả vượt số lượng',
            @DanhSachHangTra = @ReturnOneItems;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51614
            SET @OverReturnCaught = 1;
        ELSE
            THROW;
    END CATCH;

    IF @OverReturnCaught = 0
       OR EXISTS (SELECT 1 FROM dbo.PHIEU_TRA WHERE MaPT = 'C36PT003')
       OR EXISTS (SELECT 1 FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'C36PT003')
       OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C36LOT001' AND SoLuongTon = 1)
        THROW 52605, 'Over-return was accepted or left partial stock/return data.', 1;

    DECLARE @WrongAllocationCaught BIT = 0;
    DECLARE @WrongItems NVARCHAR(MAX) = CONCAT(
        N'[{"MaCTHD":', @MaCTHD,
        N',"MaLo":"LODEV001","SoLuongTra":1,"TinhTrangHang":"RESALABLE"}]'
    );

    BEGIN TRY
        EXEC dbo.usp_PHIEU_TRA_HoanTat
            @MaPT = 'C36PT004',
            @MaHD = 'C36HD001',
            @MaNV = 'C36NV001',
            @LyDo = N'Lô không thuộc hóa đơn',
            @DanhSachHangTra = @WrongItems;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51613
            SET @WrongAllocationCaught = 1;
        ELSE
            THROW;
    END CATCH;

    IF @WrongAllocationCaught = 0
       OR EXISTS (SELECT 1 FROM dbo.PHIEU_TRA WHERE MaPT = 'C36PT004')
        THROW 52606, 'A return line not exported by the original invoice was accepted.', 1;

    DECLARE @FinalReturnItems NVARCHAR(MAX) = CONCAT(
        N'[{"MaCTHD":', @MaCTHD,
        N',"MaLo":"C36LOT002","SoLuongTra":3,"TinhTrangHang":"RESALABLE"}]'
    );

    EXEC dbo.usp_PHIEU_TRA_HoanTat
        @MaPT = 'C36PT005',
        @MaHD = 'C36HD001',
        @MaNV = 'C36NV001',
        @LyDo = N'Trả phần còn lại',
        @DanhSachHangTra = @FinalReturnItems;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.PHIEU_TRA
        WHERE MaPT = 'C36PT005'
          AND TongTienHoan = 29700
          AND TrangThai = 'COMPLETED'
    )
       OR (SELECT SUM(TongTienHoan) FROM dbo.PHIEU_TRA WHERE MaHD = 'C36HD001' AND TrangThai = 'COMPLETED') <> 49500
       OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C36LOT002' AND SoLuongTon = 5)
       OR NOT EXISTS (SELECT 1 FROM dbo.HOA_DON WHERE MaHD = 'C36HD001' AND TrangThai = 'REFUNDED')
       OR NOT EXISTS (SELECT 1 FROM dbo.THANH_TOAN WHERE MaHD = 'C36HD001' AND TrangThai = 'REFUNDED')
       OR NOT EXISTS (SELECT 1 FROM dbo.KHACH_HANG WHERE MaKH = 'C36KH001' AND DiemTichLuy = 10)
        THROW 52607, 'Full return did not finalize invoice/payment, stock, refund or loyalty state correctly.', 1;

    IF (SELECT COUNT(*) FROM dbo.vw_PHIEU_TRA_CHI_TIET WHERE MaHD = 'C36HD001') <> 3
       OR NOT EXISTS (
           SELECT 1
           FROM dbo.vw_PHIEU_TRA_CHI_TIET
           WHERE MaPT = 'C36PT005'
             AND MaSP = 'C36P001'
             AND MaLo = 'C36LOT002'
             AND SoLuongTra = 3
             AND TienHoan = 29700
             AND TrangThaiHoaDon = 'REFUNDED'
       )
        THROW 52608, 'Return detail view does not expose the completed transaction correctly.', 1;

    DECLARE @AfterFullReturnCaught BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_PHIEU_TRA_HoanTat
            @MaPT = 'C36PT006',
            @MaHD = 'C36HD001',
            @MaNV = 'C36NV001',
            @LyDo = N'Trả sau khi đã hoàn tất',
            @DanhSachHangTra = @FinalReturnItems;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51611
            SET @AfterFullReturnCaught = 1;
        ELSE
            THROW;
    END CATCH;

    IF @AfterFullReturnCaught = 0
       OR EXISTS (SELECT 1 FROM dbo.PHIEU_TRA WHERE MaPT = 'C36PT006')
        THROW 52609, 'A fully refunded invoice accepted an additional return.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID('dbo.PHIEU_TRA')
          AND name = 'IX_PHIEU_TRA_MaHD_TrangThai_NgayTra'
          AND is_disabled = 0
    )
       OR NOT EXISTS (
           SELECT 1
           FROM sys.indexes
           WHERE object_id = OBJECT_ID('dbo.GIAO_DICH_KHO')
             AND name = 'UX_GIAO_DICH_KHO_RETURN_MaThamChieu_MaLo'
             AND is_unique = 1
             AND has_filter = 1
             AND is_disabled = 0
       )
        THROW 52610, 'Required C36 return indexes are missing or disabled.', 1;

    DELETE FROM dbo.GIAO_DICH_KHO
    WHERE MaThamChieu = 'C36HD001'
       OR MaThamChieu LIKE 'C36PT%';
    DELETE return_line
    FROM dbo.CHI_TIET_PHIEU_TRA AS return_line
    JOIN dbo.PHIEU_TRA AS return_header ON return_header.MaPT = return_line.MaPT
    WHERE return_header.MaHD = 'C36HD001';
    DELETE FROM dbo.PHIEU_TRA WHERE MaHD = 'C36HD001';
    DELETE FROM dbo.THANH_TOAN WHERE MaHD = 'C36HD001';
    DELETE lot_output
    FROM dbo.CHI_TIET_XUAT_LO AS lot_output
    JOIN dbo.CHI_TIET_HOA_DON AS invoice_line ON invoice_line.MaCTHD = lot_output.MaCTHD
    WHERE invoice_line.MaHD = 'C36HD001';
    DELETE FROM dbo.CHI_TIET_HOA_DON WHERE MaHD = 'C36HD001';
    DELETE FROM dbo.HOA_DON WHERE MaHD = 'C36HD001';
    DELETE FROM dbo.CA_LAM_VIEC WHERE MaNV = 'C36NV001';
    DELETE FROM dbo.TAI_KHOAN WHERE MaNV = 'C36NV001';
    DELETE FROM dbo.NHAN_VIEN WHERE MaNV = 'C36NV001';
    DELETE FROM dbo.KHACH_HANG WHERE MaKH = 'C36KH001';
    DELETE FROM dbo.LO_HANG WHERE MaSP = 'C36P001';
    DELETE FROM dbo.KHUYEN_MAI_SAN_PHAM WHERE MaKM = 'C36KM001';
    DELETE FROM dbo.KHUYEN_MAI WHERE MaKM = 'C36KM001';
    DELETE FROM dbo.SAN_PHAM WHERE MaSP = 'C36P001';
    DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'C36CAT01';
END TRY
BEGIN CATCH
    THROW;
END CATCH;
GO

IF EXISTS (SELECT 1 FROM dbo.HOA_DON WHERE MaHD = 'C36HD001')
   OR EXISTS (SELECT 1 FROM dbo.PHIEU_TRA WHERE MaPT LIKE 'C36PT%')
   OR EXISTS (SELECT 1 FROM dbo.NHAN_VIEN WHERE MaNV = 'C36NV001')
    THROW 52611, 'Transactional C36 fixtures were not rolled back completely.', 1;
GO

INSERT INTO dbo.NHAN_VIEN (
    MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai
)
VALUES ('C36NVR01', N'Thu ngân rollback C36', '0836000011', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE');

INSERT INTO dbo.TAI_KHOAN (
    TenDangNhap, MatKhauHash, MaVaiTro, MaNV, TrangThai
)
VALUES (
    'c36.rollback',
    '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'CASHIER',
    'C36NVR01',
    'ACTIVE'
);

INSERT INTO dbo.KHACH_HANG (
    MaKH, HoTen, SDT, DiemTichLuy, HangThanhVien, TrangThai
)
VALUES ('C36KHR01', N'Khách hàng rollback C36', '0836000012', 4, 'BRONZE', 'ACTIVE');

INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, TrangThai)
VALUES ('C36CATR1', N'Danh mục rollback C36', 'ACTIVE');

INSERT INTO dbo.SAN_PHAM (
    MaSP, TenSP, MaVach, DonViTinh, GiaBan,
    MucTonToiThieu, MaLoai, TrangThai
)
VALUES (
    'C36PR001', N'Sản phẩm rollback C36', 'C36-BAR-R01', N'Cái', 10000,
    0, 'C36CATR1', 'ACTIVE'
);

INSERT INTO dbo.LO_HANG (
    MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung,
    GiaNhap, SoLuongTon, TrangThai
)
VALUES (
    'C36LR001', 'C36PR001', 'C36-ROLLBACK',
    DATEADD(DAY, -5, CONVERT(DATE, SYSDATETIME())),
    DATEADD(DAY, 30, CONVERT(DATE, SYSDATETIME())),
    5000, 4, 'ACTIVE'
);

EXEC dbo.usp_CA_LAM_VIEC_Mo @MaNV = 'C36NVR01', @TienDauCa = 0;
GO

DECLARE @RollbackShiftId BIGINT = (
    SELECT MaCa
    FROM dbo.CA_LAM_VIEC
    WHERE MaNV = 'C36NVR01'
      AND TrangThai = 'OPEN'
);

EXEC dbo.usp_HOA_DON_HoanTatBanHang
    @MaHD = 'C36HDR01',
    @MaCa = @RollbackShiftId,
    @MaKH = 'C36KHR01',
    @DanhSachSanPham = N'[{"MaSP":"C36PR001","SoLuong":2}]',
    @PhuongThuc = 'TRANSFER',
    @SoTienThanhToan = 20000,
    @MaGiaoDichNgoai = 'C36-ROLLBACK-PAY';
GO

CREATE TRIGGER dbo.trg_C36_ForceReturnFailure
ON dbo.GIAO_DICH_KHO
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted
        WHERE LoaiGiaoDich = 'RETURN'
          AND MaThamChieu = 'C36PTR01'
    )
        THROW 52690, 'Forced C36 SQL failure after exact-lot stock restoration.', 1;
END;
GO

DECLARE @RollbackLineId BIGINT = (
    SELECT MaCTHD
    FROM dbo.CHI_TIET_HOA_DON
    WHERE MaHD = 'C36HDR01'
);
DECLARE @RollbackItems NVARCHAR(MAX) = CONCAT(
    N'[{"MaCTHD":', @RollbackLineId,
    N',"MaLo":"C36LR001","SoLuongTra":1,"TinhTrangHang":"RESALABLE"}]'
);
DECLARE @ForcedFailureCaught BIT = 0;

BEGIN TRY
    EXEC dbo.usp_PHIEU_TRA_HoanTat
        @MaPT = 'C36PTR01',
        @MaHD = 'C36HDR01',
        @MaNV = 'C36NVR01',
        @LyDo = N'Kiểm tra rollback',
        @DanhSachHangTra = @RollbackItems;
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 52690
        SET @ForcedFailureCaught = 1;
    ELSE
        THROW;
END CATCH;

IF @ForcedFailureCaught = 0
   OR EXISTS (SELECT 1 FROM dbo.PHIEU_TRA WHERE MaPT = 'C36PTR01')
   OR EXISTS (SELECT 1 FROM dbo.CHI_TIET_PHIEU_TRA WHERE MaPT = 'C36PTR01')
   OR EXISTS (SELECT 1 FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'C36PTR01')
   OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C36LR001' AND SoLuongTon = 2)
   OR NOT EXISTS (SELECT 1 FROM dbo.HOA_DON WHERE MaHD = 'C36HDR01' AND TrangThai = 'PAID')
   OR NOT EXISTS (SELECT 1 FROM dbo.THANH_TOAN WHERE MaHD = 'C36HDR01' AND TrangThai = 'SUCCESS')
   OR NOT EXISTS (SELECT 1 FROM dbo.KHACH_HANG WHERE MaKH = 'C36KHR01' AND DiemTichLuy = 6)
    THROW 52612, 'Forced failure left partial return, stock, invoice, payment or loyalty data.', 1;
GO

DROP TRIGGER IF EXISTS dbo.trg_C36_ForceReturnFailure;
GO

DELETE FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'C36HDR01';
DELETE FROM dbo.THANH_TOAN WHERE MaHD = 'C36HDR01';
DELETE lot_output
FROM dbo.CHI_TIET_XUAT_LO AS lot_output
JOIN dbo.CHI_TIET_HOA_DON AS invoice_line ON invoice_line.MaCTHD = lot_output.MaCTHD
WHERE invoice_line.MaHD = 'C36HDR01';
DELETE FROM dbo.CHI_TIET_HOA_DON WHERE MaHD = 'C36HDR01';
DELETE FROM dbo.HOA_DON WHERE MaHD = 'C36HDR01';
DELETE FROM dbo.CA_LAM_VIEC WHERE MaNV = 'C36NVR01';
DELETE FROM dbo.TAI_KHOAN WHERE MaNV = 'C36NVR01';
DELETE FROM dbo.NHAN_VIEN WHERE MaNV = 'C36NVR01';
DELETE FROM dbo.KHACH_HANG WHERE MaKH = 'C36KHR01';
DELETE FROM dbo.LO_HANG WHERE MaLo = 'C36LR001';
DELETE FROM dbo.SAN_PHAM WHERE MaSP = 'C36PR001';
DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'C36CATR1';
GO

IF EXISTS (SELECT 1 FROM dbo.HOA_DON WHERE MaHD = 'C36HDR01')
   OR EXISTS (SELECT 1 FROM dbo.PHIEU_TRA WHERE MaPT = 'C36PTR01')
   OR EXISTS (SELECT 1 FROM dbo.NHAN_VIEN WHERE MaNV = 'C36NVR01')
    THROW 52613, 'Forced-failure C36 fixtures were not cleaned up.', 1;
GO

PRINT 'C36 return tests passed: source allocation, partial/repeated limits, authoritative refunds, RESALABLE/DAMAGED stock, full refund and rollback.';
GO
