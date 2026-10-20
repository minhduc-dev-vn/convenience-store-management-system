SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.SAN_PHAM')
      AND name = 'IX_SAN_PHAM_TenSP_TrangThai'
)
BEGIN
    CREATE INDEX IX_SAN_PHAM_TenSP_TrangThai
        ON dbo.SAN_PHAM (TenSP, TrangThai)
        INCLUDE (MaVach, DonViTinh, GiaBan, MaLoai, MucTonToiThieu);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.TAI_KHOAN')
      AND name = 'IX_TAI_KHOAN_TrangThai_MaVaiTro'
)
BEGIN
    CREATE INDEX IX_TAI_KHOAN_TrangThai_MaVaiTro
        ON dbo.TAI_KHOAN (TrangThai, MaVaiTro)
        INCLUDE (TenDangNhap, MaNV, MaKH, NgayTao);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.HOA_DON')
      AND name = 'IX_HOA_DON_NgayLap_TrangThai'
)
BEGIN
    CREATE INDEX IX_HOA_DON_NgayLap_TrangThai
        ON dbo.HOA_DON (NgayLap DESC, TrangThai)
        INCLUDE (MaHD, MaCa, MaKH, TongThanhToan);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.LO_HANG')
      AND name = 'IX_LO_HANG_HanSuDung_TrangThai'
)
BEGIN
    CREATE INDEX IX_LO_HANG_HanSuDung_TrangThai
        ON dbo.LO_HANG (HanSuDung, TrangThai, MaSP)
        INCLUDE (MaLo, SoLo, SoLuongTon, GiaNhap);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.NHAT_KY_HE_THONG')
      AND name = 'IX_NHAT_KY_HE_THONG_HanhDong_ThoiGian'
)
BEGIN
    CREATE INDEX IX_NHAT_KY_HE_THONG_HanhDong_ThoiGian
        ON dbo.NHAT_KY_HE_THONG (HanhDong, ThoiGian DESC)
        INCLUDE (MaTK, TenBang, MaBanGhi, DiaChiIP);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.TAI_KHOAN')
      AND name = 'UQ_TAI_KHOAN_TenDangNhap'
      AND is_unique = 1
)
    THROW 51020, 'The unique username index required for login is missing.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.SAN_PHAM')
      AND name = 'UX_SAN_PHAM_MaVach'
      AND is_unique = 1
      AND has_filter = 1
)
    THROW 51021, 'The filtered unique barcode index is missing.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.LO_HANG')
      AND name = 'UQ_LO_HANG_MaSP_SoLo'
      AND is_unique = 1
)
    THROW 51022, 'The unique product-lot index is missing.', 1;
GO

PRINT 'Lookup and filter indexes are ready.';
GO
