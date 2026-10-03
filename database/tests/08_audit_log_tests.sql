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
    ('vw_NHAT_KY_HE_THONG_CHI_TIET', 'V'),
    ('usp_NHAT_KY_HE_THONG_Ghi', 'P'),
    ('usp_NHAT_KY_HE_THONG_TraCuu', 'P'),
    ('trg_NHAT_KY_HE_THONG_AppendOnly', 'TR');

IF EXISTS (
    SELECT 1
    FROM @RequiredObjects AS required
    WHERE OBJECT_ID(N'dbo.' + required.ObjectName, required.ObjectType) IS NULL
)
    THROW 52800, 'One or more C42 audit objects are missing.', 1;

IF (SELECT COUNT(*) FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo')) <> 23
    THROW 52801, 'C42 must preserve exactly 23 dbo core tables.', 1;

DECLARE @RequiredIndexes TABLE (IndexName SYSNAME PRIMARY KEY);

INSERT INTO @RequiredIndexes (IndexName)
VALUES
    ('IX_NHAT_KY_HE_THONG_ThoiGian'),
    ('IX_NHAT_KY_HE_THONG_MaTK_ThoiGian'),
    ('IX_NHAT_KY_HE_THONG_HanhDong_ThoiGian'),
    ('IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian');

IF EXISTS (
    SELECT 1
    FROM @RequiredIndexes AS required
    WHERE NOT EXISTS (
        SELECT 1
        FROM sys.indexes AS index_definition
        WHERE index_definition.object_id = OBJECT_ID('dbo.NHAT_KY_HE_THONG')
          AND index_definition.name = required.IndexName
          AND index_definition.is_disabled = 0
    )
)
    THROW 52802, 'An audit time/actor/action/target index is missing or disabled.', 1;

IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.vw_NHAT_KY_HE_THONG_CHI_TIET')
      AND name IN ('MatKhauHash', 'PasswordHash', 'Token', 'Secret')
)
    THROW 52803, 'The audit query view exposes an authentication secret column.', 1;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO dbo.NHAN_VIEN (
        MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai
    )
    VALUES
        ('C42MG001', N'Quản lý audit C42 A', '0842000001', '2026-10-03', 0, 'ACTIVE'),
        ('C42MG002', N'Quản lý audit C42 B', '0842000002', '2026-10-03', 0, 'ACTIVE');

    INSERT INTO dbo.TAI_KHOAN (
        TenDangNhap, MatKhauHash, MaVaiTro, MaNV, TrangThai
    )
    VALUES
        ('c42.manager.a', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'MANAGER', 'C42MG001', 'ACTIVE'),
        ('c42.manager.b', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'MANAGER', 'C42MG002', 'ACTIVE');

    DECLARE @ManagerA INT = (
        SELECT MaTK FROM dbo.TAI_KHOAN WHERE TenDangNhap = 'c42.manager.a'
    );
    DECLARE @ManagerB INT = (
        SELECT MaTK FROM dbo.TAI_KHOAN WHERE TenDangNhap = 'c42.manager.b'
    );

    INSERT INTO dbo.NHAT_KY_HE_THONG (
        MaTK, HanhDong, TenBang, MaBanGhi,
        DuLieuCu, DuLieuMoi, ThoiGian, DiaChiIP
    )
    VALUES
        (@ManagerA, 'PRICE_UPDATE', 'SAN_PHAM', 'C42SP001',
         N'{"GiaBan":10000}', N'{"GiaBan":11000}', '2026-09-01T08:00:00', '127.0.0.1'),
        (@ManagerA, 'PRICE_UPDATE', 'SAN_PHAM', 'C42SP001',
         N'{"GiaBan":11000}', N'{"GiaBan":12000}', '2026-09-02T09:00:00', '127.0.0.1'),
        (@ManagerA, 'ACCOUNT_LOCK', 'TAI_KHOAN', 'c42.customer',
         N'{"TrangThai":"ACTIVE"}', N'{"TrangThai":"LOCKED"}', '2026-09-02T10:00:00', '127.0.0.1'),
        (@ManagerB, 'PRICE_UPDATE', 'SAN_PHAM', 'C42SP001',
         N'{"GiaBan":12000}', N'{"GiaBan":13000}', '2026-09-02T11:00:00', '127.0.0.2'),
        (@ManagerA, 'PRICE_UPDATE', 'SAN_PHAM', 'C42SP002',
         N'{"GiaBan":20000}', N'{"GiaBan":21000}', '2026-09-03T08:00:00', '127.0.0.1');

    DECLARE @FilteredPage TABLE (
        MaNhatKy BIGINT,
        MaTK INT,
        TenDangNhap VARCHAR(50),
        MaVaiTro VARCHAR(20),
        TenVaiTro NVARCHAR(50),
        LoaiChuSoHuu VARCHAR(8),
        MaChuSoHuu VARCHAR(10),
        TenChuSoHuu NVARCHAR(100),
        HanhDong VARCHAR(50),
        TenBang VARCHAR(128),
        MaBanGhi VARCHAR(100),
        DuLieuCu NVARCHAR(MAX),
        DuLieuMoi NVARCHAR(MAX),
        DuLieuCuLaJson BIT,
        DuLieuMoiLaJson BIT,
        ThoiGian DATETIME2(0),
        DiaChiIP VARCHAR(45),
        TongSoBanGhi BIGINT
    );

    INSERT INTO @FilteredPage
    EXEC dbo.usp_NHAT_KY_HE_THONG_TraCuu
        @TuNgay = '2026-09-01',
        @DenNgay = '2026-09-02',
        @TenDangNhap = '  c42.manager.a  ',
        @HanhDong = ' PRICE_UPDATE ',
        @TenBang = ' SAN_PHAM ',
        @MaBanGhi = ' C42SP001 ',
        @SoTrang = 1,
        @KichThuocTrang = 1;

    IF (SELECT COUNT(*) FROM @FilteredPage) <> 1
       OR NOT EXISTS (
           SELECT 1
           FROM @FilteredPage
           WHERE TenDangNhap = 'c42.manager.a'
             AND HanhDong = 'PRICE_UPDATE'
             AND TenBang = 'SAN_PHAM'
             AND MaBanGhi = 'C42SP001'
             AND ThoiGian = '2026-09-02T09:00:00'
             AND TongSoBanGhi = 2
             AND DuLieuCuLaJson = 1
             AND DuLieuMoiLaJson = 1
       )
        THROW 52804, 'Combined audit filters, inclusive dates or pagination returned an incorrect result.', 1;

    DECLARE @ActionFilter TABLE (
        MaNhatKy BIGINT,
        MaTK INT,
        TenDangNhap VARCHAR(50),
        MaVaiTro VARCHAR(20),
        TenVaiTro NVARCHAR(50),
        LoaiChuSoHuu VARCHAR(8),
        MaChuSoHuu VARCHAR(10),
        TenChuSoHuu NVARCHAR(100),
        HanhDong VARCHAR(50),
        TenBang VARCHAR(128),
        MaBanGhi VARCHAR(100),
        DuLieuCu NVARCHAR(MAX),
        DuLieuMoi NVARCHAR(MAX),
        DuLieuCuLaJson BIT,
        DuLieuMoiLaJson BIT,
        ThoiGian DATETIME2(0),
        DiaChiIP VARCHAR(45),
        TongSoBanGhi BIGINT
    );

    INSERT INTO @ActionFilter
    EXEC dbo.usp_NHAT_KY_HE_THONG_TraCuu
        @HanhDong = 'ACCOUNT_LOCK';

    IF (SELECT COUNT(*) FROM @ActionFilter) <> 1
       OR NOT EXISTS (
           SELECT 1
           FROM @ActionFilter
           WHERE TenDangNhap = 'c42.manager.a'
             AND TenBang = 'TAI_KHOAN'
             AND MaBanGhi = 'c42.customer'
             AND TongSoBanGhi = 1
       )
        THROW 52805, 'Audit action filter returned an incorrect result.', 1;

    IF EXISTS (
        SELECT 1
        FROM dbo.vw_NHAT_KY_HE_THONG_CHI_TIET
        WHERE MaBanGhi LIKE 'C42%'
          AND LOWER(CONCAT(COALESCE(DuLieuCu, N''), N' ', COALESCE(DuLieuMoi, N''))) LIKE N'%password%'
    )
        THROW 52806, 'Audit query output exposed sensitive authentication data.', 1;

    DECLARE @InvalidRangeRejected BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_NHAT_KY_HE_THONG_TraCuu
            @TuNgay = '2026-09-03', @DenNgay = '2026-09-01';
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51810
            SET @InvalidRangeRejected = 1;
        ELSE
            THROW;
    END CATCH;

    DECLARE @InvalidPageRejected BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_NHAT_KY_HE_THONG_TraCuu @SoTrang = 0;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51811
            SET @InvalidPageRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @InvalidRangeRejected = 0 OR @InvalidPageRejected = 0
        THROW 52807, 'Audit lookup accepted an invalid date range or page.', 1;

    ROLLBACK TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

IF DATABASE_PRINCIPAL_ID('C42AuditDmlTestUser') IS NOT NULL
    DROP USER C42AuditDmlTestUser;
GO

CREATE USER C42AuditDmlTestUser WITHOUT LOGIN;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.NHAT_KY_HE_THONG TO C42AuditDmlTestUser;
GO

DECLARE @AppendOnlyLogId BIGINT;

INSERT INTO dbo.NHAT_KY_HE_THONG (
    HanhDong, TenBang, MaBanGhi, DuLieuMoi, ThoiGian, DiaChiIP
)
VALUES (
    'APPEND_ONLY_TEST', 'NHAT_KY_HE_THONG', 'C42-APPEND-ONLY',
    N'{"TrangThai":"CREATED"}', '2026-10-03T12:00:00', '127.0.0.1'
);

SET @AppendOnlyLogId = SCOPE_IDENTITY();

DECLARE @UpdateRejected BIT = 0;
DECLARE @DeleteRejected BIT = 0;

BEGIN TRY
    EXECUTE AS USER = 'C42AuditDmlTestUser';

    BEGIN TRY
        UPDATE dbo.NHAT_KY_HE_THONG
        SET HanhDong = 'MUTATED'
        WHERE MaNhatKy = @AppendOnlyLogId;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51820
            SET @UpdateRejected = 1;
        ELSE
            THROW;
    END CATCH;

    BEGIN TRY
        DELETE FROM dbo.NHAT_KY_HE_THONG
        WHERE MaNhatKy = @AppendOnlyLogId;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51820
            SET @DeleteRejected = 1;
        ELSE
            THROW;
    END CATCH;

    REVERT;
END TRY
BEGIN CATCH
    IF USER_NAME() = 'C42AuditDmlTestUser'
        REVERT;

    DELETE FROM dbo.NHAT_KY_HE_THONG WHERE MaNhatKy = @AppendOnlyLogId;
    DROP USER C42AuditDmlTestUser;
    THROW;
END CATCH;

IF @UpdateRejected = 0 OR @DeleteRejected = 0
   OR NOT EXISTS (
       SELECT 1
       FROM dbo.NHAT_KY_HE_THONG
       WHERE MaNhatKy = @AppendOnlyLogId
         AND HanhDong = 'APPEND_ONLY_TEST'
   )
BEGIN
    DELETE FROM dbo.NHAT_KY_HE_THONG WHERE MaNhatKy = @AppendOnlyLogId;
    DROP USER C42AuditDmlTestUser;
    THROW 52808, 'A non-privileged principal changed or deleted append-only audit history.', 1;
END;

DELETE FROM dbo.NHAT_KY_HE_THONG WHERE MaNhatKy = @AppendOnlyLogId;
DROP USER C42AuditDmlTestUser;
GO

IF EXISTS (SELECT 1 FROM dbo.NHAT_KY_HE_THONG WHERE MaBanGhi LIKE 'C42%')
   OR EXISTS (SELECT 1 FROM dbo.TAI_KHOAN WHERE TenDangNhap LIKE 'c42.%')
   OR EXISTS (SELECT 1 FROM dbo.NHAN_VIEN WHERE MaNV LIKE 'C42%')
   OR DATABASE_PRINCIPAL_ID('C42AuditDmlTestUser') IS NOT NULL
    THROW 52809, 'C42 audit test fixtures were not cleaned up.', 1;
GO

PRINT 'C42 audit tests passed: indexed filters, actor context, pagination, secret-safe output and append-only enforcement.';
GO
