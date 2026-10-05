SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @ExpectedCoreTables TABLE (
    TableName SYSNAME NOT NULL PRIMARY KEY
);

INSERT INTO @ExpectedCoreTables (TableName)
VALUES
    ('VAI_TRO'),
    ('NHAN_VIEN'),
    ('KHACH_HANG'),
    ('TAI_KHOAN'),
    ('CA_LAM_VIEC'),
    ('LOAI_SAN_PHAM'),
    ('SAN_PHAM'),
    ('KHUYEN_MAI'),
    ('KHUYEN_MAI_SAN_PHAM'),
    ('NHA_CUNG_CAP'),
    ('PHIEU_NHAP'),
    ('LO_HANG'),
    ('CHI_TIET_PHIEU_NHAP'),
    ('KIEM_KE'),
    ('CHI_TIET_KIEM_KE'),
    ('GIAO_DICH_KHO'),
    ('HOA_DON'),
    ('CHI_TIET_HOA_DON'),
    ('CHI_TIET_XUAT_LO'),
    ('THANH_TOAN'),
    ('PHIEU_TRA'),
    ('CHI_TIET_PHIEU_TRA'),
    ('NHAT_KY_HE_THONG');

IF (SELECT COUNT(*) FROM @ExpectedCoreTables) <> 23
    THROW 52000, 'Baseline definition must contain exactly 23 core tables.', 1;

IF EXISTS (
    SELECT 1
    FROM @ExpectedCoreTables AS expected
    WHERE OBJECT_ID(N'dbo.' + QUOTENAME(expected.TableName), N'U') IS NULL
)
BEGIN
    DECLARE @MissingTables NVARCHAR(2048);

    SELECT @MissingTables = STUFF((
        SELECT N', ' + expected.TableName
        FROM @ExpectedCoreTables AS expected
        WHERE OBJECT_ID(N'dbo.' + QUOTENAME(expected.TableName), N'U') IS NULL
        ORDER BY expected.TableName
        FOR XML PATH(''), TYPE
    ).value('.', 'NVARCHAR(MAX)'), 1, 2, N'');

    DECLARE @MissingTableMessage NVARCHAR(2048) = N'Baseline verification failed; missing core tables: '
        + COALESCE(@MissingTables, N'unknown');
    THROW 52001, @MissingTableMessage, 1;
END;

IF OBJECT_ID(N'dbo.LICH_SU_GIA', N'U') IS NOT NULL
   OR OBJECT_ID(N'dbo.DON_VI_TINH', N'U') IS NOT NULL
    THROW 52002, 'Baseline verification failed; an out-of-design core table exists.', 1;

IF OBJECT_ID(N'dbo.usp_PHIEU_NHAP_XacNhan', N'P') IS NULL
   OR OBJECT_ID(N'dbo.usp_HOA_DON_HoanTatBanHang', N'P') IS NULL
   OR OBJECT_ID(N'dbo.usp_PHIEU_TRA_HoanTat', N'P') IS NULL
   OR OBJECT_ID(N'dbo.usp_KIEM_KE_PheDuyetDieuChinh', N'P') IS NULL
   OR OBJECT_ID(N'dbo.usp_NHAT_KY_HE_THONG_TraCuu', N'P') IS NULL
   OR OBJECT_ID(N'dbo.usp_BAO_CAO_DoanhThuTongQuan', N'P') IS NULL
    THROW 52003, 'Baseline verification failed; one or more authoritative procedures are missing.', 1;

IF OBJECT_ID(N'dbo.vw_TAI_KHOAN_VAI_TRO', N'V') IS NULL
   OR OBJECT_ID(N'dbo.vw_SAN_PHAM_DANH_MUC', N'V') IS NULL
   OR OBJECT_ID(N'dbo.vw_TON_KHO_SAN_PHAM', N'V') IS NULL
   OR OBJECT_ID(N'dbo.vw_HOA_DON_CHI_TIET', N'V') IS NULL
   OR OBJECT_ID(N'dbo.vw_NHAT_KY_HE_THONG_CHI_TIET', N'V') IS NULL
    THROW 52004, 'Baseline verification failed; one or more required views are missing.', 1;
