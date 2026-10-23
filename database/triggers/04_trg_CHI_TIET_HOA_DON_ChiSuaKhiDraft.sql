SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Chỉ cho phép thay đổi chi tiết khi hóa đơn còn ở trạng thái DRAFT.
CREATE OR ALTER TRIGGER dbo.trg_CHI_TIET_HOA_DON_ChiSuaKhiDraft
ON dbo.CHI_TIET_HOA_DON
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF COALESCE(IS_SRVROLEMEMBER('sysadmin'), 0) = 1
       OR COALESCE(IS_ROLEMEMBER('db_owner'), 0) = 1
        RETURN;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT MaHD FROM inserted
            UNION
            SELECT MaHD FROM deleted
        ) AS affected
        JOIN dbo.HOA_DON AS invoice ON invoice.MaHD = affected.MaHD
        WHERE invoice.TrangThai <> 'DRAFT'
    )
        THROW 53202, 'Invoice details can only be changed while the invoice is DRAFT.', 1;
END;
GO
