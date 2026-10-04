SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.HOA_DON')
      AND name = 'IX_HOA_DON_BaoCao_TrangThai_NgayLap'
)
BEGIN
    CREATE INDEX IX_HOA_DON_BaoCao_TrangThai_NgayLap
        ON dbo.HOA_DON (TrangThai, NgayLap, MaCa)
        INCLUDE (MaHD, TongTienHang, TongGiamGia, TongThanhToan);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.PHIEU_TRA')
      AND name = 'IX_PHIEU_TRA_BaoCao_TrangThai_NgayTra'
)
BEGIN
    CREATE INDEX IX_PHIEU_TRA_BaoCao_TrangThai_NgayTra
        ON dbo.PHIEU_TRA (TrangThai, NgayTra, MaHD)
        INCLUDE (MaPT, TongTienHoan, MaNV);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.PHIEU_NHAP')
      AND name = 'IX_PHIEU_NHAP_BaoCao_TrangThai_NgayXacNhan'
)
BEGIN
    CREATE INDEX IX_PHIEU_NHAP_BaoCao_TrangThai_NgayXacNhan
        ON dbo.PHIEU_NHAP (TrangThai, NgayXacNhan, MaNCC)
        INCLUDE (MaPN, MaNV, TongTien);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.CA_LAM_VIEC')
      AND name = 'IX_CA_LAM_VIEC_BaoCao_GioBatDau'
)
BEGIN
    CREATE INDEX IX_CA_LAM_VIEC_BaoCao_GioBatDau
        ON dbo.CA_LAM_VIEC (GioBatDau, MaNV)
        INCLUDE (MaCa, GioKetThuc, TienDauCa, TienCuoiCa, TrangThai);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.CHI_TIET_PHIEU_TRA')
      AND name = 'IX_CHI_TIET_PHIEU_TRA_BaoCao_MaPT'
)
BEGIN
    CREATE INDEX IX_CHI_TIET_PHIEU_TRA_BaoCao_MaPT
        ON dbo.CHI_TIET_PHIEU_TRA (MaPT, MaCTHD)
        INCLUDE (SoLuongTra, TienHoan);
END;
GO

DECLARE @RequiredReportIndexes TABLE (
    TableName SYSNAME NOT NULL,
    IndexName SYSNAME NOT NULL,
    PRIMARY KEY (TableName, IndexName)
);

INSERT INTO @RequiredReportIndexes (TableName, IndexName)
VALUES
    ('HOA_DON', 'IX_HOA_DON_BaoCao_TrangThai_NgayLap'),
    ('PHIEU_TRA', 'IX_PHIEU_TRA_BaoCao_TrangThai_NgayTra'),
    ('PHIEU_NHAP', 'IX_PHIEU_NHAP_BaoCao_TrangThai_NgayXacNhan'),
    ('CA_LAM_VIEC', 'IX_CA_LAM_VIEC_BaoCao_GioBatDau'),
    ('CHI_TIET_PHIEU_TRA', 'IX_CHI_TIET_PHIEU_TRA_BaoCao_MaPT');

IF EXISTS (
    SELECT 1
    FROM @RequiredReportIndexes AS required
    WHERE NOT EXISTS (
        SELECT 1
        FROM sys.indexes AS actual
        WHERE actual.object_id = OBJECT_ID(N'dbo.' + required.TableName)
          AND actual.name = required.IndexName
          AND actual.is_disabled = 0
    )
)
    THROW 51900, 'One or more business-report indexes are missing or disabled.', 1;
GO

PRINT 'Business-report date, status, shift and return-detail indexes are ready.';
GO
