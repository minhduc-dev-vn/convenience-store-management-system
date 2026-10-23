SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_CA_LAM_VIEC_Mo;
GO

CREATE PROCEDURE dbo.usp_CA_LAM_VIEC_Mo
    @MaNV VARCHAR(10),
    @TienDauCa DECIMAL(18,2) = 0,
    @GhiChu NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @MaNV = NULLIF(LTRIM(RTRIM(@MaNV)), '');
    SET @GhiChu = NULLIF(LTRIM(RTRIM(@GhiChu)), N'');

    IF @MaNV IS NULL
        THROW 51501, 'Employee code is required to open a shift.', 1;

    IF @TienDauCa IS NULL OR @TienDauCa < 0
        THROW 51502, 'Opening cash must be greater than or equal to zero.', 1;

    DECLARE @InitialTransactionCount INT = @@TRANCOUNT;

    BEGIN TRY
        IF @InitialTransactionCount = 0
            BEGIN TRANSACTION;
        ELSE
            SAVE TRANSACTION OpenCashierShift;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.NHAN_VIEN AS employee WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.TAI_KHOAN AS account WITH (UPDLOCK, HOLDLOCK)
                ON account.MaNV = employee.MaNV
            WHERE employee.MaNV = @MaNV
              AND employee.TrangThai = 'ACTIVE'
              AND account.MaVaiTro = 'CASHIER'
              AND account.TrangThai = 'ACTIVE'
        )
            THROW 51503, 'An active CASHIER employee account is required to open a shift.', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.CA_LAM_VIEC WITH (UPDLOCK, HOLDLOCK)
            WHERE MaNV = @MaNV
              AND TrangThai = 'OPEN'
        )
            THROW 51504, 'The cashier already has an OPEN shift.', 1;

        INSERT INTO dbo.CA_LAM_VIEC (MaNV, TienDauCa, TrangThai, GhiChu)
        VALUES (@MaNV, @TienDauCa, 'OPEN', @GhiChu);

        DECLARE @MaCa BIGINT = SCOPE_IDENTITY();

        IF @InitialTransactionCount = 0
            COMMIT TRANSACTION;

        SELECT MaCa, MaNV, GioBatDau, TienDauCa, TrangThai, GhiChu
        FROM dbo.CA_LAM_VIEC
        WHERE MaCa = @MaCa;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() = -1
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1 AND @InitialTransactionCount = 0
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1
            ROLLBACK TRANSACTION OpenCashierShift;

        THROW;
    END CATCH;
END;
GO
