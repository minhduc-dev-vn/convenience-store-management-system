SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.NHAT_KY_HE_THONG')
      AND name = 'IX_NHAT_KY_HE_THONG_ThoiGian'
)
    DROP INDEX IX_NHAT_KY_HE_THONG_ThoiGian ON dbo.NHAT_KY_HE_THONG;
GO

CREATE INDEX IX_NHAT_KY_HE_THONG_ThoiGian
    ON dbo.NHAT_KY_HE_THONG (ThoiGian DESC, MaNhatKy DESC)
    INCLUDE (MaTK, HanhDong, TenBang, MaBanGhi, DiaChiIP);
GO

IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.NHAT_KY_HE_THONG')
      AND name = 'IX_NHAT_KY_HE_THONG_MaTK_ThoiGian'
)
    DROP INDEX IX_NHAT_KY_HE_THONG_MaTK_ThoiGian ON dbo.NHAT_KY_HE_THONG;
GO

CREATE INDEX IX_NHAT_KY_HE_THONG_MaTK_ThoiGian
    ON dbo.NHAT_KY_HE_THONG (MaTK, ThoiGian DESC, MaNhatKy DESC)
    INCLUDE (HanhDong, TenBang, MaBanGhi, DiaChiIP)
    WHERE MaTK IS NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.NHAT_KY_HE_THONG')
      AND name = 'IX_NHAT_KY_HE_THONG_HanhDong_ThoiGian'
)
    THROW 51801, 'The audit action/time index is missing.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.NHAT_KY_HE_THONG')
      AND name = 'IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian'
)
    THROW 51802, 'The audit table/record/time index is missing.', 1;
GO

PRINT 'Audit time, actor, action and target lookup indexes are ready.';
GO
