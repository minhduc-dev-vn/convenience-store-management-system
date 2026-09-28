SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_SAN_PHAM_TraCuu;
GO

CREATE PROCEDURE dbo.usp_SAN_PHAM_TraCuu
    @TuKhoa NVARCHAR(150) = NULL,
    @MaLoai VARCHAR(10) = NULL,
    @TrangThai VARCHAR(20) = NULL,
    @SoTrang INT = 1,
    @KichThuocTrang INT = 20
AS
BEGIN
    SET NOCOUNT ON;

    SET @TuKhoa = NULLIF(LTRIM(RTRIM(@TuKhoa)), N'');
    SET @MaLoai = NULLIF(LTRIM(RTRIM(@MaLoai)), '');
    SET @TrangThai = UPPER(NULLIF(LTRIM(RTRIM(@TrangThai)), ''));

    IF @TrangThai IS NOT NULL AND @TrangThai NOT IN ('ACTIVE', 'INACTIVE')
        THROW 51200, 'Product status must be ACTIVE or INACTIVE.', 1;

    IF @SoTrang < 1
        THROW 51201, 'Product page must be greater than or equal to 1.', 1;

    IF @KichThuocTrang < 1 OR @KichThuocTrang > 100
        THROW 51202, 'Product page size must be between 1 and 100.', 1;

    IF @MaLoai IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = @MaLoai)
        THROW 51203, 'Product category does not exist.', 1;

    DECLARE @Offset BIGINT = CONVERT(BIGINT, @SoTrang - 1) * @KichThuocTrang;

    IF @Offset > 2147483647
        THROW 51204, 'Product page offset is too large.', 1;

    DECLARE @TenPrefix NVARCHAR(304) = NULL;

    IF @TuKhoa IS NOT NULL
    BEGIN
        SET @TenPrefix = REPLACE(REPLACE(REPLACE(@TuKhoa, N'~', N'~~'), N'%', N'~%'), N'_', N'~_') + N'%';
    END;

    SELECT
        product.MaSP,
        product.TenSP,
        product.MaVach,
        product.DonViTinh,
        product.GiaBan,
        product.MucTonToiThieu,
        product.MaLoai,
        product.TenLoai,
        product.TrangThai,
        COUNT_BIG(*) OVER () AS TongSoBanGhi
    FROM dbo.vw_SAN_PHAM_DANH_MUC AS product
    WHERE (@TrangThai IS NULL OR product.TrangThai = @TrangThai)
      AND (@MaLoai IS NULL OR product.MaLoai = @MaLoai)
      AND (
          @TuKhoa IS NULL
          OR (LEN(@TuKhoa) <= 10 AND product.MaSP = CONVERT(VARCHAR(10), @TuKhoa))
          OR (LEN(@TuKhoa) <= 30 AND product.MaVach = CONVERT(VARCHAR(30), @TuKhoa))
          OR product.TenSP LIKE @TenPrefix ESCAPE N'~'
      )
    ORDER BY product.TenSP, product.MaSP
    OFFSET CONVERT(INT, @Offset) ROWS FETCH NEXT @KichThuocTrang ROWS ONLY;
END;
GO

PRINT 'Parameterized product lookup with status/category filters and pagination is ready.';
GO
