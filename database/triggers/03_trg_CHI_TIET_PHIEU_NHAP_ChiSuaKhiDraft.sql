SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Chỉ cho phép thay đổi chi tiết khi phiếu nhập còn ở trạng thái DRAFT.
CREATE OR ALTER TRIGGER dbo.trg_CHI_TIET_PHIEU_NHAP_ChiSuaKhiDraft
ON dbo.CHI_TIET_PHIEU_NHAP
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
            SELECT MaPN FROM inserted
            UNION
            SELECT MaPN FROM deleted
        ) AS affected
        JOIN dbo.PHIEU_NHAP AS receipt ON receipt.MaPN = affected.MaPN
        WHERE receipt.TrangThai <> 'DRAFT'
    )
        THROW 53201, 'Receipt details can only be changed while the receipt is DRAFT.', 1;
END;
GO
