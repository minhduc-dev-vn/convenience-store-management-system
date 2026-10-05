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
    ('vw_KIEM_KE_CHI_TIET', 'V'),
    ('usp_KIEM_KE_Tao', 'P'),
    ('usp_CHI_TIET_KIEM_KE_GhiNhan', 'P'),
    ('usp_KIEM_KE_PheDuyetDieuChinh', 'P');

IF EXISTS (
    SELECT 1
    FROM @RequiredObjects AS required
    WHERE OBJECT_ID(N'dbo.' + required.ObjectName, required.ObjectType) IS NULL
)
    THROW 52700, 'One or more C39 stocktake objects are missing.', 1;

IF (
    SELECT COUNT(*) FROM sys.tables
    WHERE schema_id = SCHEMA_ID('dbo') AND name <> 'SCHEMA_MIGRATIONS'
) <> 23
    THROW 52701, 'C39 must preserve exactly 23 dbo core tables.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.KIEM_KE')
      AND name = 'CK_KIEM_KE_TrangThai'
      AND definition LIKE '%APPROVED%'
      AND definition NOT LIKE '%COMPLETED%'
)
    THROW 52702, 'C39 must retain the schema status domain with APPROVED and without COMPLETED.', 1;
GO

DROP TRIGGER IF EXISTS dbo.trg_C39_ForceAdjustmentFailure;
DELETE FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu LIKE 'C39KK%';
DELETE FROM dbo.CHI_TIET_KIEM_KE WHERE MaKK LIKE 'C39KK%';
DELETE FROM dbo.KIEM_KE WHERE MaKK LIKE 'C39KK%';
DELETE FROM dbo.LO_HANG WHERE MaLo LIKE 'C39L%';
DELETE FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C39P%';
DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'C39CAT01';
DELETE FROM dbo.NHAN_VIEN WHERE MaNV IN ('C39WH001', 'C39MG001');
GO

INSERT INTO dbo.NHAN_VIEN (
    MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai
)
VALUES
    ('C39WH001', N'Nhân viên kho C39', '0839000001', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE'),
    ('C39MG001', N'Quản lý C39', '0839000002', CONVERT(DATE, SYSDATETIME()), 0, 'ACTIVE');

INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, MoTa, TrangThai)
VALUES ('C39CAT01', N'Danh mục C39', N'Dữ liệu kiểm thử kiểm kê kho.', 'ACTIVE');

INSERT INTO dbo.SAN_PHAM (
    MaSP, TenSP, MaVach, DonViTinh, GiaBan,
    MucTonToiThieu, MaLoai, TrangThai
)
VALUES
    ('C39P001', N'Sản phẩm kiểm kê giảm', 'C39-BAR-001', N'Cái', 10000, 0, 'C39CAT01', 'ACTIVE'),
    ('C39P002', N'Sản phẩm kiểm kê tăng', 'C39-BAR-002', N'Cái', 12000, 0, 'C39CAT01', 'ACTIVE');

INSERT INTO dbo.LO_HANG (
    MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung,
    GiaNhap, SoLuongTon, TrangThai
)
VALUES
    ('C39L001', 'C39P001', 'C39-LOT-001', '2026-01-01', '2099-12-31', 5000, 10, 'ACTIVE'),
    ('C39L002', 'C39P002', 'C39-LOT-002', '2026-01-01', '2099-12-31', 6000, 5, 'ACTIVE');
GO

DECLARE @LotCountBefore INT = (SELECT COUNT(*) FROM dbo.LO_HANG);

EXEC dbo.usp_KIEM_KE_Tao
    @MaKK = 'C39KK001',
    @MaNV = 'C39WH001',
    @NgayKiemKe = '2026-10-03T08:00:00',
    @GhiChu = N'Kiểm kê C39';

IF NOT EXISTS (
    SELECT 1
    FROM dbo.KIEM_KE
    WHERE MaKK = 'C39KK001'
      AND MaNV = 'C39WH001'
      AND TrangThai = 'DRAFT'
)
   OR (SELECT COUNT(*) FROM dbo.CHI_TIET_KIEM_KE WHERE MaKK = 'C39KK001') <> @LotCountBefore
   OR NOT EXISTS (
       SELECT 1
       FROM dbo.CHI_TIET_KIEM_KE
       WHERE MaKK = 'C39KK001'
         AND MaLo = 'C39L001'
         AND SoLuongHeThong = 10
         AND SoLuongThucTe = 10
         AND ChenhLech = 0
   )
   OR NOT EXISTS (
       SELECT 1
       FROM dbo.CHI_TIET_KIEM_KE
       WHERE MaKK = 'C39KK001'
         AND MaLo = 'C39L002'
         AND SoLuongHeThong = 5
         AND SoLuongThucTe = 5
         AND ChenhLech = 0
   )
    THROW 52703, 'Stocktake creation did not persist a stable all-lot snapshot.', 1;

DECLARE @ConcurrentDraftRejected BIT = 0;

BEGIN TRY
    EXEC dbo.usp_KIEM_KE_Tao @MaKK = 'C39KK099', @MaNV = 'C39WH001';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 51704
        SET @ConcurrentDraftRejected = 1;
    ELSE
        THROW;
END CATCH;

IF @ConcurrentDraftRejected = 0
   OR EXISTS (SELECT 1 FROM dbo.KIEM_KE WHERE MaKK = 'C39KK099')
    THROW 52704, 'A concurrent DRAFT stocktake was accepted.', 1;

DECLARE @DuplicateLotRejected BIT = 0;

BEGIN TRY
    INSERT INTO dbo.CHI_TIET_KIEM_KE (
        MaKK, MaLo, SoLuongHeThong, SoLuongThucTe, LyDo
    )
    VALUES ('C39KK001', 'C39L001', 10, 10, NULL);
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() IN (2601, 2627)
        SET @DuplicateLotRejected = 1;
    ELSE
        THROW;
END CATCH;

IF @DuplicateLotRejected = 0
    THROW 52705, 'Duplicate (MaKK, MaLo) stocktake detail was accepted.', 1;

UPDATE dbo.LO_HANG SET SoLuongTon = 11 WHERE MaLo = 'C39L001';

IF NOT EXISTS (
    SELECT 1
    FROM dbo.CHI_TIET_KIEM_KE
    WHERE MaKK = 'C39KK001'
      AND MaLo = 'C39L001'
      AND SoLuongHeThong = 10
)
    THROW 52706, 'Persisted stocktake snapshot changed with live inventory.', 1;

UPDATE dbo.LO_HANG SET SoLuongTon = 10 WHERE MaLo = 'C39L001';

DECLARE @MissingReasonRejected BIT = 0;

BEGIN TRY
    EXEC dbo.usp_CHI_TIET_KIEM_KE_GhiNhan
        @MaKK = 'C39KK001', @MaLo = 'C39L001', @SoLuongThucTe = 7;
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 51711
        SET @MissingReasonRejected = 1;
    ELSE
        THROW;
END CATCH;

IF @MissingReasonRejected = 0
   OR NOT EXISTS (
       SELECT 1 FROM dbo.CHI_TIET_KIEM_KE
       WHERE MaKK = 'C39KK001' AND MaLo = 'C39L001'
         AND SoLuongThucTe = 10 AND ChenhLech = 0
   )
    THROW 52707, 'A discrepancy without reason was accepted or changed the saved count.', 1;

EXEC dbo.usp_CHI_TIET_KIEM_KE_GhiNhan
    @MaKK = 'C39KK001', @MaLo = 'C39L001',
    @SoLuongThucTe = 7, @LyDo = N'Hàng hư hỏng';

EXEC dbo.usp_CHI_TIET_KIEM_KE_GhiNhan
    @MaKK = 'C39KK001', @MaLo = 'C39L002',
    @SoLuongThucTe = 8, @LyDo = N'Phát hiện hàng chưa ghi nhận';

IF NOT EXISTS (
    SELECT 1 FROM dbo.vw_KIEM_KE_CHI_TIET
    WHERE MaKK = 'C39KK001' AND MaLo = 'C39L001'
      AND SoLuongHeThong = 10 AND SoLuongThucTe = 7 AND ChenhLech = -3
      AND SnapshotDaThayDoi = 0
)
   OR NOT EXISTS (
       SELECT 1 FROM dbo.vw_KIEM_KE_CHI_TIET
       WHERE MaKK = 'C39KK001' AND MaLo = 'C39L002'
         AND SoLuongHeThong = 5 AND SoLuongThucTe = 8 AND ChenhLech = 3
         AND SnapshotDaThayDoi = 0
   )
    THROW 52708, 'Saved counts or computed discrepancies are incorrect.', 1;

EXEC dbo.usp_KIEM_KE_PheDuyetDieuChinh
    @MaKK = 'C39KK001', @MaNV = 'C39MG001';

IF NOT EXISTS (SELECT 1 FROM dbo.KIEM_KE WHERE MaKK = 'C39KK001' AND TrangThai = 'APPROVED')
   OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C39L001' AND SoLuongTon = 7)
   OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C39L002' AND SoLuongTon = 8)
   OR (SELECT COUNT(*) FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'C39KK001') <> 2
   OR NOT EXISTS (
       SELECT 1 FROM dbo.GIAO_DICH_KHO
       WHERE MaThamChieu = 'C39KK001' AND MaLo = 'C39L001'
         AND LoaiGiaoDich = 'ADJUSTMENT' AND SoLuongBienDong = -3 AND MaNV = 'C39MG001'
   )
   OR NOT EXISTS (
       SELECT 1 FROM dbo.GIAO_DICH_KHO
       WHERE MaThamChieu = 'C39KK001' AND MaLo = 'C39L002'
         AND LoaiGiaoDich = 'ADJUSTMENT' AND SoLuongBienDong = 3 AND MaNV = 'C39MG001'
   )
    THROW 52709, 'Approval did not atomically apply signed ADJUSTMENT movements and APPROVED status.', 1;

DECLARE @EditApprovedRejected BIT = 0;

BEGIN TRY
    EXEC dbo.usp_CHI_TIET_KIEM_KE_GhiNhan
        @MaKK = 'C39KK001', @MaLo = 'C39L001',
        @SoLuongThucTe = 6, @LyDo = N'Không được sửa';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 51709
        SET @EditApprovedRejected = 1;
    ELSE
        THROW;
END CATCH;

DECLARE @DoubleApprovalRejected BIT = 0;

BEGIN TRY
    EXEC dbo.usp_KIEM_KE_PheDuyetDieuChinh
        @MaKK = 'C39KK001', @MaNV = 'C39MG001';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 51715
        SET @DoubleApprovalRejected = 1;
    ELSE
        THROW;
END CATCH;

IF @EditApprovedRejected = 0 OR @DoubleApprovalRejected = 0
    THROW 52710, 'An APPROVED stocktake remained editable or accepted duplicate approval.', 1;
GO

EXEC dbo.usp_KIEM_KE_Tao
    @MaKK = 'C39KK002', @MaNV = 'C39WH001', @GhiChu = N'Kiểm tra rollback C39';

EXEC dbo.usp_CHI_TIET_KIEM_KE_GhiNhan
    @MaKK = 'C39KK002', @MaLo = 'C39L001',
    @SoLuongThucTe = 6, @LyDo = N'Thiếu một sản phẩm';

UPDATE dbo.LO_HANG SET SoLuongTon = 8 WHERE MaLo = 'C39L001';

DECLARE @StaleSnapshotRejected BIT = 0;

BEGIN TRY
    EXEC dbo.usp_KIEM_KE_PheDuyetDieuChinh
        @MaKK = 'C39KK002', @MaNV = 'C39MG001';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 51719
        SET @StaleSnapshotRejected = 1;
    ELSE
        THROW;
END CATCH;

IF @StaleSnapshotRejected = 0
   OR NOT EXISTS (SELECT 1 FROM dbo.KIEM_KE WHERE MaKK = 'C39KK002' AND TrangThai = 'DRAFT')
   OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C39L001' AND SoLuongTon = 8)
   OR EXISTS (SELECT 1 FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'C39KK002')
    THROW 52711, 'Stale snapshot approval was accepted or left partial data.', 1;

UPDATE dbo.LO_HANG SET SoLuongTon = 7 WHERE MaLo = 'C39L001';
GO

CREATE TRIGGER dbo.trg_C39_ForceAdjustmentFailure
ON dbo.GIAO_DICH_KHO
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted
        WHERE LoaiGiaoDich = 'ADJUSTMENT'
          AND MaThamChieu = 'C39KK002'
    )
        THROW 52790, 'Forced C39 failure after lot update and adjustment insert.', 1;
END;
GO

DECLARE @ForcedFailureCaught BIT = 0;

BEGIN TRY
    EXEC dbo.usp_KIEM_KE_PheDuyetDieuChinh
        @MaKK = 'C39KK002', @MaNV = 'C39MG001';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 52790
        SET @ForcedFailureCaught = 1;
    ELSE
        THROW;
END CATCH;

IF @ForcedFailureCaught = 0
   OR NOT EXISTS (SELECT 1 FROM dbo.KIEM_KE WHERE MaKK = 'C39KK002' AND TrangThai = 'DRAFT')
   OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'C39L001' AND SoLuongTon = 7)
   OR EXISTS (SELECT 1 FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'C39KK002')
    THROW 52712, 'Forced failure did not roll back stock, movement and stocktake status together.', 1;
GO

DROP TRIGGER IF EXISTS dbo.trg_C39_ForceAdjustmentFailure;
DELETE FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu LIKE 'C39KK%';
DELETE FROM dbo.CHI_TIET_KIEM_KE WHERE MaKK LIKE 'C39KK%';
DELETE FROM dbo.KIEM_KE WHERE MaKK LIKE 'C39KK%';
DELETE FROM dbo.LO_HANG WHERE MaLo LIKE 'C39L%';
DELETE FROM dbo.SAN_PHAM WHERE MaSP LIKE 'C39P%';
DELETE FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'C39CAT01';
DELETE FROM dbo.NHAN_VIEN WHERE MaNV IN ('C39WH001', 'C39MG001');
GO

IF EXISTS (SELECT 1 FROM dbo.KIEM_KE WHERE MaKK LIKE 'C39KK%')
   OR EXISTS (SELECT 1 FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu LIKE 'C39KK%')
   OR EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo LIKE 'C39L%')
   OR EXISTS (SELECT 1 FROM dbo.NHAN_VIEN WHERE MaNV IN ('C39WH001', 'C39MG001'))
    THROW 52713, 'C39 stocktake fixtures were not cleaned up.', 1;
GO

PRINT 'C39 stocktake tests passed: stable snapshot, DRAFT counting, signed ADJUSTMENT approval, stale conflict and rollback.';
GO
