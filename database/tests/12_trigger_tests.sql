:ON ERROR EXIT

SET NOCOUNT ON;
SET XACT_ABORT OFF;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF DB_NAME() IN ('master', 'model', 'msdb', 'tempdb')
    THROW 53300, 'C60 trigger tests refuse to run in a SQL Server system database.', 1;

DECLARE @ExpectedTriggers TABLE (
    TriggerName SYSNAME NOT NULL PRIMARY KEY,
    ParentTable SYSNAME NOT NULL
);

INSERT INTO @ExpectedTriggers (TriggerName, ParentTable)
VALUES
    ('trg_NHAT_KY_HE_THONG_AppendOnly', 'NHAT_KY_HE_THONG'),
    ('trg_GIAO_DICH_KHO_AppendOnly', 'GIAO_DICH_KHO'),
    ('trg_CHI_TIET_PHIEU_NHAP_ChiSuaKhiDraft', 'CHI_TIET_PHIEU_NHAP'),
    ('trg_CHI_TIET_HOA_DON_ChiSuaKhiDraft', 'CHI_TIET_HOA_DON'),
    ('trg_LO_HANG_BaoVeSanPhamSauPhatSinh', 'LO_HANG');

IF (
    SELECT COUNT(*)
    FROM sys.triggers AS trigger_definition
    JOIN sys.tables AS parent_table ON parent_table.object_id = trigger_definition.parent_id
    WHERE trigger_definition.parent_class = 1
      AND trigger_definition.is_ms_shipped = 0
      AND parent_table.schema_id = SCHEMA_ID('dbo')
) <> 5
   OR EXISTS (
       SELECT 1
       FROM @ExpectedTriggers AS expected
       LEFT JOIN sys.triggers AS trigger_definition
           ON trigger_definition.name = expected.TriggerName
          AND trigger_definition.parent_class = 1
       LEFT JOIN sys.tables AS parent_table
           ON parent_table.object_id = trigger_definition.parent_id
          AND parent_table.schema_id = SCHEMA_ID('dbo')
       WHERE trigger_definition.object_id IS NULL
          OR parent_table.name <> expected.ParentTable
          OR trigger_definition.is_disabled = 1
   )
    THROW 53301, 'The five documented application triggers must exist, be enabled and use the expected parent tables.', 1;
GO

IF DATABASE_PRINCIPAL_ID('C60TriggerDmlTestUser') IS NOT NULL
    DROP USER C60TriggerDmlTestUser;

CREATE USER C60TriggerDmlTestUser WITHOUT LOGIN;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.NHAT_KY_HE_THONG TO C60TriggerDmlTestUser;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.GIAO_DICH_KHO TO C60TriggerDmlTestUser;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.CHI_TIET_PHIEU_NHAP TO C60TriggerDmlTestUser;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.CHI_TIET_HOA_DON TO C60TriggerDmlTestUser;
GRANT SELECT, UPDATE ON OBJECT::dbo.LO_HANG TO C60TriggerDmlTestUser;
GRANT EXECUTE ON OBJECT::dbo.usp_PHIEU_NHAP_LuuNhap TO C60TriggerDmlTestUser;
GRANT EXECUTE ON OBJECT::dbo.usp_CHI_TIET_PHIEU_NHAP_LuuNhap TO C60TriggerDmlTestUser;
GRANT EXECUTE ON OBJECT::dbo.usp_PHIEU_NHAP_XacNhan TO C60TriggerDmlTestUser;
GRANT EXECUTE ON OBJECT::dbo.usp_CA_LAM_VIEC_Mo TO C60TriggerDmlTestUser;
GRANT EXECUTE ON OBJECT::dbo.usp_HOA_DON_HoanTatBanHang TO C60TriggerDmlTestUser;
GRANT EXECUTE ON OBJECT::dbo.usp_PHIEU_TRA_HoanTat TO C60TriggerDmlTestUser;
GO

-- Idempotent fixture cleanup uses the same documented db_owner maintenance path
-- as the existing audit trigger. No trigger is disabled during this suite.
DELETE FROM dbo.NHAT_KY_HE_THONG WHERE MaBanGhi LIKE 'C60%';
DELETE FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu LIKE 'C60%';
DELETE return_line
FROM dbo.CHI_TIET_PHIEU_TRA AS return_line
JOIN dbo.PHIEU_TRA AS return_header ON return_header.MaPT = return_line.MaPT
WHERE return_header.MaPT LIKE 'C60%';
DELETE FROM dbo.PHIEU_TRA WHERE MaPT LIKE 'C60%';
DELETE FROM dbo.THANH_TOAN WHERE MaHD LIKE 'C60%';
DELETE allocation
FROM dbo.CHI_TIET_XUAT_LO AS allocation
JOIN dbo.CHI_TIET_HOA_DON AS invoice_line ON invoice_line.MaCTHD = allocation.MaCTHD
WHERE invoice_line.MaHD LIKE 'C60%';
DELETE FROM dbo.CHI_TIET_HOA_DON WHERE MaHD LIKE 'C60%';
DELETE FROM dbo.HOA_DON WHERE MaHD LIKE 'C60%';
DELETE FROM dbo.CA_LAM_VIEC WHERE MaNV = 'C60NV001';
DELETE FROM dbo.TAI_KHOAN WHERE MaNV = 'C60NV001';
DELETE FROM dbo.CHI_TIET_PHIEU_NHAP WHERE MaPN LIKE 'C60%';
DELETE FROM dbo.PHIEU_NHAP WHERE MaPN LIKE 'C60%';
DELETE FROM dbo.CHI_TIET_KIEM_KE WHERE MaKK LIKE 'C60%';
DELETE FROM dbo.KIEM_KE WHERE MaKK LIKE 'C60%';
DELETE FROM dbo.LO_HANG WHERE MaLo LIKE 'C60%';
DELETE FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C60%';
DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'C60CAT01';
DELETE FROM dbo.NHAN_VIEN WHERE MaNV = 'C60NV001';
GO

INSERT INTO dbo.NHAN_VIEN (MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai)
VALUES ('C60NV001', N'Nhân viên trigger C60', '0860000001', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE');

INSERT INTO dbo.TAI_KHOAN (TenDangNhap, MatKhauHash, MaVaiTro, MaNV, TrangThai)
VALUES (
    'c60.trigger',
    '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'CASHIER',
    'C60NV001',
    'ACTIVE'
);

INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, TrangThai)
VALUES ('C60CAT01', N'Danh mục trigger C60', 'ACTIVE');

INSERT INTO dbo.SAN_PHAM (
    MaSP, TenSP, MaVach, DonViTinh, GiaBan, MucTonToiThieu, MaLoai, TrangThai
)
VALUES
    ('C60P001', N'Sản phẩm trigger A', 'C60-BAR-001', N'Cái', 10000, 0, 'C60CAT01', 'ACTIVE'),
    ('C60P002', N'Sản phẩm trigger B', 'C60-BAR-002', N'Cái', 12000, 0, 'C60CAT01', 'ACTIVE'),
    ('C60P003', N'Sản phẩm trigger C', 'C60-BAR-003', N'Cái', 15000, 0, 'C60CAT01', 'ACTIVE');

INSERT INTO dbo.LO_HANG (
    MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
)
VALUES
    ('C60LFREE', 'C60P001', 'C60-FREE', '2026-01-01', '2099-12-31', 5000, 0, 'ACTIVE'),
    ('C60LHIST', 'C60P001', 'C60-HIST', '2026-01-01', '2099-12-31', 5000, 5, 'ACTIVE'),
    ('C60LMULT', 'C60P001', 'C60-MULTI', '2026-01-01', '2099-12-31', 5000, 0, 'ACTIVE'),
    ('C60LRD01', 'C60P001', 'C60-RD-01', '2026-01-01', '2099-12-31', 5000, 0, 'ACTIVE'),
    ('C60LRD02', 'C60P001', 'C60-RD-02', '2026-01-01', '2099-12-31', 5000, 0, 'ACTIVE'),
    ('C60LRC01', 'C60P001', 'C60-RC-01', '2026-01-01', '2099-12-31', 5000, 0, 'ACTIVE'),
    ('C60LRC02', 'C60P001', 'C60-RC-02', '2026-01-01', '2099-12-31', 5000, 0, 'ACTIVE'),
    ('C60LRC03', 'C60P002', 'C60-RC-03', '2026-01-01', '2099-12-31', 6000, 0, 'ACTIVE'),
    ('C60LRX01', 'C60P001', 'C60-RX-01', '2026-01-01', '2099-12-31', 5000, 0, 'ACTIVE'),
    ('C60LSALE', 'C60P001', 'C60-SALE', '2026-01-01', '2099-12-31', 5000, 20, 'ACTIVE');
GO

-- Existing audit trigger: valid INSERT plus multi-row UPDATE/DELETE rejection.
DECLARE @AuditUpdateRejected BIT = 0;
DECLARE @AuditDeleteRejected BIT = 0;

EXECUTE AS USER = 'C60TriggerDmlTestUser';

INSERT INTO dbo.NHAT_KY_HE_THONG (HanhDong, TenBang, MaBanGhi, DuLieuMoi)
VALUES
    ('TRIGGER_TEST', 'NHAT_KY_HE_THONG', 'C60AUD001', N'{"state":"created"}'),
    ('TRIGGER_TEST', 'NHAT_KY_HE_THONG', 'C60AUD002', N'{"state":"created"}');

BEGIN TRY
    UPDATE dbo.NHAT_KY_HE_THONG
    SET HanhDong = 'MUTATED'
    WHERE MaBanGhi IN ('C60AUD001', 'C60AUD002');
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 51820 SET @AuditUpdateRejected = 1 ELSE THROW;
END CATCH;

BEGIN TRY
    DELETE FROM dbo.NHAT_KY_HE_THONG
    WHERE MaBanGhi IN ('C60AUD001', 'C60AUD002');
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 51820 SET @AuditDeleteRejected = 1 ELSE THROW;
END CATCH;

REVERT;

IF @AuditUpdateRejected = 0 OR @AuditDeleteRejected = 0
   OR (SELECT COUNT(*) FROM dbo.NHAT_KY_HE_THONG WHERE MaBanGhi LIKE 'C60AUD%') <> 2
   OR EXISTS (SELECT 1 FROM dbo.NHAT_KY_HE_THONG WHERE MaBanGhi LIKE 'C60AUD%' AND HanhDong <> 'TRIGGER_TEST')
    THROW 53302, 'The existing audit append-only trigger failed insert or multi-row protection.', 1;
GO

-- Inventory movement ledger: INSERT is valid; all UPDATE/DELETE statements are rejected atomically.
DECLARE @MovementUpdateRejected BIT = 0;
DECLARE @MovementDeleteRejected BIT = 0;
DECLARE @MovementMultiUpdateRejected BIT = 0;
DECLARE @MovementMultiDeleteRejected BIT = 0;

EXECUTE AS USER = 'C60TriggerDmlTestUser';

INSERT INTO dbo.GIAO_DICH_KHO (
    MaLo, LoaiGiaoDich, SoLuongBienDong, ThoiGian, MaThamChieu, MaNV, GhiChu
)
VALUES
    ('C60LHIST', 'IMPORT', 2, '2026-10-15T01:00:00', 'C60MOV001', 'C60NV001', N'Movement C60 số 1'),
    ('C60LHIST', 'ADJUSTMENT', -1, '2026-10-15T01:01:00', 'C60MOV002', 'C60NV001', N'Movement C60 số 2');

BEGIN TRY
    UPDATE dbo.GIAO_DICH_KHO SET GhiChu = N'Không hợp lệ' WHERE MaThamChieu = 'C60MOV001';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 53200 SET @MovementUpdateRejected = 1 ELSE THROW;
END CATCH;

BEGIN TRY
    DELETE FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'C60MOV001';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 53200 SET @MovementDeleteRejected = 1 ELSE THROW;
END CATCH;

BEGIN TRY
    UPDATE dbo.GIAO_DICH_KHO SET GhiChu = N'Multi-row invalid' WHERE MaThamChieu LIKE 'C60MOV%';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 53200 SET @MovementMultiUpdateRejected = 1 ELSE THROW;
END CATCH;

BEGIN TRY
    DELETE FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu LIKE 'C60MOV%';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 53200 SET @MovementMultiDeleteRejected = 1 ELSE THROW;
END CATCH;

REVERT;

IF @MovementUpdateRejected = 0 OR @MovementDeleteRejected = 0
   OR @MovementMultiUpdateRejected = 0 OR @MovementMultiDeleteRejected = 0
   OR (SELECT COUNT(*) FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu LIKE 'C60MOV%') <> 2
   OR EXISTS (SELECT 1 FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu LIKE 'C60MOV%' AND GhiChu LIKE N'%invalid%')
    THROW 53303, 'The inventory movement append-only trigger failed single-row or multi-row atomic protection.', 1;
GO

-- Receipt lines are mutable only while the parent receipt is DRAFT.
INSERT INTO dbo.PHIEU_NHAP (MaPN, NgayNhap, MaNV, MaNCC, TongTien, TrangThai)
VALUES
    ('C60PND01', '2026-10-15T02:00:00', 'C60NV001', 'NCCDEV001', 0, 'DRAFT'),
    ('C60PNC01', '2026-10-15T02:01:00', 'C60NV001', 'NCCDEV001', 10000, 'DRAFT'),
    ('C60PNX01', '2026-10-15T02:02:00', 'C60NV001', 'NCCDEV001', 5000, 'DRAFT');

INSERT INTO dbo.CHI_TIET_PHIEU_NHAP (MaPN, MaLo, SoLuong, DonGiaNhap)
VALUES
    ('C60PNC01', 'C60LRC01', 1, 5000),
    ('C60PNC01', 'C60LRC02', 1, 5000),
    ('C60PNX01', 'C60LRX01', 1, 5000);

UPDATE dbo.PHIEU_NHAP SET TrangThai = 'CONFIRMED', NgayXacNhan = '2026-10-15T02:10:00' WHERE MaPN = 'C60PNC01';
UPDATE dbo.PHIEU_NHAP SET TrangThai = 'CANCELLED' WHERE MaPN = 'C60PNX01';
GO

DECLARE @ReceiptConfirmedInsertRejected BIT = 0;
DECLARE @ReceiptConfirmedUpdateRejected BIT = 0;
DECLARE @ReceiptConfirmedDeleteRejected BIT = 0;
DECLARE @ReceiptCancelledRejected BIT = 0;
DECLARE @ReceiptMultiRejected BIT = 0;

EXECUTE AS USER = 'C60TriggerDmlTestUser';

INSERT INTO dbo.CHI_TIET_PHIEU_NHAP (MaPN, MaLo, SoLuong, DonGiaNhap)
VALUES ('C60PND01', 'C60LRD01', 1, 5000);
UPDATE dbo.CHI_TIET_PHIEU_NHAP SET SoLuong = 2 WHERE MaPN = 'C60PND01' AND MaLo = 'C60LRD01';
DELETE FROM dbo.CHI_TIET_PHIEU_NHAP WHERE MaPN = 'C60PND01' AND MaLo = 'C60LRD01';

BEGIN TRY
    INSERT INTO dbo.CHI_TIET_PHIEU_NHAP (MaPN, MaLo, SoLuong, DonGiaNhap)
    VALUES ('C60PNC01', 'C60LRC03', 1, 6000);
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 53201 SET @ReceiptConfirmedInsertRejected = 1 ELSE THROW;
END CATCH;

BEGIN TRY
    UPDATE dbo.CHI_TIET_PHIEU_NHAP SET SoLuong = 9 WHERE MaPN = 'C60PNC01' AND MaLo = 'C60LRC01';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 53201 SET @ReceiptConfirmedUpdateRejected = 1 ELSE THROW;
END CATCH;

BEGIN TRY
    DELETE FROM dbo.CHI_TIET_PHIEU_NHAP WHERE MaPN = 'C60PNC01' AND MaLo = 'C60LRC01';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 53201 SET @ReceiptConfirmedDeleteRejected = 1 ELSE THROW;
END CATCH;

BEGIN TRY
    UPDATE dbo.CHI_TIET_PHIEU_NHAP SET SoLuong = SoLuong + 1 WHERE MaPN = 'C60PNC01';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 53201 SET @ReceiptMultiRejected = 1 ELSE THROW;
END CATCH;

BEGIN TRY
    UPDATE dbo.CHI_TIET_PHIEU_NHAP SET SoLuong = 3 WHERE MaPN = 'C60PNX01';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 53201 SET @ReceiptCancelledRejected = 1 ELSE THROW;
END CATCH;

REVERT;

IF @ReceiptConfirmedInsertRejected = 0 OR @ReceiptConfirmedUpdateRejected = 0
   OR @ReceiptConfirmedDeleteRejected = 0 OR @ReceiptCancelledRejected = 0 OR @ReceiptMultiRejected = 0
   OR (SELECT COUNT(*) FROM dbo.CHI_TIET_PHIEU_NHAP WHERE MaPN = 'C60PNC01') <> 2
   OR EXISTS (SELECT 1 FROM dbo.CHI_TIET_PHIEU_NHAP WHERE MaPN = 'C60PNC01' AND SoLuong <> 1)
   OR EXISTS (SELECT 1 FROM dbo.CHI_TIET_PHIEU_NHAP WHERE MaPN = 'C60PND01')
    THROW 53304, 'The receipt DRAFT guard failed valid-state, finalized-state or multi-row behavior.', 1;
GO

-- The official receiving workflow must still pass for an application principal.
EXECUTE AS USER = 'C60TriggerDmlTestUser';
EXEC dbo.usp_PHIEU_NHAP_LuuNhap
    @MaPN = 'C60PNOFF', @MaNV = 'C60NV001', @MaNCC = 'NCCDEV001', @NgayNhap = '2026-10-15T03:00:00';
EXEC dbo.usp_CHI_TIET_PHIEU_NHAP_LuuNhap
    @MaPN = 'C60PNOFF', @MaLo = 'C60LROFF', @MaSP = 'C60P002', @SoLo = 'C60-R-OFFICIAL',
    @NgaySanXuat = '2026-01-01', @HanSuDung = '2099-12-31', @SoLuong = 3, @DonGiaNhap = 6000;
EXEC dbo.usp_PHIEU_NHAP_XacNhan @MaPN = 'C60PNOFF';
REVERT;

IF NOT EXISTS (SELECT 1 FROM dbo.PHIEU_NHAP WHERE MaPN = 'C60PNOFF' AND TrangThai = 'CONFIRMED')
   OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C60LROFF' AND SoLuongTon = 3)
   OR NOT EXISTS (SELECT 1 FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'C60PNOFF' AND LoaiGiaoDich = 'IMPORT')
    THROW 53305, 'The official receiving workflow is not compatible with the business triggers.', 1;
GO

-- Invoice lines are mutable only while the invoice is DRAFT.
INSERT INTO dbo.CA_LAM_VIEC (MaNV, GioBatDau, TienDauCa, TrangThai)
VALUES ('C60NV001', '2026-10-15T04:00:00', 0, 'OPEN');

DECLARE @C60ShiftId BIGINT = SCOPE_IDENTITY();

INSERT INTO dbo.HOA_DON (
    MaHD, NgayLap, MaCa, TongTienHang, TongGiamGia, TongThanhToan, DiemSuDung, DiemTichLuy, TrangThai
)
VALUES
    ('C60HDD01', '2026-10-15T04:01:00', @C60ShiftId, 0, 0, 0, 0, 0, 'DRAFT'),
    ('C60HDP01', '2026-10-15T04:02:00', @C60ShiftId, 22000, 0, 22000, 0, 0, 'DRAFT'),
    ('C60HDR01', '2026-10-15T04:03:00', @C60ShiftId, 10000, 0, 10000, 0, 0, 'DRAFT');

INSERT INTO dbo.CHI_TIET_HOA_DON (MaHD, MaSP, SoLuong, DonGiaBan, TienGiam)
VALUES
    ('C60HDP01', 'C60P001', 1, 10000, 0),
    ('C60HDP01', 'C60P002', 1, 12000, 0),
    ('C60HDR01', 'C60P001', 1, 10000, 0);

UPDATE dbo.HOA_DON SET TrangThai = 'PAID' WHERE MaHD = 'C60HDP01';
UPDATE dbo.HOA_DON SET TrangThai = 'REFUNDED' WHERE MaHD = 'C60HDR01';
GO

DECLARE @InvoicePaidInsertRejected BIT = 0;
DECLARE @InvoicePaidUpdateRejected BIT = 0;
DECLARE @InvoicePaidDeleteRejected BIT = 0;
DECLARE @InvoiceRefundedRejected BIT = 0;
DECLARE @InvoiceMultiRejected BIT = 0;

EXECUTE AS USER = 'C60TriggerDmlTestUser';

INSERT INTO dbo.CHI_TIET_HOA_DON (MaHD, MaSP, SoLuong, DonGiaBan, TienGiam)
VALUES ('C60HDD01', 'C60P001', 1, 10000, 0);
UPDATE dbo.CHI_TIET_HOA_DON SET SoLuong = 2 WHERE MaHD = 'C60HDD01';
DELETE FROM dbo.CHI_TIET_HOA_DON WHERE MaHD = 'C60HDD01';

BEGIN TRY
    INSERT INTO dbo.CHI_TIET_HOA_DON (MaHD, MaSP, SoLuong, DonGiaBan, TienGiam)
    VALUES ('C60HDP01', 'C60P003', 1, 15000, 0);
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 53202 SET @InvoicePaidInsertRejected = 1 ELSE THROW;
END CATCH;

BEGIN TRY
    UPDATE dbo.CHI_TIET_HOA_DON SET SoLuong = 9 WHERE MaHD = 'C60HDP01' AND MaSP = 'C60P001';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 53202 SET @InvoicePaidUpdateRejected = 1 ELSE THROW;
END CATCH;

BEGIN TRY
    DELETE FROM dbo.CHI_TIET_HOA_DON WHERE MaHD = 'C60HDP01' AND MaSP = 'C60P001';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 53202 SET @InvoicePaidDeleteRejected = 1 ELSE THROW;
END CATCH;

BEGIN TRY
    UPDATE dbo.CHI_TIET_HOA_DON SET TienGiam = 1 WHERE MaHD = 'C60HDP01';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 53202 SET @InvoiceMultiRejected = 1 ELSE THROW;
END CATCH;

BEGIN TRY
    UPDATE dbo.CHI_TIET_HOA_DON SET SoLuong = 2 WHERE MaHD = 'C60HDR01';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 53202 SET @InvoiceRefundedRejected = 1 ELSE THROW;
END CATCH;

REVERT;

IF @InvoicePaidInsertRejected = 0 OR @InvoicePaidUpdateRejected = 0
   OR @InvoicePaidDeleteRejected = 0 OR @InvoiceRefundedRejected = 0 OR @InvoiceMultiRejected = 0
   OR (SELECT COUNT(*) FROM dbo.CHI_TIET_HOA_DON WHERE MaHD = 'C60HDP01') <> 2
   OR EXISTS (SELECT 1 FROM dbo.CHI_TIET_HOA_DON WHERE MaHD = 'C60HDP01' AND (SoLuong <> 1 OR TienGiam <> 0))
   OR EXISTS (SELECT 1 FROM dbo.CHI_TIET_HOA_DON WHERE MaHD = 'C60HDD01')
    THROW 53306, 'The invoice DRAFT guard failed valid-state, finalized-state or multi-row behavior.', 1;
GO

-- Official checkout and return both execute with triggers enabled as the test application principal.
DECLARE @OfficialShiftId BIGINT = (SELECT MaCa FROM dbo.CA_LAM_VIEC WHERE MaNV = 'C60NV001' AND TrangThai = 'OPEN');

EXECUTE AS USER = 'C60TriggerDmlTestUser';
EXEC dbo.usp_HOA_DON_HoanTatBanHang
    @MaHD = 'C60HDOFF', @MaCa = @OfficialShiftId,
    @DanhSachSanPham = N'[{"MaSP":"C60P001","SoLuong":2}]',
    @PhuongThuc = 'CASH', @SoTienThanhToan = 20000;
REVERT;

DECLARE @OfficialLineId BIGINT = (
    SELECT MaCTHD FROM dbo.CHI_TIET_HOA_DON WHERE MaHD = 'C60HDOFF' AND MaSP = 'C60P001'
);
DECLARE @OfficialLotCode VARCHAR(20) = (
    SELECT TOP (1) MaLo FROM dbo.CHI_TIET_XUAT_LO WHERE MaCTHD = @OfficialLineId ORDER BY MaLo
);
DECLARE @OfficialReturnJson NVARCHAR(MAX) = CONCAT(
    N'[{"MaCTHD":', @OfficialLineId, N',"MaLo":"', @OfficialLotCode,
    N'","SoLuongTra":1,"TinhTrangHang":"RESALABLE"}]'
);

EXECUTE AS USER = 'C60TriggerDmlTestUser';
EXEC dbo.usp_PHIEU_TRA_HoanTat
    @MaPT = 'C60PTOFF', @MaHD = 'C60HDOFF', @MaNV = 'C60NV001',
    @LyDo = N'Kiểm thử tương thích trigger', @DanhSachHangTra = @OfficialReturnJson;
REVERT;

IF NOT EXISTS (SELECT 1 FROM dbo.HOA_DON WHERE MaHD = 'C60HDOFF' AND TrangThai = 'PAID')
   OR NOT EXISTS (SELECT 1 FROM dbo.PHIEU_TRA WHERE MaPT = 'C60PTOFF' AND TrangThai = 'COMPLETED')
   OR NOT EXISTS (SELECT 1 FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'C60HDOFF' AND LoaiGiaoDich = 'SALE')
   OR NOT EXISTS (SELECT 1 FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'C60PTOFF' AND LoaiGiaoDich = 'RETURN')
    THROW 53307, 'Official checkout or return is not compatible with the business triggers.', 1;
GO

-- Lot product reassignment is allowed before history and immutable afterwards.
DECLARE @HistoricalLotRejected BIT = 0;
DECLARE @ConfirmedReceiptLotRejected BIT = 0;
DECLARE @MixedMultiLotRejected BIT = 0;

EXECUTE AS USER = 'C60TriggerDmlTestUser';

UPDATE dbo.LO_HANG SET MaSP = 'C60P002' WHERE MaLo = 'C60LFREE';

BEGIN TRY
    UPDATE dbo.LO_HANG SET MaSP = 'C60P002' WHERE MaLo = 'C60LHIST';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 53203 SET @HistoricalLotRejected = 1 ELSE THROW;
END CATCH;

BEGIN TRY
    UPDATE dbo.LO_HANG SET MaSP = 'C60P002' WHERE MaLo = 'C60LRC01';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 53203 SET @ConfirmedReceiptLotRejected = 1 ELSE THROW;
END CATCH;

BEGIN TRY
    UPDATE dbo.LO_HANG
    SET MaSP = 'C60P003'
    WHERE MaLo IN ('C60LHIST', 'C60LMULT');
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 53203 SET @MixedMultiLotRejected = 1 ELSE THROW;
END CATCH;

REVERT;

IF @HistoricalLotRejected = 0 OR @ConfirmedReceiptLotRejected = 0 OR @MixedMultiLotRejected = 0
   OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C60LFREE' AND MaSP = 'C60P002')
   OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C60LHIST' AND MaSP = 'C60P001')
   OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C60LMULT' AND MaSP = 'C60P001')
   OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C60LRC01' AND MaSP = 'C60P001')
    THROW 53308, 'The lot-product history guard failed pre-history, historical or mixed multi-row atomic behavior.', 1;
GO

-- Cleanup is privileged maintenance; the application principal never bypasses a trigger.
DELETE FROM dbo.NHAT_KY_HE_THONG WHERE MaBanGhi LIKE 'C60%';
DELETE FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu LIKE 'C60%';
DELETE return_line
FROM dbo.CHI_TIET_PHIEU_TRA AS return_line
JOIN dbo.PHIEU_TRA AS return_header ON return_header.MaPT = return_line.MaPT
WHERE return_header.MaPT LIKE 'C60%';
DELETE FROM dbo.PHIEU_TRA WHERE MaPT LIKE 'C60%';
DELETE FROM dbo.THANH_TOAN WHERE MaHD LIKE 'C60%';
DELETE allocation
FROM dbo.CHI_TIET_XUAT_LO AS allocation
JOIN dbo.CHI_TIET_HOA_DON AS invoice_line ON invoice_line.MaCTHD = allocation.MaCTHD
WHERE invoice_line.MaHD LIKE 'C60%';
DELETE FROM dbo.CHI_TIET_HOA_DON WHERE MaHD LIKE 'C60%';
DELETE FROM dbo.HOA_DON WHERE MaHD LIKE 'C60%';
DELETE FROM dbo.CA_LAM_VIEC WHERE MaNV = 'C60NV001';
DELETE FROM dbo.TAI_KHOAN WHERE MaNV = 'C60NV001';
DELETE FROM dbo.CHI_TIET_PHIEU_NHAP WHERE MaPN LIKE 'C60%';
DELETE FROM dbo.PHIEU_NHAP WHERE MaPN LIKE 'C60%';
DELETE FROM dbo.CHI_TIET_KIEM_KE WHERE MaKK LIKE 'C60%';
DELETE FROM dbo.KIEM_KE WHERE MaKK LIKE 'C60%';
DELETE FROM dbo.LO_HANG WHERE MaLo LIKE 'C60%';
DELETE FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C60%';
DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'C60CAT01';
DELETE FROM dbo.NHAN_VIEN WHERE MaNV = 'C60NV001';
DROP USER C60TriggerDmlTestUser;
GO

IF EXISTS (SELECT 1 FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu LIKE 'C60%')
   OR EXISTS (SELECT 1 FROM dbo.PHIEU_NHAP WHERE MaPN LIKE 'C60%')
   OR EXISTS (SELECT 1 FROM dbo.HOA_DON WHERE MaHD LIKE 'C60%')
   OR EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo LIKE 'C60%')
   OR DATABASE_PRINCIPAL_ID('C60TriggerDmlTestUser') IS NOT NULL
    THROW 53309, 'C60 trigger fixtures or temporary test principal were not cleaned up.', 1;
GO

PRINT 'C60 trigger tests passed: five enabled triggers, direct-DML guards, multi-row atomicity and official workflow compatibility.';
GO
