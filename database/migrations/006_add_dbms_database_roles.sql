SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.SCHEMA_MIGRATIONS', N'U') IS NULL
   OR OBJECT_ID(N'dbo.vw_TAI_KHOAN_VAI_TRO', N'V') IS NULL
   OR OBJECT_ID(N'dbo.usp_NHAT_KY_HE_THONG_TraCuu', N'P') IS NULL
   OR (
       SELECT COUNT(*)
       FROM sys.objects
       WHERE schema_id = SCHEMA_ID(N'dbo')
         AND type IN ('FN', 'IF', 'TF')
   ) <> 5
   OR (
       SELECT COUNT(*)
       FROM sys.triggers AS trigger_definition
       JOIN sys.tables AS parent_table
           ON parent_table.object_id = trigger_definition.parent_id
       WHERE trigger_definition.parent_class = 1
         AND trigger_definition.is_ms_shipped = 0
         AND parent_table.schema_id = SCHEMA_ID(N'dbo')
   ) <> 5
    THROW 51070, 'Database-role migration requires the final Phase 4 schema.', 1;

IF DATABASE_PRINCIPAL_ID(N'dbms_customer') IS NULL
    EXEC(N'CREATE ROLE dbms_customer AUTHORIZATION dbo;');

IF DATABASE_PRINCIPAL_ID(N'dbms_cashier') IS NULL
    EXEC(N'CREATE ROLE dbms_cashier AUTHORIZATION dbo;');

IF DATABASE_PRINCIPAL_ID(N'dbms_warehouse') IS NULL
    EXEC(N'CREATE ROLE dbms_warehouse AUTHORIZATION dbo;');

IF DATABASE_PRINCIPAL_ID(N'dbms_manager') IS NULL
    EXEC(N'CREATE ROLE dbms_manager AUTHORIZATION dbo;');

-- CUSTOMER: public catalog and promotion projections only.
GRANT SELECT ON OBJECT::dbo.vw_SAN_PHAM_DANH_MUC TO dbms_customer;
GRANT SELECT ON OBJECT::dbo.vw_KHUYEN_MAI_SAN_PHAM_CHI_TIET TO dbms_customer;

-- CASHIER: POS reads and transaction procedures; no direct table writes.
GRANT SELECT ON OBJECT::dbo.vw_SAN_PHAM_DANH_MUC TO dbms_cashier;
GRANT SELECT ON OBJECT::dbo.vw_KHUYEN_MAI_SAN_PHAM_CHI_TIET TO dbms_cashier;
GRANT SELECT ON OBJECT::dbo.vw_HOA_DON_CHI_TIET TO dbms_cashier;
GRANT SELECT ON OBJECT::dbo.vw_HOA_DON_THANH_TOAN TO dbms_cashier;
GRANT SELECT ON OBJECT::dbo.vw_PHIEU_TRA_CHI_TIET TO dbms_cashier;
GRANT SELECT ON OBJECT::dbo.ufn_SAN_PHAM_CoTheBan TO dbms_cashier;
GRANT SELECT ON OBJECT::dbo.ufn_HOA_DON_PhanBoCoTheTra TO dbms_cashier;
GRANT EXECUTE ON OBJECT::dbo.usp_SAN_PHAM_TraCuu TO dbms_cashier;
GRANT EXECUTE ON OBJECT::dbo.usp_KHUYEN_MAI_DangHieuLuc TO dbms_cashier;
GRANT EXECUTE ON OBJECT::dbo.usp_CA_LAM_VIEC_Mo TO dbms_cashier;
GRANT EXECUTE ON OBJECT::dbo.usp_HOA_DON_HoanTatBanHang TO dbms_cashier;
GRANT EXECUTE ON OBJECT::dbo.usp_HOA_DON_LayChiTiet TO dbms_cashier;
GRANT EXECUTE ON OBJECT::dbo.usp_PHIEU_TRA_HoanTat TO dbms_cashier;

-- WAREHOUSE: receiving, inventory, lot and stocktake execution surfaces.
GRANT SELECT ON OBJECT::dbo.vw_SAN_PHAM_DANH_MUC TO dbms_warehouse;
GRANT SELECT ON OBJECT::dbo.vw_PHIEU_NHAP_CHI_TIET TO dbms_warehouse;
GRANT SELECT ON OBJECT::dbo.vw_LO_HANG_THEO_DOI TO dbms_warehouse;
GRANT SELECT ON OBJECT::dbo.vw_TON_KHO_SAN_PHAM TO dbms_warehouse;
GRANT SELECT ON OBJECT::dbo.vw_TON_KHO_THEO_LO TO dbms_warehouse;
GRANT SELECT ON OBJECT::dbo.vw_KIEM_KE_CHI_TIET TO dbms_warehouse;
GRANT SELECT ON OBJECT::dbo.ufn_LO_HANG_PhanLoaiHanDung TO dbms_warehouse;
GRANT SELECT ON OBJECT::dbo.ufn_LO_HANG_TheoSanPham TO dbms_warehouse;
GRANT SELECT ON OBJECT::dbo.ufn_TON_KHO_TheoSanPham TO dbms_warehouse;
GRANT EXECUTE ON OBJECT::dbo.usp_SAN_PHAM_TraCuu TO dbms_warehouse;
GRANT EXECUTE ON OBJECT::dbo.usp_NHA_CUNG_CAP_TraCuu TO dbms_warehouse;
GRANT EXECUTE ON OBJECT::dbo.usp_PHIEU_NHAP_LuuNhap TO dbms_warehouse;
GRANT EXECUTE ON OBJECT::dbo.usp_CHI_TIET_PHIEU_NHAP_LuuNhap TO dbms_warehouse;
GRANT EXECUTE ON OBJECT::dbo.usp_CHI_TIET_PHIEU_NHAP_Xoa TO dbms_warehouse;
GRANT EXECUTE ON OBJECT::dbo.usp_PHIEU_NHAP_Huy TO dbms_warehouse;
GRANT EXECUTE ON OBJECT::dbo.usp_PHIEU_NHAP_XacNhan TO dbms_warehouse;
GRANT EXECUTE ON OBJECT::dbo.usp_TON_KHO_SAN_PHAM_TraCuu TO dbms_warehouse;
GRANT EXECUTE ON OBJECT::dbo.usp_LO_HANG_TraCuu TO dbms_warehouse;
GRANT EXECUTE ON OBJECT::dbo.usp_KIEM_KE_Tao TO dbms_warehouse;
GRANT EXECUTE ON OBJECT::dbo.usp_CHI_TIET_KIEM_KE_GhiNhan TO dbms_warehouse;

-- MANAGER: safe read models, reports, audit query and non-destructive master data.
GRANT SELECT ON OBJECT::dbo.LOAI_SAN_PHAM TO dbms_manager;
GRANT INSERT ON OBJECT::dbo.LOAI_SAN_PHAM TO dbms_manager;
GRANT UPDATE ON OBJECT::dbo.LOAI_SAN_PHAM TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.SAN_PHAM TO dbms_manager;
GRANT INSERT ON OBJECT::dbo.SAN_PHAM TO dbms_manager;
GRANT UPDATE ON OBJECT::dbo.SAN_PHAM TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.KHUYEN_MAI TO dbms_manager;
GRANT INSERT ON OBJECT::dbo.KHUYEN_MAI TO dbms_manager;
GRANT UPDATE ON OBJECT::dbo.KHUYEN_MAI TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.KHUYEN_MAI_SAN_PHAM TO dbms_manager;
GRANT INSERT ON OBJECT::dbo.KHUYEN_MAI_SAN_PHAM TO dbms_manager;
GRANT UPDATE ON OBJECT::dbo.KHUYEN_MAI_SAN_PHAM TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.NHA_CUNG_CAP TO dbms_manager;
GRANT INSERT ON OBJECT::dbo.NHA_CUNG_CAP TO dbms_manager;
GRANT UPDATE ON OBJECT::dbo.NHA_CUNG_CAP TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.NHAN_VIEN TO dbms_manager;
GRANT INSERT ON OBJECT::dbo.NHAN_VIEN TO dbms_manager;
GRANT UPDATE ON OBJECT::dbo.NHAN_VIEN TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.KHACH_HANG TO dbms_manager;
GRANT INSERT ON OBJECT::dbo.KHACH_HANG TO dbms_manager;
GRANT UPDATE ON OBJECT::dbo.KHACH_HANG TO dbms_manager;

GRANT SELECT ON OBJECT::dbo.vw_TAI_KHOAN_VAI_TRO TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.vw_SAN_PHAM_DANH_MUC TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.vw_KHUYEN_MAI_SAN_PHAM_CHI_TIET TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.vw_PHIEU_NHAP_CHI_TIET TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.vw_LO_HANG_THEO_DOI TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.vw_TON_KHO_SAN_PHAM TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.vw_TON_KHO_THEO_LO TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.vw_HOA_DON_CHI_TIET TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.vw_HOA_DON_THANH_TOAN TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.vw_PHIEU_TRA_CHI_TIET TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.vw_KIEM_KE_CHI_TIET TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.vw_NHAT_KY_HE_THONG_CHI_TIET TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.vw_BAO_CAO_DOANH_THU_SU_KIEN TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.vw_BAO_CAO_HANG_HOA_SU_KIEN TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.vw_BAO_CAO_TON_KHO_HIEN_TAI TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.vw_BAO_CAO_NHAP_HANG_HOP_LE TO dbms_manager;

GRANT SELECT ON OBJECT::dbo.ufn_LO_HANG_PhanLoaiHanDung TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.ufn_LO_HANG_TheoSanPham TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.ufn_TON_KHO_TheoSanPham TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.ufn_SAN_PHAM_CoTheBan TO dbms_manager;
GRANT SELECT ON OBJECT::dbo.ufn_HOA_DON_PhanBoCoTheTra TO dbms_manager;

GRANT EXECUTE ON OBJECT::dbo.usp_SAN_PHAM_TraCuu TO dbms_manager;
GRANT EXECUTE ON OBJECT::dbo.usp_NHA_CUNG_CAP_TraCuu TO dbms_manager;
GRANT EXECUTE ON OBJECT::dbo.usp_KHUYEN_MAI_DangHieuLuc TO dbms_manager;
GRANT EXECUTE ON OBJECT::dbo.usp_SAN_PHAM_LichSuGia TO dbms_manager;
GRANT EXECUTE ON OBJECT::dbo.usp_TON_KHO_SAN_PHAM_TraCuu TO dbms_manager;
GRANT EXECUTE ON OBJECT::dbo.usp_LO_HANG_TraCuu TO dbms_manager;
GRANT EXECUTE ON OBJECT::dbo.usp_HOA_DON_LayChiTiet TO dbms_manager;
GRANT EXECUTE ON OBJECT::dbo.usp_KIEM_KE_PheDuyetDieuChinh TO dbms_manager;
GRANT EXECUTE ON OBJECT::dbo.usp_NHAT_KY_HE_THONG_TraCuu TO dbms_manager;
GRANT EXECUTE ON OBJECT::dbo.usp_BAO_CAO_DoanhThuTongQuan TO dbms_manager;
GRANT EXECUTE ON OBJECT::dbo.usp_BAO_CAO_XuHuongDoanhThu TO dbms_manager;
GRANT EXECUTE ON OBJECT::dbo.usp_BAO_CAO_DoanhThuTheoNganhHang TO dbms_manager;
GRANT EXECUTE ON OBJECT::dbo.usp_BAO_CAO_XepHangSanPham TO dbms_manager;
GRANT EXECUTE ON OBJECT::dbo.usp_BAO_CAO_NhapHangTongQuan TO dbms_manager;
GRANT EXECUTE ON OBJECT::dbo.usp_BAO_CAO_NhapHangTheoNhaCungCap TO dbms_manager;
GRANT EXECUTE ON OBJECT::dbo.usp_BAO_CAO_DoanhThuNhanVien TO dbms_manager;
GRANT EXECUTE ON OBJECT::dbo.usp_BAO_CAO_CaLamViec TO dbms_manager;

-- Authentication hashes remain available only to the backend technical principal.
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.TAI_KHOAN TO dbms_customer;
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.TAI_KHOAN TO dbms_cashier;
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.TAI_KHOAN TO dbms_warehouse;
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.TAI_KHOAN TO dbms_manager;
DENY EXECUTE ON OBJECT::dbo.usp_TAI_KHOAN_LayTheoTenDangNhap TO dbms_customer;
DENY EXECUTE ON OBJECT::dbo.usp_TAI_KHOAN_LayTheoTenDangNhap TO dbms_cashier;
DENY EXECUTE ON OBJECT::dbo.usp_TAI_KHOAN_LayTheoTenDangNhap TO dbms_warehouse;
DENY EXECUTE ON OBJECT::dbo.usp_TAI_KHOAN_LayTheoTenDangNhap TO dbms_manager;

-- Audit and inventory ledgers are exposed only through approved views/procedures.
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.NHAT_KY_HE_THONG TO dbms_customer;
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.NHAT_KY_HE_THONG TO dbms_cashier;
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.NHAT_KY_HE_THONG TO dbms_warehouse;
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.NHAT_KY_HE_THONG TO dbms_manager;
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.GIAO_DICH_KHO TO dbms_customer;
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.GIAO_DICH_KHO TO dbms_cashier;
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.GIAO_DICH_KHO TO dbms_warehouse;
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.GIAO_DICH_KHO TO dbms_manager;

-- Migration history is infrastructure metadata, never application data.
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.SCHEMA_MIGRATIONS TO dbms_customer;
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.SCHEMA_MIGRATIONS TO dbms_cashier;
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.SCHEMA_MIGRATIONS TO dbms_warehouse;
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.SCHEMA_MIGRATIONS TO dbms_manager;

-- Explicit separation for the highest-risk cross-role workflows.
DENY EXECUTE ON OBJECT::dbo.usp_NHAT_KY_HE_THONG_TraCuu TO dbms_customer;
DENY EXECUTE ON OBJECT::dbo.usp_HOA_DON_HoanTatBanHang TO dbms_customer;
DENY EXECUTE ON OBJECT::dbo.usp_PHIEU_NHAP_XacNhan TO dbms_customer;
DENY EXECUTE ON OBJECT::dbo.usp_BAO_CAO_DoanhThuTongQuan TO dbms_customer;

DENY EXECUTE ON OBJECT::dbo.usp_NHAT_KY_HE_THONG_TraCuu TO dbms_cashier;
DENY EXECUTE ON OBJECT::dbo.usp_PHIEU_NHAP_XacNhan TO dbms_cashier;
DENY EXECUTE ON OBJECT::dbo.usp_KIEM_KE_Tao TO dbms_cashier;
DENY EXECUTE ON OBJECT::dbo.usp_BAO_CAO_DoanhThuTongQuan TO dbms_cashier;

DENY EXECUTE ON OBJECT::dbo.usp_NHAT_KY_HE_THONG_TraCuu TO dbms_warehouse;
DENY EXECUTE ON OBJECT::dbo.usp_HOA_DON_HoanTatBanHang TO dbms_warehouse;
DENY EXECUTE ON OBJECT::dbo.usp_PHIEU_TRA_HoanTat TO dbms_warehouse;
DENY EXECUTE ON OBJECT::dbo.usp_KIEM_KE_PheDuyetDieuChinh TO dbms_warehouse;
DENY EXECUTE ON OBJECT::dbo.usp_BAO_CAO_DoanhThuTongQuan TO dbms_warehouse;

IF (
    SELECT COUNT(*)
    FROM sys.database_principals
    WHERE type = 'R'
      AND name IN (N'dbms_customer', N'dbms_cashier', N'dbms_warehouse', N'dbms_manager')
) <> 4
    THROW 51071, 'Phase 5 requires exactly four documented DBMS database roles.', 1;

IF EXISTS (
    SELECT 1
    FROM sys.database_role_members AS drm
    JOIN sys.database_principals AS role_principal
        ON role_principal.principal_id = drm.role_principal_id
    WHERE role_principal.name IN (N'dbms_customer', N'dbms_cashier', N'dbms_warehouse', N'dbms_manager')
      AND drm.member_principal_id = DATABASE_PRINCIPAL_ID(N'dbo')
)
    THROW 51072, 'dbo must not be a member of an application database role.', 1;
