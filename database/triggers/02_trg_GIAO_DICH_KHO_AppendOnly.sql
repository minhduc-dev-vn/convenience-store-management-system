SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Bảo vệ tính bất biến của các bản ghi lịch sử giao dịch kho.
CREATE OR ALTER TRIGGER dbo.trg_GIAO_DICH_KHO_AppendOnly
ON dbo.GIAO_DICH_KHO
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF COALESCE(IS_SRVROLEMEMBER('sysadmin'), 0) = 1
       OR COALESCE(IS_ROLEMEMBER('db_owner'), 0) = 1
        RETURN;

    IF EXISTS (SELECT 1 FROM deleted)
        THROW 53200, 'Inventory movements are append-only and cannot be updated or deleted.', 1;
END;
GO
