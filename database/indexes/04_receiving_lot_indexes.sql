SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.PHIEU_NHAP')
      AND name = 'IX_PHIEU_NHAP_TrangThai_NgayNhap'
)
BEGIN
    CREATE INDEX IX_PHIEU_NHAP_TrangThai_NgayNhap
        ON dbo.PHIEU_NHAP (TrangThai, NgayNhap DESC)
        INCLUDE (MaPN, MaNV, MaNCC, TongTien, NgayXacNhan);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.CHI_TIET_PHIEU_NHAP')
      AND name = 'IX_CHI_TIET_PHIEU_NHAP_MaLo'
)
BEGIN
    CREATE INDEX IX_CHI_TIET_PHIEU_NHAP_MaLo
        ON dbo.CHI_TIET_PHIEU_NHAP (MaLo)
        INCLUDE (MaPN, SoLuong, DonGiaNhap);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.LO_HANG')
      AND name = 'IX_LO_HANG_HanSuDung_TrangThai'
)
BEGIN
    CREATE INDEX IX_LO_HANG_HanSuDung_TrangThai
        ON dbo.LO_HANG (HanSuDung, TrangThai)
        INCLUDE (MaLo, MaSP, SoLo, NgaySanXuat, SoLuongTon, GiaNhap)
        WHERE HanSuDung IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.GIAO_DICH_KHO')
      AND name = 'UX_GIAO_DICH_KHO_IMPORT_MaThamChieu_MaLo'
)
BEGIN
    CREATE UNIQUE INDEX UX_GIAO_DICH_KHO_IMPORT_MaThamChieu_MaLo
        ON dbo.GIAO_DICH_KHO (MaThamChieu, MaLo)
        WHERE LoaiGiaoDich = 'IMPORT' AND MaThamChieu IS NOT NULL;
END;
GO

DECLARE @RequiredReceivingIndexes TABLE (
    TableName SYSNAME NOT NULL,
    IndexName SYSNAME NOT NULL,
    IsUnique BIT NOT NULL,
    PRIMARY KEY (TableName, IndexName)
);

INSERT INTO @RequiredReceivingIndexes (TableName, IndexName, IsUnique)
VALUES
    ('PHIEU_NHAP', 'IX_PHIEU_NHAP_TrangThai_NgayNhap', 0),
    ('CHI_TIET_PHIEU_NHAP', 'IX_CHI_TIET_PHIEU_NHAP_MaLo', 0),
    ('LO_HANG', 'IX_LO_HANG_HanSuDung_TrangThai', 0),
    ('GIAO_DICH_KHO', 'UX_GIAO_DICH_KHO_IMPORT_MaThamChieu_MaLo', 1);

IF EXISTS (
    SELECT 1
    FROM @RequiredReceivingIndexes AS required
    WHERE NOT EXISTS (
        SELECT 1
        FROM sys.indexes AS actual
        WHERE actual.object_id = OBJECT_ID(N'dbo.' + required.TableName)
          AND actual.name = required.IndexName
          AND actual.is_unique = required.IsUnique
          AND actual.is_disabled = 0
    )
)
    THROW 51300, 'One or more receiving/lot indexes are missing or invalid.', 1;
GO

PRINT 'Receiving, lot-expiry and idempotent import indexes are ready.';
GO
