SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF NOT EXISTS (SELECT 1 FROM dbo.NHAN_VIEN WHERE MaNV = 'NVDEV001')
    BEGIN
        INSERT INTO dbo.NHAN_VIEN (MaNV, HoTen, SDT, NgayVaoLam, LuongCoBan, TrangThai)
        VALUES ('NVDEV001', N'Nhân viên phát triển', '0000000001', '2026-01-01', 0, 'ACTIVE');
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'LDEV001')
    BEGIN
        INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, MoTa, TrangThai)
        VALUES ('LDEV001', N'Danh mục phát triển', N'Dữ liệu tối thiểu phục vụ smoke test môi trường development.', 'ACTIVE');
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.SAN_PHAM WHERE MaSP = 'SPDEV001')
    BEGIN
        INSERT INTO dbo.SAN_PHAM (
            MaSP, TenSP, MaVach, DonViTinh, GiaBan, MucTonToiThieu, MaLoai, TrangThai
        )
        VALUES (
            'SPDEV001', N'Sản phẩm kiểm thử', 'DEV-BARCODE-0001', N'Sản phẩm', 10000, 0, 'LDEV001', 'ACTIVE'
        );
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.NHA_CUNG_CAP WHERE MaNCC = 'NCCDEV001')
    BEGIN
        INSERT INTO dbo.NHA_CUNG_CAP (MaNCC, TenNCC, SDT, TrangThai)
        VALUES ('NCCDEV001', N'Nhà cung cấp phát triển', '0000000002', 'ACTIVE');
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = 'LODEV001')
    BEGIN
        INSERT INTO dbo.LO_HANG (
            MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
        )
        VALUES (
            'LODEV001', 'SPDEV001', 'DEV-LOT-001', '2026-01-01', '2099-12-31', 5000, 0, 'ACTIVE'
        );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
