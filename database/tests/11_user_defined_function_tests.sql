:ON ERROR EXIT

SET NOCOUNT ON;
SET XACT_ABORT OFF;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF DB_NAME() IN ('master', 'model', 'msdb', 'tempdb')
    THROW 53100, 'UDF tests refuse to run in a SQL Server system database.', 1;

IF (
    SELECT COUNT(*)
    FROM sys.objects
    WHERE schema_id = SCHEMA_ID(N'dbo')
      AND type IN ('FN', 'IF', 'TF')
) <> 5
    THROW 53101, 'Exactly five dbo UDFs must exist before the function suite runs.', 1;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @ReferenceDate DATE = '2026-10-15';

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.ufn_LO_HANG_PhanLoaiHanDung('2026-10-14', 'ACTIVE', @ReferenceDate, 30)
        WHERE TinhTrangHanDung = 'EXPIRED' AND SoNgayConLai = -1
    )
        THROW 53102, 'Expiry classification failed for an expired lot.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.ufn_LO_HANG_PhanLoaiHanDung('2026-10-15', 'ACTIVE', @ReferenceDate, 30)
        WHERE TinhTrangHanDung = 'EXPIRED' AND SoNgayConLai = 0
    )
        THROW 53103, 'Expiry classification failed at the reference-date boundary.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.ufn_LO_HANG_PhanLoaiHanDung('2026-11-14', 'ACTIVE', @ReferenceDate, 30)
        WHERE TinhTrangHanDung = 'NEAR_EXPIRY' AND SoNgayConLai = 30
    )
        THROW 53104, 'Expiry classification failed at the near-expiry boundary.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.ufn_LO_HANG_PhanLoaiHanDung(NULL, 'ACTIVE', @ReferenceDate, 30)
        WHERE TinhTrangHanDung = 'VALID' AND SoNgayConLai IS NULL
    )
        THROW 53105, 'A lot without an expiry date must remain VALID with unknown days remaining.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.ufn_LO_HANG_PhanLoaiHanDung('2026-12-01', 'ACTIVE', NULL, 30)
        WHERE TinhTrangHanDung IS NULL AND SoNgayConLai IS NULL
    )
        THROW 53106, 'NULL reference-date behavior is not explicit.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.ufn_LO_HANG_PhanLoaiHanDung('2026-12-01', 'ACTIVE', @ReferenceDate, -1)
        WHERE TinhTrangHanDung IS NULL
    )
        THROW 53115, 'Invalid near-expiry threshold behavior is not explicit.', 1;

    INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, TrangThai)
    VALUES ('C51CAT', N'C51 Function Category', 'ACTIVE');

    INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, MaVach, DonViTinh, GiaBan, MucTonToiThieu, MaLoai, TrangThai
    ) VALUES
        ('C51P001', N'C51 Sellable', 'C5100001', N'Cái', 20000, 12, 'C51CAT', 'ACTIVE'),
        ('C51P002', N'C51 Inactive', 'C5100002', N'Cái', 15000, 1, 'C51CAT', 'INACTIVE');

    INSERT INTO dbo.LO_HANG (
        MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
    ) VALUES
        ('C51LOT001', 'C51P001', 'C51-EXPIRED', '2026-01-01', '2026-10-15', 10000, 2, 'ACTIVE'),
        ('C51LOT002', 'C51P001', 'C51-NEAR', '2026-01-01', '2026-11-14', 10000, 3, 'ACTIVE'),
        ('C51LOT003', 'C51P001', 'C51-VALID', '2026-01-01', '2027-01-01', 10000, 4, 'ACTIVE'),
        ('C51LOT004', 'C51P001', 'C51-NO-EXPIRY', '2026-01-01', NULL, 10000, 5, 'ACTIVE'),
        ('C51LOT005', 'C51P001', 'C51-BLOCKED', '2026-01-01', '2027-01-01', 10000, 6, 'BLOCKED'),
        ('C51LOT006', 'C51P002', 'C51-INACTIVE-PRODUCT', '2026-01-01', '2027-01-01', 9000, 7, 'ACTIVE');

    IF (SELECT COUNT(*) FROM dbo.ufn_LO_HANG_TheoSanPham('C51P001', @ReferenceDate, 30)) <> 5
       OR NOT EXISTS (
           SELECT 1 FROM dbo.ufn_LO_HANG_TheoSanPham('C51P001', @ReferenceDate, 30)
           WHERE MaLo = 'C51LOT002' AND TinhTrangHanDung = 'NEAR_EXPIRY' AND SoNgayConLai = 30
       )
        THROW 53107, 'Product-lot function did not return the expected classified lots.', 1;

    IF EXISTS (SELECT 1 FROM dbo.ufn_LO_HANG_TheoSanPham('C51P001', NULL, 30))
       OR EXISTS (SELECT 1 FROM dbo.ufn_LO_HANG_TheoSanPham('C51P001', @ReferenceDate, -1))
        THROW 53108, 'Product-lot function must return no rows for invalid reference inputs.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.ufn_TON_KHO_TheoSanPham('C51P001', @ReferenceDate, 30)
        WHERE TongTon = 20
          AND TongTonKhaDung = 12
          AND TongTonCanHan = 3
          AND TongTonHetHan = 2
          AND TongTonBiKhoa = 6
          AND SoLoConTon = 5
          AND SoLoCanHan = 1
          AND SoLoHetHan = 1
    )
        THROW 53109, 'Inventory-summary function returned incorrect product metrics.', 1;

    IF EXISTS (
        SELECT 1 FROM dbo.ufn_TON_KHO_TheoSanPham('C51MISSING', @ReferenceDate, 30)
    )
        THROW 53110, 'Inventory-summary function must return no row for an unknown product.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.ufn_SAN_PHAM_CoTheBan(@ReferenceDate)
        WHERE MaSP = 'C51P001' AND TonKhaDung = 12
    )
       OR EXISTS (
           SELECT 1 FROM dbo.ufn_SAN_PHAM_CoTheBan(@ReferenceDate) WHERE MaSP = 'C51P002'
       )
       OR EXISTS (SELECT 1 FROM dbo.ufn_SAN_PHAM_CoTheBan(NULL))
        THROW 53111, 'Sellable-product function failed active, stock or NULL-date behavior.', 1;

    INSERT INTO dbo.CA_LAM_VIEC (MaNV, GioBatDau, GioKetThuc, TienDauCa, TienCuoiCa, TrangThai)
    VALUES ('NVDEV001', '2026-10-15T01:00:00', '2026-10-15T09:00:00', 0, 0, 'CLOSED');

    DECLARE @ShiftId BIGINT = SCOPE_IDENTITY();

    INSERT INTO dbo.HOA_DON (
        MaHD, NgayLap, MaCa, TongTienHang, TongGiamGia,
        TongThanhToan, DiemSuDung, DiemTichLuy, TrangThai
    ) VALUES ('C51INV001', '2026-10-15T02:00:00', @ShiftId, 100000, 0, 100000, 0, 0, 'PAID');

    INSERT INTO dbo.CHI_TIET_HOA_DON (MaHD, MaSP, SoLuong, DonGiaBan, TienGiam)
    VALUES ('C51INV001', 'C51P001', 5, 20000, 0);

    DECLARE @InvoiceLineId BIGINT = SCOPE_IDENTITY();

    INSERT INTO dbo.CHI_TIET_XUAT_LO (MaCTHD, MaLo, SoLuong)
    VALUES (@InvoiceLineId, 'C51LOT003', 5);

    INSERT INTO dbo.PHIEU_TRA (MaPT, MaHD, MaNV, NgayTra, LyDo, TongTienHoan, TrangThai)
    VALUES
        ('C51RET001', 'C51INV001', 'NVDEV001', '2026-10-15T03:00:00', N'Completed fixture', 40000, 'COMPLETED'),
        ('C51RET002', 'C51INV001', 'NVDEV001', '2026-10-15T04:00:00', N'Created fixture', 20000, 'CREATED');

    INSERT INTO dbo.CHI_TIET_PHIEU_TRA (
        MaPT, MaCTHD, MaLo, SoLuongTra, TienHoan, TinhTrangHang
    ) VALUES
        ('C51RET001', @InvoiceLineId, 'C51LOT003', 2, 40000, 'RESALABLE'),
        ('C51RET002', @InvoiceLineId, 'C51LOT003', 1, 20000, 'RESALABLE');

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.ufn_HOA_DON_PhanBoCoTheTra('C51INV001')
        WHERE MaCTHD = @InvoiceLineId
          AND MaLo = 'C51LOT003'
          AND SoLuongXuat = 5
          AND SoLuongDaTra = 2
          AND SoLuongConLaiCoTheTra = 3
    )
        THROW 53112, 'Returnable-allocation function did not ignore non-completed returns correctly.', 1;

    IF EXISTS (SELECT 1 FROM dbo.ufn_HOA_DON_PhanBoCoTheTra(NULL))
       OR EXISTS (SELECT 1 FROM dbo.ufn_HOA_DON_PhanBoCoTheTra('C51MISSING'))
        THROW 53113, 'Returnable-allocation function must return no rows for NULL or unknown invoices.', 1;

    ROLLBACK TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

IF EXISTS (SELECT 1 FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C51%')
   OR EXISTS (SELECT 1 FROM dbo.HOA_DON WHERE MaHD = 'C51INV001')
    THROW 53114, 'UDF test fixtures were not rolled back completely.', 1;

-- Demo-friendly, read-only examples.
SELECT *
FROM dbo.ufn_LO_HANG_PhanLoaiHanDung('2026-11-14', 'ACTIVE', '2026-10-15', 30);

SELECT *
FROM dbo.ufn_TON_KHO_TheoSanPham('SPDEV001', '2026-10-15', 30);
GO

PRINT 'UDF tests passed: all five functions satisfy happy-path, boundary, NULL and invalid-input contracts.';
GO
