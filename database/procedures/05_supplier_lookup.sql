SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_NHA_CUNG_CAP_TraCuu;
GO

CREATE PROCEDURE dbo.usp_NHA_CUNG_CAP_TraCuu
    @TuKhoa NVARCHAR(150) = NULL,
    @TrangThai VARCHAR(20) = NULL,
    @SoTrang INT = 1,
    @KichThuocTrang INT = 20
AS
BEGIN
    SET NOCOUNT ON;

    SET @TuKhoa = NULLIF(LTRIM(RTRIM(@TuKhoa)), N'');
    SET @TrangThai = UPPER(NULLIF(LTRIM(RTRIM(@TrangThai)), ''));

    IF @TrangThai IS NOT NULL AND @TrangThai NOT IN ('ACTIVE', 'INACTIVE')
        THROW 51220, 'Supplier status must be ACTIVE or INACTIVE.', 1;

    IF @SoTrang < 1
        THROW 51221, 'Supplier page must be greater than or equal to 1.', 1;

    IF @KichThuocTrang < 1 OR @KichThuocTrang > 100
        THROW 51222, 'Supplier page size must be between 1 and 100.', 1;

    DECLARE @Offset BIGINT = CONVERT(BIGINT, @SoTrang - 1) * @KichThuocTrang;

    IF @Offset > 2147483647
        THROW 51223, 'Supplier page offset is too large.', 1;

    DECLARE @NamePrefix NVARCHAR(304) = NULL;
    DECLARE @PhonePrefix VARCHAR(304) = NULL;

    IF @TuKhoa IS NOT NULL
    BEGIN
        SET @NamePrefix = REPLACE(REPLACE(REPLACE(@TuKhoa, N'~', N'~~'), N'%', N'~%'), N'_', N'~_') + N'%';
        SET @PhonePrefix = REPLACE(REPLACE(REPLACE(CONVERT(VARCHAR(150), @TuKhoa), '~', '~~'), '%', '~%'), '_', '~_') + '%';
    END;

    SELECT
        supplier.MaNCC,
        supplier.TenNCC,
        supplier.SDT,
        supplier.Email,
        supplier.DiaChi,
        supplier.MaSoThue,
        supplier.TrangThai,
        COUNT_BIG(*) OVER () AS TongSoBanGhi
    FROM dbo.NHA_CUNG_CAP AS supplier
    WHERE (@TrangThai IS NULL OR supplier.TrangThai = @TrangThai)
      AND (
          @TuKhoa IS NULL
          OR supplier.TenNCC LIKE @NamePrefix ESCAPE N'~'
          OR supplier.SDT LIKE @PhonePrefix ESCAPE '~'
      )
    ORDER BY supplier.TenNCC, supplier.MaNCC
    OFFSET CONVERT(INT, @Offset) ROWS FETCH NEXT @KichThuocTrang ROWS ONLY;
END;
GO

PRINT 'Parameterized supplier lookup by name/phone with status and pagination is ready.';
GO
