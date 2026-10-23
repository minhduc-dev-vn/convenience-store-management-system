-- Optional local demo catalog seed and coursework evidence.
-- Run this file explicitly; database/init.sql does not include it.
-- Creates six product categories and 30 active products without inventory lots or stock.

IF DB_NAME() <> N'ConvenienceStore_DBMS'
    THROW 50000, 'This script only supports ConvenienceStore_DBMS.', 1;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF NOT EXISTS (SELECT 1 FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'NUOC')
        INSERT INTO dbo.LOAI_SAN_PHAM
            (MaLoai, TenLoai, MoTa, TrangThai)
        VALUES
            ('NUOC', N'Nước giải khát',
             N'Nước ngọt, nước suối, trà và các loại đồ uống.', 'ACTIVE');

    IF NOT EXISTS (SELECT 1 FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'MIANLIEN')
        INSERT INTO dbo.LOAI_SAN_PHAM
            (MaLoai, TenLoai, MoTa, TrangThai)
        VALUES
            ('MIANLIEN', N'Mì và thực phẩm nhanh',
             N'Mì gói, cháo, phở và thực phẩm ăn nhanh.', 'ACTIVE');

    IF NOT EXISTS (SELECT 1 FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'BANHKEO')
        INSERT INTO dbo.LOAI_SAN_PHAM
            (MaLoai, TenLoai, MoTa, TrangThai)
        VALUES
            ('BANHKEO', N'Bánh kẹo',
             N'Bánh quy, snack, chocolate và các loại kẹo.', 'ACTIVE');

    IF NOT EXISTS (SELECT 1 FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'SUA')
        INSERT INTO dbo.LOAI_SAN_PHAM
            (MaLoai, TenLoai, MoTa, TrangThai)
        VALUES
            ('SUA', N'Sữa và sản phẩm từ sữa',
             N'Sữa tươi, sữa chua và các sản phẩm từ sữa.', 'ACTIVE');

    IF NOT EXISTS (SELECT 1 FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'GIADUNG')
        INSERT INTO dbo.LOAI_SAN_PHAM
            (MaLoai, TenLoai, MoTa, TrangThai)
        VALUES
            ('GIADUNG', N'Đồ gia dụng',
             N'Các vật dụng tiêu dùng và sinh hoạt hằng ngày.', 'ACTIVE');

    IF NOT EXISTS (SELECT 1 FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'CANHAN')
        INSERT INTO dbo.LOAI_SAN_PHAM
            (MaLoai, TenLoai, MoTa, TrangThai)
        VALUES
            ('CANHAN', N'Chăm sóc cá nhân',
             N'Sản phẩm vệ sinh và chăm sóc cá nhân.', 'ACTIVE');

    COMMIT TRANSACTION;

END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;

SELECT
    MaLoai,
    TenLoai,
    TrangThai
FROM dbo.LOAI_SAN_PHAM
WHERE MaLoai IN (
    'NUOC',
    'MIANLIEN',
    'BANHKEO',
    'SUA',
    'GIADUNG',
    'CANHAN'
)
ORDER BY MaLoai;

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @Products TABLE (
        MaSP VARCHAR(10),
        TenSP NVARCHAR(150),
        MaVach VARCHAR(30),
        DonViTinh NVARCHAR(20),
        GiaBan DECIMAL(18,2),
        MucTonToiThieu INT,
        MaLoai VARCHAR(10)
    );

    INSERT INTO @Products
        (MaSP, TenSP, MaVach, DonViTinh, GiaBan, MucTonToiThieu, MaLoai)
    VALUES
        ('SP001', N'Coca Cola 330ml',           '8930000000001', N'Lon',   12000, 10, 'NUOC'),
        ('SP002', N'Pepsi 330ml',               '8930000000002', N'Lon',   12000, 10, 'NUOC'),
        ('SP003', N'7Up 330ml',                 '8930000000003', N'Lon',   12000, 10, 'NUOC'),
        ('SP004', N'Nước suối 500ml',           '8930000000004', N'Chai',   7000, 20, 'NUOC'),
        ('SP005', N'Trà xanh 0 độ 455ml',       '8930000000005', N'Chai',  11000, 10, 'NUOC'),
        ('SP006', N'Nước tăng lực 250ml',       '8930000000006', N'Lon',   14000, 10, 'NUOC'),

        ('SP007', N'Mì Hảo Hảo tôm chua cay',   '8930000000007', N'Gói',    5000, 20, 'MIANLIEN'),
        ('SP008', N'Mì Omachi sườn hầm',        '8930000000008', N'Gói',    9000, 15, 'MIANLIEN'),
        ('SP009', N'Mì Kokomi',                 '8930000000009', N'Gói',    7000, 15, 'MIANLIEN'),
        ('SP010', N'Cháo ăn liền thịt bằm',     '8930000000010', N'Gói',    8000, 10, 'MIANLIEN'),
        ('SP011', N'Phở bò ăn liền',            '8930000000011', N'Gói',   10000, 10, 'MIANLIEN'),

        ('SP012', N'Snack khoai tây',           '8930000000012', N'Gói',   12000, 10, 'BANHKEO'),
        ('SP013', N'Bánh Oreo 133g',            '8930000000013', N'Gói',   18000,  8, 'BANHKEO'),
        ('SP014', N'Bánh Chocopie hộp 6 cái',   '8930000000014', N'Hộp',   30000,  6, 'BANHKEO'),
        ('SP015', N'Kẹo bạc hà',                '8930000000015', N'Gói',   10000, 10, 'BANHKEO'),
        ('SP016', N'Chocolate sữa 35g',          '8930000000016', N'Thanh', 18000,  8, 'BANHKEO'),

        ('SP017', N'Sữa tươi có đường 180ml',    '8930000000017', N'Hộp',    9000, 15, 'SUA'),
        ('SP018', N'Sữa tươi không đường 180ml', '8930000000018', N'Hộp',    9000, 15, 'SUA'),
        ('SP019', N'Sữa chocolate 180ml',        '8930000000019', N'Hộp',   10000, 12, 'SUA'),
        ('SP020', N'Sữa chua có đường',          '8930000000020', N'Hộp',    7000, 15, 'SUA'),
        ('SP021', N'Sữa đậu nành 200ml',         '8930000000021', N'Hộp',    8000, 12, 'SUA'),

        ('SP022', N'Khăn giấy bỏ túi',           '8930000000022', N'Gói',    8000, 10, 'GIADUNG'),
        ('SP023', N'Giấy vệ sinh cuộn',          '8930000000023', N'Cuộn',  10000, 10, 'GIADUNG'),
        ('SP024', N'Túi rác tự hủy',             '8930000000024', N'Cuộn',  25000,  5, 'GIADUNG'),
        ('SP025', N'Nước rửa chén 400ml',        '8930000000025', N'Chai',  28000,  5, 'GIADUNG'),

        ('SP026', N'Kem đánh răng 100g',         '8930000000026', N'Tuýp',  32000,  5, 'CANHAN'),
        ('SP027', N'Bàn chải đánh răng',         '8930000000027', N'Cái',   18000,  5, 'CANHAN'),
        ('SP028', N'Dầu gội gói 6ml',            '8930000000028', N'Gói',    3000, 20, 'CANHAN'),
        ('SP029', N'Sữa tắm gói 6ml',            '8930000000029', N'Gói',    3000, 20, 'CANHAN'),
        ('SP030', N'Khẩu trang y tế',            '8930000000030', N'Cái',    3000, 20, 'CANHAN');

    INSERT INTO dbo.SAN_PHAM (
        MaSP,
        TenSP,
        MaVach,
        DonViTinh,
        GiaBan,
        ImageUrl,
        MucTonToiThieu,
        MaLoai,
        TrangThai
    )
    SELECT
        p.MaSP,
        p.TenSP,
        p.MaVach,
        p.DonViTinh,
        p.GiaBan,
        NULL,
        p.MucTonToiThieu,
        p.MaLoai,
        'ACTIVE'
    FROM @Products AS p
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.SAN_PHAM AS existing
        WHERE existing.MaSP = p.MaSP
    );

    COMMIT TRANSACTION;

END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;

SELECT COUNT(*) AS SoSanPham
FROM dbo.SAN_PHAM
WHERE MaSP IN (
    'SP001','SP002','SP003','SP004','SP005','SP006',
    'SP007','SP008','SP009','SP010','SP011','SP012',
    'SP013','SP014','SP015','SP016','SP017','SP018',
    'SP019','SP020','SP021','SP022','SP023','SP024',
    'SP025','SP026','SP027','SP028','SP029','SP030'
);

SELECT
    COUNT(*) AS TongSanPham,
    SUM(CASE WHEN TrangThai = 'ACTIVE' THEN 1 ELSE 0 END) AS DangHoatDong,
    SUM(CASE WHEN ImageUrl IS NULL THEN 1 ELSE 0 END) AS ChuaCoAnh
FROM dbo.SAN_PHAM
WHERE MaSP IN (
    'SP001','SP002','SP003','SP004','SP005','SP006',
    'SP007','SP008','SP009','SP010','SP011','SP012',
    'SP013','SP014','SP015','SP016','SP017','SP018',
    'SP019','SP020','SP021','SP022','SP023','SP024',
    'SP025','SP026','SP027','SP028','SP029','SP030'
);
