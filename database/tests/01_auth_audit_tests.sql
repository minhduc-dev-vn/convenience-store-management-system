:ON ERROR EXIT

SET NOCOUNT ON;
SET XACT_ABORT OFF;
GO

IF OBJECT_ID('dbo.usp_TAI_KHOAN_LayTheoTenDangNhap', 'P') IS NULL
    THROW 52000, 'Authentication lookup procedure is missing.', 1;

IF OBJECT_ID('dbo.usp_NHAT_KY_HE_THONG_Ghi', 'P') IS NULL
    THROW 52001, 'Audit insert procedure is missing.', 1;

IF OBJECT_ID('dbo.vw_TAI_KHOAN_VAI_TRO', 'V') IS NULL
    THROW 52002, 'Account and role view is missing.', 1;

IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.vw_TAI_KHOAN_VAI_TRO')
      AND name = 'MatKhauHash'
)
    THROW 52003, 'Account and role view must not expose password hashes.', 1;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO dbo.NHAN_VIEN (MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai)
    VALUES
        ('NVC07001', N'Quản lý C07', '0700000001', '2026-01-01', 0, 'ACTIVE'),
        ('NVC07002', N'Nhân viên trùng username C07', '0700000002', '2026-01-01', 0, 'ACTIVE'),
        ('NVC07003', N'Nhân viên sai role C07', '0700000003', '2026-01-01', 0, 'ACTIVE');

    INSERT INTO dbo.KHACH_HANG (MaKH, HoTen, SDT, TrangThai)
    VALUES
        ('KHC07001', N'Khách hàng C07', '0700000004', 'ACTIVE'),
        ('KHC07002', N'Khách hàng sai role C07', '0700000005', 'ACTIVE');

    INSERT INTO dbo.TAI_KHOAN (TenDangNhap, MatKhauHash, MaVaiTro, MaNV, MaKH, TrangThai)
    VALUES
        ('c07.manager', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'MANAGER', 'NVC07001', NULL, 'ACTIVE'),
        ('c07.customer', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'CUSTOMER', NULL, 'KHC07001', 'ACTIVE');

    DECLARE @DuplicateUsernameRejected BIT = 0;

    BEGIN TRY
        INSERT INTO dbo.TAI_KHOAN (TenDangNhap, MatKhauHash, MaVaiTro, MaNV, TrangThai)
        VALUES ('c07.manager', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'CASHIER', 'NVC07002', 'ACTIVE');
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() IN (2601, 2627)
            SET @DuplicateUsernameRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @DuplicateUsernameRejected = 0
        THROW 52010, 'Duplicate username was not rejected.', 1;

    DECLARE @EmployeeCustomerRoleRejected BIT = 0;

    BEGIN TRY
        INSERT INTO dbo.TAI_KHOAN (TenDangNhap, MatKhauHash, MaVaiTro, MaNV, TrangThai)
        VALUES ('c07.invalid.employee', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'CUSTOMER', 'NVC07003', 'ACTIVE');
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 547
            SET @EmployeeCustomerRoleRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @EmployeeCustomerRoleRejected = 0
        THROW 52011, 'A CUSTOMER account linked to an employee was not rejected.', 1;

    DECLARE @CustomerStaffRoleRejected BIT = 0;

    BEGIN TRY
        INSERT INTO dbo.TAI_KHOAN (TenDangNhap, MatKhauHash, MaVaiTro, MaKH, TrangThai)
        VALUES ('c07.invalid.customer', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'MANAGER', 'KHC07002', 'ACTIVE');
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 547
            SET @CustomerStaffRoleRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @CustomerStaffRoleRejected = 0
        THROW 52012, 'A staff account linked to a customer was not rejected.', 1;

    DECLARE @LoginResult TABLE (
        MaTK INT,
        TenDangNhap VARCHAR(50),
        MatKhauHash VARCHAR(255),
        MaVaiTro VARCHAR(20),
        TenVaiTro NVARCHAR(50),
        TrangThai VARCHAR(20),
        LoaiChuSoHuu VARCHAR(8),
        MaChuSoHuu VARCHAR(10),
        TenChuSoHuu NVARCHAR(100),
        TrangThaiChuSoHuu VARCHAR(20)
    );

    INSERT INTO @LoginResult
    EXEC dbo.usp_TAI_KHOAN_LayTheoTenDangNhap @TenDangNhap = '  c07.manager  ';

    IF NOT EXISTS (
        SELECT 1
        FROM @LoginResult
        WHERE TenDangNhap = 'c07.manager'
          AND MaVaiTro = 'MANAGER'
          AND LoaiChuSoHuu = 'EMPLOYEE'
          AND MaChuSoHuu = 'NVC07001'
          AND TrangThai = 'ACTIVE'
          AND TrangThaiChuSoHuu = 'ACTIVE'
    )
        THROW 52013, 'Authentication lookup did not return the expected account and role.', 1;

    IF (SELECT COUNT(*) FROM dbo.vw_TAI_KHOAN_VAI_TRO WHERE TenDangNhap LIKE 'c07.%') <> 2
        THROW 52014, 'Account and role view did not return the expected rows.', 1;

    DECLARE @ManagerAccountId INT = (
        SELECT MaTK FROM dbo.TAI_KHOAN WHERE TenDangNhap = 'c07.manager'
    );
    DECLARE @AuditResult TABLE (MaNhatKy BIGINT, ThoiGian DATETIME2(0));

    INSERT INTO @AuditResult
    EXEC dbo.usp_NHAT_KY_HE_THONG_Ghi
        @MaTK = @ManagerAccountId,
        @HanhDong = 'ACCOUNT_STATUS_TEST',
        @TenBang = 'TAI_KHOAN',
        @MaBanGhi = 'c07.customer',
        @DuLieuCu = N'{"TrangThai":"ACTIVE"}',
        @DuLieuMoi = N'{"TrangThai":"LOCKED"}',
        @DiaChiIP = '127.0.0.1';

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.NHAT_KY_HE_THONG AS audit_log
        JOIN @AuditResult AS result ON result.MaNhatKy = audit_log.MaNhatKy
        WHERE audit_log.MaTK = @ManagerAccountId
          AND audit_log.HanhDong = 'ACCOUNT_STATUS_TEST'
          AND audit_log.TenBang = 'TAI_KHOAN'
          AND audit_log.MaBanGhi = 'c07.customer'
          AND audit_log.DiaChiIP = '127.0.0.1'
    )
        THROW 52015, 'Audit insert/query smoke did not return the expected row.', 1;

    IF EXISTS (
        SELECT 1
        FROM dbo.NHAT_KY_HE_THONG AS audit_log
        JOIN @AuditResult AS result ON result.MaNhatKy = audit_log.MaNhatKy
        WHERE LOWER(CONCAT(COALESCE(audit_log.DuLieuCu, N''), N' ', COALESCE(audit_log.DuLieuMoi, N''))) LIKE N'%password%'
           OR LOWER(CONCAT(COALESCE(audit_log.DuLieuCu, N''), N' ', COALESCE(audit_log.DuLieuMoi, N''))) LIKE N'%matkhau%'
           OR LOWER(CONCAT(COALESCE(audit_log.DuLieuCu, N''), N' ', COALESCE(audit_log.DuLieuMoi, N''))) LIKE N'%token%'
           OR LOWER(CONCAT(COALESCE(audit_log.DuLieuCu, N''), N' ', COALESCE(audit_log.DuLieuMoi, N''))) LIKE N'%secret%'
           OR LOWER(CONCAT(COALESCE(audit_log.DuLieuCu, N''), N' ', COALESCE(audit_log.DuLieuMoi, N''))) LIKE N'%authorization%'
           OR LOWER(CONCAT(COALESCE(audit_log.DuLieuCu, N''), N' ', COALESCE(audit_log.DuLieuMoi, N''))) LIKE N'%jwt%'
    )
        THROW 52016, 'Audit smoke row contains a sensitive authentication field.', 1;

    ROLLBACK TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

DECLARE @SensitiveProcedureWriteRejected BIT = 0;

BEGIN TRY
    EXEC dbo.usp_NHAT_KY_HE_THONG_Ghi
        @HanhDong = 'SENSITIVE_DATA_TEST',
        @TenBang = 'TAI_KHOAN',
        @MaBanGhi = 'test-only',
        @DuLieuMoi = N'{"password":"synthetic-test-value"}';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 51132
        SET @SensitiveProcedureWriteRejected = 1;
    ELSE
        THROW;
END CATCH;

IF @SensitiveProcedureWriteRejected = 0
    THROW 52017, 'Audit procedure accepted a sensitive authentication field.', 1;
GO

DECLARE @SensitiveDirectWriteRejected BIT = 0;

BEGIN TRY
    INSERT INTO dbo.NHAT_KY_HE_THONG (HanhDong, TenBang, MaBanGhi, DuLieuMoi)
    VALUES ('SENSITIVE_DIRECT_TEST', 'TAI_KHOAN', 'test-only', N'{"token":"synthetic-test-value"}');
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 547
        SET @SensitiveDirectWriteRejected = 1;
    ELSE
        THROW;
END CATCH;

IF @SensitiveDirectWriteRejected = 0
    THROW 52018, 'Audit table constraint accepted a sensitive authentication field.', 1;
GO

IF EXISTS (SELECT 1 FROM dbo.TAI_KHOAN WHERE TenDangNhap LIKE 'c07.%')
   OR EXISTS (SELECT 1 FROM dbo.NHAN_VIEN WHERE MaNV LIKE 'NVC07%')
   OR EXISTS (SELECT 1 FROM dbo.KHACH_HANG WHERE MaKH LIKE 'KHC07%')
   OR EXISTS (SELECT 1 FROM dbo.NHAT_KY_HE_THONG WHERE HanhDong IN ('ACCOUNT_STATUS_TEST', 'SENSITIVE_DATA_TEST', 'SENSITIVE_DIRECT_TEST'))
    THROW 52019, 'C07 test data was not rolled back completely.', 1;
GO

PRINT 'C07 auth/account/audit tests passed: username uniqueness, owner-role rules, safe lookup, audit write/query and sensitive-data rejection.';
GO
