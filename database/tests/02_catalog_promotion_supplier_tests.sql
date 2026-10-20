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

IF OBJECT_ID('dbo.vw_SAN_PHAM_DANH_MUC', 'V') IS NULL
    THROW 52100, 'Catalog/category view is missing.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns AS column_definition
    JOIN sys.types AS type_definition
        ON type_definition.user_type_id = column_definition.user_type_id
    WHERE column_definition.object_id = OBJECT_ID('dbo.SAN_PHAM', 'U')
      AND column_definition.name = 'ImageUrl'
      AND type_definition.name = 'varchar'
      AND column_definition.max_length = 500
      AND column_definition.is_nullable = 1
)
    THROW 52130, 'SAN_PHAM.ImageUrl must be nullable VARCHAR(500).', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.vw_SAN_PHAM_DANH_MUC', 'V')
      AND name = 'ImageUrl'
)
    THROW 52131, 'Catalog view does not expose ImageUrl.', 1;

IF OBJECT_ID('dbo.vw_KHUYEN_MAI_SAN_PHAM_CHI_TIET', 'V') IS NULL
    THROW 52101, 'Promotion/product detail view is missing.', 1;

IF OBJECT_ID('dbo.usp_SAN_PHAM_TraCuu', 'P') IS NULL
    THROW 52102, 'Product lookup procedure is missing.', 1;

IF OBJECT_ID('dbo.usp_KHUYEN_MAI_DangHieuLuc', 'P') IS NULL
    THROW 52103, 'Active promotion procedure is missing.', 1;

IF OBJECT_ID('dbo.usp_NHA_CUNG_CAP_TraCuu', 'P') IS NULL
    THROW 52104, 'Supplier lookup procedure is missing.', 1;

IF OBJECT_ID('dbo.usp_SAN_PHAM_LichSuGia', 'P') IS NULL
    THROW 52105, 'Product price-history procedure is missing.', 1;

IF OBJECT_ID('dbo.DON_VI_TINH', 'U') IS NOT NULL
   OR OBJECT_ID('dbo.LICH_SU_GIA', 'U') IS NOT NULL
    THROW 52106, 'A forbidden catalog table was added.', 1;

IF (
    SELECT COUNT(*)
    FROM sys.tables
    WHERE schema_id = SCHEMA_ID('dbo')
      AND name <> 'SCHEMA_MIGRATIONS'
) <> 23
    THROW 52107, 'C15 must preserve exactly 23 dbo core tables.', 1;
GO

DECLARE @SeedProduct TABLE (
    MaSP VARCHAR(10),
    TenSP NVARCHAR(150),
    MaVach VARCHAR(30),
    DonViTinh NVARCHAR(20),
    GiaBan DECIMAL(18,2),
    MucTonToiThieu INT,
    MaLoai VARCHAR(10),
    TenLoai NVARCHAR(100),
    TrangThai VARCHAR(20),
    TongSoBanGhi BIGINT
);

INSERT INTO @SeedProduct
EXEC dbo.usp_SAN_PHAM_TraCuu
    @TuKhoa = N'DEV-BARCODE-0001',
    @TrangThai = 'ACTIVE';

IF NOT EXISTS (
    SELECT 1 FROM @SeedProduct
    WHERE MaSP = 'SPDEV001'
      AND MaVach = 'DEV-BARCODE-0001'
      AND DonViTinh = N'Sản phẩm'
)
    THROW 52108, 'Product lookup did not return the baseline seed by barcode.', 1;

DECLARE @SeedSupplier TABLE (
    MaNCC VARCHAR(10),
    TenNCC NVARCHAR(150),
    SDT VARCHAR(15),
    Email VARCHAR(100),
    DiaChi NVARCHAR(255),
    MaSoThue VARCHAR(20),
    TrangThai VARCHAR(20),
    TongSoBanGhi BIGINT
);

INSERT INTO @SeedSupplier
EXEC dbo.usp_NHA_CUNG_CAP_TraCuu @TuKhoa = N'0000000002';

IF NOT EXISTS (
    SELECT 1 FROM @SeedSupplier
    WHERE MaNCC = 'NCCDEV001' AND SDT = '0000000002'
)
    THROW 52109, 'Supplier lookup did not return the baseline seed by phone.', 1;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, MoTa, TrangThai)
    VALUES ('LCAT1501', N'Danh mục C15', N'Fixture kiểm thử catalog C15.', 'ACTIVE');

    INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, MaVach, DonViTinh, GiaBan, MucTonToiThieu, MaLoai, TrangThai
    )
    VALUES
        ('SPC15001', N'C15 Cà phê lon', 'C15-BAR-0001', N'Lon', 15000, 5, 'LCAT1501', 'ACTIVE'),
        ('SPC15002', N'C15 Cà phê hộp', 'C15-BAR-0002', N'Hộp', 35000, 3, 'LCAT1501', 'ACTIVE'),
        ('SPC15003', N'C15 Cà phê ngừng bán', 'C15-BAR-0003', N'Gói', 12000, 0, 'LCAT1501', 'INACTIVE'),
        ('SPC15004', N'C15 100% nguyên chất', 'C15-BAR-100P', N'Chai', 22000, 2, 'LCAT1501', 'ACTIVE');

    DECLARE @ProductPageOne TABLE (
        MaSP VARCHAR(10), TenSP NVARCHAR(150), MaVach VARCHAR(30), DonViTinh NVARCHAR(20),
        GiaBan DECIMAL(18,2), MucTonToiThieu INT, MaLoai VARCHAR(10), TenLoai NVARCHAR(100),
        TrangThai VARCHAR(20), TongSoBanGhi BIGINT
    );
    DECLARE @ProductPageTwo TABLE (
        MaSP VARCHAR(10), TenSP NVARCHAR(150), MaVach VARCHAR(30), DonViTinh NVARCHAR(20),
        GiaBan DECIMAL(18,2), MucTonToiThieu INT, MaLoai VARCHAR(10), TenLoai NVARCHAR(100),
        TrangThai VARCHAR(20), TongSoBanGhi BIGINT
    );
    DECLARE @ProductBarcode TABLE (
        MaSP VARCHAR(10), TenSP NVARCHAR(150), MaVach VARCHAR(30), DonViTinh NVARCHAR(20),
        GiaBan DECIMAL(18,2), MucTonToiThieu INT, MaLoai VARCHAR(10), TenLoai NVARCHAR(100),
        TrangThai VARCHAR(20), TongSoBanGhi BIGINT
    );
    DECLARE @ProductEscaped TABLE (
        MaSP VARCHAR(10), TenSP NVARCHAR(150), MaVach VARCHAR(30), DonViTinh NVARCHAR(20),
        GiaBan DECIMAL(18,2), MucTonToiThieu INT, MaLoai VARCHAR(10), TenLoai NVARCHAR(100),
        TrangThai VARCHAR(20), TongSoBanGhi BIGINT
    );

    INSERT INTO @ProductPageOne
    EXEC dbo.usp_SAN_PHAM_TraCuu
        @TuKhoa = N'C15 Cà phê', @MaLoai = 'LCAT1501', @TrangThai = 'ACTIVE',
        @SoTrang = 1, @KichThuocTrang = 1;

    INSERT INTO @ProductPageTwo
    EXEC dbo.usp_SAN_PHAM_TraCuu
        @TuKhoa = N'C15 Cà phê', @MaLoai = 'LCAT1501', @TrangThai = 'ACTIVE',
        @SoTrang = 2, @KichThuocTrang = 1;

    IF (SELECT COUNT(*) FROM @ProductPageOne) <> 1
       OR (SELECT COUNT(*) FROM @ProductPageTwo) <> 1
       OR (SELECT TOP (1) TongSoBanGhi FROM @ProductPageOne) <> 2
       OR EXISTS (
           SELECT 1
           FROM @ProductPageOne AS first_page
           JOIN @ProductPageTwo AS second_page ON second_page.MaSP = first_page.MaSP
       )
        THROW 52110, 'Product name/status/category pagination returned an unexpected result.', 1;

    INSERT INTO @ProductBarcode
    EXEC dbo.usp_SAN_PHAM_TraCuu @TuKhoa = N'C15-BAR-0002', @TrangThai = 'ACTIVE';

    IF (SELECT COUNT(*) FROM @ProductBarcode WHERE MaSP = 'SPC15002') <> 1
        THROW 52111, 'Product barcode lookup returned an unexpected result.', 1;

    INSERT INTO @ProductEscaped
    EXEC dbo.usp_SAN_PHAM_TraCuu @TuKhoa = N'C15 100%', @TrangThai = 'ACTIVE';

    IF (SELECT COUNT(*) FROM @ProductEscaped WHERE MaSP = 'SPC15004') <> 1
        THROW 52112, 'Product lookup did not treat wildcard characters as literals.', 1;

    INSERT INTO dbo.KHUYEN_MAI (
        MaKM, TenKM, LoaiKM, GiaTri, GiaTriDonToiThieu, MucGiamToiDa,
        NgayBatDau, NgayKetThuc, TrangThai
    )
    VALUES
        ('KMC15001', N'C15 đang hiệu lực', 'PERCENT', 10, 10000, 30000, '2026-09-01', '2026-10-01', 'ACTIVE'),
        ('KMC15002', N'C15 đã hết hạn', 'AMOUNT', 5000, 0, NULL, '2026-08-01', '2026-09-20', 'ACTIVE'),
        ('KMC15003', N'C15 không hoạt động', 'AMOUNT', 5000, 0, NULL, '2026-09-01', '2026-10-01', 'INACTIVE'),
        ('KMC15004', N'C15 sản phẩm khác', 'AMOUNT', 3000, 0, NULL, '2026-09-01', '2026-10-01', 'ACTIVE'),
        ('KMC15005', N'C15 đơn tối thiểu cao', 'PERCENT', 15, 100000, 50000, '2026-09-01', '2026-10-01', 'ACTIVE'),
        ('KMC15006', N'C15 chưa gắn sản phẩm', 'AMOUNT', 2000, 0, NULL, '2026-09-01', '2026-10-01', 'ACTIVE');

    INSERT INTO dbo.KHUYEN_MAI_SAN_PHAM (MaKM, MaSP)
    VALUES
        ('KMC15001', 'SPC15001'),
        ('KMC15002', 'SPC15001'),
        ('KMC15003', 'SPC15001'),
        ('KMC15004', 'SPC15002'),
        ('KMC15005', 'SPC15001');

    DECLARE @ActivePromotions TABLE (
        MaKM VARCHAR(12), TenKM NVARCHAR(150), LoaiKM VARCHAR(20), GiaTri DECIMAL(18,2),
        GiaTriDonToiThieu DECIMAL(18,2), MucGiamToiDa DECIMAL(18,2),
        NgayBatDau DATETIME2(0), NgayKetThuc DATETIME2(0), TrangThai VARCHAR(20),
        SoSanPhamApDung BIGINT
    );

    INSERT INTO @ActivePromotions
    EXEC dbo.usp_KHUYEN_MAI_DangHieuLuc
        @ThoiDiem = '2026-09-28T12:00:00', @MaSP = 'SPC15001', @GiaTriDonHang = 50000;

    IF (SELECT COUNT(*) FROM @ActivePromotions) <> 1
       OR NOT EXISTS (SELECT 1 FROM @ActivePromotions WHERE MaKM = 'KMC15001')
       OR EXISTS (SELECT 1 FROM @ActivePromotions WHERE MaKM IN ('KMC15002', 'KMC15003', 'KMC15004', 'KMC15005', 'KMC15006'))
        THROW 52113, 'Active promotion lookup did not enforce time/status/product/order conditions.', 1;

    DELETE FROM @ActivePromotions;

    INSERT INTO @ActivePromotions
    EXEC dbo.usp_KHUYEN_MAI_DangHieuLuc
        @ThoiDiem = '2026-09-28T12:00:00', @MaSP = 'SPC15001', @GiaTriDonHang = 200000;

    IF (SELECT COUNT(*) FROM @ActivePromotions) <> 2
       OR NOT EXISTS (SELECT 1 FROM @ActivePromotions WHERE MaKM = 'KMC15005')
        THROW 52114, 'Promotion minimum-order condition did not admit the qualifying program.', 1;

    DELETE FROM @ActivePromotions;

    INSERT INTO @ActivePromotions
    EXEC dbo.usp_KHUYEN_MAI_DangHieuLuc
        @ThoiDiem = '2026-10-01T00:00:00', @MaSP = 'SPC15001', @GiaTriDonHang = 200000;

    IF EXISTS (SELECT 1 FROM @ActivePromotions WHERE MaKM IN ('KMC15001', 'KMC15005'))
        THROW 52115, 'Promotion ending at the lookup time was returned as active.', 1;

    INSERT INTO dbo.NHA_CUNG_CAP (MaNCC, TenNCC, SDT, Email, DiaChi, MaSoThue, TrangThai)
    VALUES
        ('NCC15001', N'C15 Nhà cung cấp Alpha', '0851500001', 'alpha@c15.test', N'Địa chỉ A', 'C15-TAX-001', 'ACTIVE'),
        ('NCC15002', N'C15 Nhà cung cấp Beta', '0851500002', 'beta@c15.test', N'Địa chỉ B', 'C15-TAX-002', 'INACTIVE');

    DECLARE @SupplierByName TABLE (
        MaNCC VARCHAR(10), TenNCC NVARCHAR(150), SDT VARCHAR(15), Email VARCHAR(100),
        DiaChi NVARCHAR(255), MaSoThue VARCHAR(20), TrangThai VARCHAR(20), TongSoBanGhi BIGINT
    );
    DECLARE @SupplierByPhone TABLE (
        MaNCC VARCHAR(10), TenNCC NVARCHAR(150), SDT VARCHAR(15), Email VARCHAR(100),
        DiaChi NVARCHAR(255), MaSoThue VARCHAR(20), TrangThai VARCHAR(20), TongSoBanGhi BIGINT
    );

    INSERT INTO @SupplierByName
    EXEC dbo.usp_NHA_CUNG_CAP_TraCuu @TuKhoa = N'C15 Nhà cung cấp', @TrangThai = 'ACTIVE';

    INSERT INTO @SupplierByPhone
    EXEC dbo.usp_NHA_CUNG_CAP_TraCuu @TuKhoa = N'0851500002', @TrangThai = 'INACTIVE';

    IF (SELECT COUNT(*) FROM @SupplierByName WHERE MaNCC = 'NCC15001') <> 1
       OR EXISTS (SELECT 1 FROM @SupplierByName WHERE MaNCC = 'NCC15002')
       OR (SELECT COUNT(*) FROM @SupplierByPhone WHERE MaNCC = 'NCC15002') <> 1
        THROW 52116, 'Supplier name/phone/status lookup returned an unexpected result.', 1;

    INSERT INTO dbo.NHAT_KY_HE_THONG (HanhDong, TenBang, MaBanGhi, DuLieuCu, DuLieuMoi, DiaChiIP)
    VALUES
        ('UPDATE_PRICE', 'SAN_PHAM', 'SPC15001', N'{"GiaBan":15000}', N'{"GiaBan":17000}', '127.0.0.1'),
        ('PRODUCT_STATUS_TEST', 'SAN_PHAM', 'SPC15001', N'{"TrangThai":"ACTIVE"}', N'{"TrangThai":"INACTIVE"}', '127.0.0.1');

    DECLARE @PriceHistory TABLE (
        MaNhatKy BIGINT, MaSP VARCHAR(100), DuLieuCu NVARCHAR(MAX), DuLieuMoi NVARCHAR(MAX),
        ThoiGian DATETIME2(0), MaTK INT, TenDangNhap VARCHAR(50), TenNguoiThucHien NVARCHAR(100),
        DiaChiIP VARCHAR(45), TongSoBanGhi BIGINT
    );

    INSERT INTO @PriceHistory
    EXEC dbo.usp_SAN_PHAM_LichSuGia @MaSP = 'SPC15001';

    IF (SELECT COUNT(*) FROM @PriceHistory) <> 1
       OR NOT EXISTS (
           SELECT 1 FROM @PriceHistory
           WHERE MaSP = 'SPC15001'
             AND DuLieuCu = N'{"GiaBan":15000}'
             AND DuLieuMoi = N'{"GiaBan":17000}'
       )
        THROW 52117, 'Product price history was not sourced exclusively from UPDATE_PRICE audit rows.', 1;

    DECLARE @InvalidProductPageRejected BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_SAN_PHAM_TraCuu @SoTrang = 0;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51201
            SET @InvalidProductPageRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @InvalidProductPageRejected = 0
        THROW 52118, 'Product lookup accepted an invalid page.', 1;

    DECLARE @NegativeOrderValueRejected BIT = 0;

    BEGIN TRY
        EXEC dbo.usp_KHUYEN_MAI_DangHieuLuc @GiaTriDonHang = -1;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() = 51210
            SET @NegativeOrderValueRejected = 1;
        ELSE
            THROW;
    END CATCH;

    IF @NegativeOrderValueRejected = 0
        THROW 52119, 'Promotion lookup accepted a negative order value.', 1;

    ROLLBACK TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

IF EXISTS (SELECT 1 FROM dbo.SAN_PHAM WHERE MaSP LIKE 'SPC15%')
   OR EXISTS (SELECT 1 FROM dbo.LOAI_SAN_PHAM WHERE MaLoai LIKE 'LCAT15%')
   OR EXISTS (SELECT 1 FROM dbo.KHUYEN_MAI WHERE MaKM LIKE 'KMC15%')
   OR EXISTS (SELECT 1 FROM dbo.NHA_CUNG_CAP WHERE MaNCC LIKE 'NCC15%')
   OR EXISTS (SELECT 1 FROM dbo.NHAT_KY_HE_THONG WHERE MaBanGhi LIKE 'SPC15%')
    THROW 52120, 'C15 query test data was not rolled back completely.', 1;
GO

DECLARE @ExpectedIndexes TABLE (TableName SYSNAME, IndexName SYSNAME);

INSERT INTO @ExpectedIndexes (TableName, IndexName)
VALUES
    ('SAN_PHAM', 'UX_SAN_PHAM_MaVach'),
    ('SAN_PHAM', 'IX_SAN_PHAM_TenSP_TrangThai'),
    ('SAN_PHAM', 'IX_SAN_PHAM_MaLoai_TrangThai'),
    ('KHUYEN_MAI', 'IX_KHUYEN_MAI_TrangThai_ThoiGian'),
    ('KHUYEN_MAI_SAN_PHAM', 'IX_KHUYEN_MAI_SAN_PHAM_MaSP'),
    ('NHA_CUNG_CAP', 'UQ_NHA_CUNG_CAP_SDT'),
    ('NHA_CUNG_CAP', 'IX_NHA_CUNG_CAP_TenNCC_TrangThai'),
    ('NHAT_KY_HE_THONG', 'IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian');

IF EXISTS (
    SELECT 1
    FROM @ExpectedIndexes AS expected
    WHERE NOT EXISTS (
        SELECT 1
        FROM sys.indexes AS actual
        WHERE actual.object_id = OBJECT_ID(N'dbo.' + expected.TableName)
          AND actual.name = expected.IndexName
          AND actual.is_disabled = 0
    )
)
    THROW 52121, 'A required enabled query index is missing.', 1;
GO

PRINT 'C15 catalog/promotion/supplier tests passed: seed lookup, pagination, barcode, active promotion conditions, supplier search, audit price history, validation, indexes and rollback.';
GO
