SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER TRIGGER dbo.trg_NHAT_KY_HE_THONG_AppendOnly
ON dbo.NHAT_KY_HE_THONG
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- db_owner/sysadmin giữ đường bảo trì có kiểm soát; application principal
    -- không được sửa hoặc xóa lịch sử audit.
    IF COALESCE(IS_SRVROLEMEMBER('sysadmin'), 0) = 1
       OR COALESCE(IS_ROLEMEMBER('db_owner'), 0) = 1
        RETURN;

    THROW 51820, 'Audit log entries are append-only and cannot be updated or deleted.', 1;
END;
GO
