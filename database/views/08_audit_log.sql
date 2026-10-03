SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DROP VIEW IF EXISTS dbo.vw_NHAT_KY_HE_THONG_CHI_TIET;
GO

CREATE VIEW dbo.vw_NHAT_KY_HE_THONG_CHI_TIET
AS
    SELECT
        audit_log.MaNhatKy,
        audit_log.MaTK,
        account_role.TenDangNhap,
        account_role.MaVaiTro,
        account_role.TenVaiTro,
        account_role.LoaiChuSoHuu,
        account_role.MaChuSoHuu,
        account_role.TenChuSoHuu,
        audit_log.HanhDong,
        audit_log.TenBang,
        audit_log.MaBanGhi,
        CASE
            WHEN payload.CoDuLieuNhayCam = 1 THEN N'[REDACTED]'
            ELSE audit_log.DuLieuCu
        END AS DuLieuCu,
        CASE
            WHEN payload.CoDuLieuNhayCam = 1 THEN N'[REDACTED]'
            ELSE audit_log.DuLieuMoi
        END AS DuLieuMoi,
        CONVERT(BIT, CASE WHEN ISJSON(audit_log.DuLieuCu) = 1 THEN 1 ELSE 0 END) AS DuLieuCuLaJson,
        CONVERT(BIT, CASE WHEN ISJSON(audit_log.DuLieuMoi) = 1 THEN 1 ELSE 0 END) AS DuLieuMoiLaJson,
        audit_log.ThoiGian,
        audit_log.DiaChiIP
    FROM dbo.NHAT_KY_HE_THONG AS audit_log
    LEFT JOIN dbo.vw_TAI_KHOAN_VAI_TRO AS account_role
        ON account_role.MaTK = audit_log.MaTK
    CROSS APPLY (
        SELECT LOWER(CONCAT(COALESCE(audit_log.DuLieuCu, N''), N' ', COALESCE(audit_log.DuLieuMoi, N'')))
    ) AS normalized(NormalizedPayload)
    CROSS APPLY (
        SELECT CONVERT(BIT, CASE
            WHEN normalized.NormalizedPayload LIKE N'%matkhau%'
              OR normalized.NormalizedPayload LIKE N'%mật khẩu%'
              OR normalized.NormalizedPayload LIKE N'%password%'
              OR normalized.NormalizedPayload LIKE N'%token%'
              OR normalized.NormalizedPayload LIKE N'%secret%'
              OR normalized.NormalizedPayload LIKE N'%authorization%'
              OR normalized.NormalizedPayload LIKE N'%jwt%'
              OR normalized.NormalizedPayload LIKE N'%credential%'
              OR normalized.NormalizedPayload LIKE N'%api_key%'
              OR normalized.NormalizedPayload LIKE N'%apikey%'
                THEN 1
            ELSE 0
        END)
    ) AS payload(CoDuLieuNhayCam);
GO

PRINT 'Detailed audit view is ready with actor context and defensive payload redaction.';
GO
