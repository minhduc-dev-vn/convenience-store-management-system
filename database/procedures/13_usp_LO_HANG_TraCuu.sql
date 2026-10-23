SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_LO_HANG_TraCuu;
GO

CREATE PROCEDURE dbo.usp_LO_HANG_TraCuu
    @MaSP VARCHAR(10) = NULL,
    @TuKhoa NVARCHAR(150) = NULL,
    @MaLoai VARCHAR(10) = NULL,
    @TinhTrangHanDung VARCHAR(20) = 'ALL',
    @TrangThaiLo VARCHAR(20) = NULL,
    @NgayThamChieu DATE = NULL,
    @NguongCanHanNgay INT = 30,
    @SoTrang INT = 1,
    @KichThuocTrang INT = 20
AS
BEGIN
    SET NOCOUNT ON;

    SET @MaSP = NULLIF(LTRIM(RTRIM(@MaSP)), '');
    SET @TuKhoa = NULLIF(LTRIM(RTRIM(@TuKhoa)), N'');
    SET @MaLoai = NULLIF(LTRIM(RTRIM(@MaLoai)), '');
    SET @TinhTrangHanDung = UPPER(COALESCE(NULLIF(LTRIM(RTRIM(@TinhTrangHanDung)), ''), 'ALL'));
    SET @TrangThaiLo = UPPER(NULLIF(LTRIM(RTRIM(@TrangThaiLo)), ''));
    SET @NgayThamChieu = COALESCE(
        @NgayThamChieu,
        CONVERT(DATE, (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'SE Asia Standard Time')
    );

    IF @TinhTrangHanDung NOT IN ('ALL', 'VALID', 'NEAR_EXPIRY', 'EXPIRED')
        THROW 51420, 'Lot expiry status must be ALL, VALID, NEAR_EXPIRY or EXPIRED.', 1;

    IF @TrangThaiLo IS NOT NULL AND @TrangThaiLo NOT IN ('ACTIVE', 'BLOCKED', 'EXPIRED')
        THROW 51421, 'Lot status must be ACTIVE, BLOCKED or EXPIRED.', 1;

    IF @NguongCanHanNgay IS NULL OR @NguongCanHanNgay < 0 OR @NguongCanHanNgay > 3650
        THROW 51422, 'Near-expiry threshold must be between 0 and 3650 days.', 1;

    IF @SoTrang < 1
        THROW 51423, 'Lot page must be greater than or equal to 1.', 1;

    IF @KichThuocTrang < 1 OR @KichThuocTrang > 100
        THROW 51424, 'Lot page size must be between 1 and 100.', 1;

    IF @MaSP IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.SAN_PHAM WHERE MaSP = @MaSP)
        THROW 51425, 'Lot product does not exist.', 1;

    IF @MaLoai IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = @MaLoai)
        THROW 51426, 'Lot category does not exist.', 1;

    DECLARE @Offset BIGINT = CONVERT(BIGINT, @SoTrang - 1) * @KichThuocTrang;

    IF @Offset > 2147483647
        THROW 51427, 'Lot page offset is too large.', 1;

    DECLARE @TenPrefix NVARCHAR(304) = NULL;

    IF @TuKhoa IS NOT NULL
        SET @TenPrefix = REPLACE(REPLACE(REPLACE(@TuKhoa, N'~', N'~~'), N'%', N'~%'), N'_', N'~_') + N'%';

    ;WITH ClassifiedLots AS (
        SELECT
            lot.MaLo,
            lot.MaSP,
            lot.TenSP,
            lot.DonViTinh,
            lot.MaLoai,
            lot.TenLoai,
            lot.SoLo,
            lot.NgaySanXuat,
            lot.HanSuDung,
            lot.GiaNhap,
            lot.SoLuongTon,
            lot.TrangThaiLo,
            CASE
                WHEN lot.HanSuDung IS NULL THEN NULL
                ELSE DATEDIFF(DAY, @NgayThamChieu, lot.HanSuDung)
            END AS SoNgayConLai,
            CONVERT(VARCHAR(20), CASE
                WHEN lot.TrangThaiLo = 'EXPIRED'
                  OR (lot.HanSuDung IS NOT NULL AND lot.HanSuDung <= @NgayThamChieu)
                    THEN 'EXPIRED'
                WHEN lot.HanSuDung > @NgayThamChieu
                 AND lot.HanSuDung <= DATEADD(DAY, @NguongCanHanNgay, @NgayThamChieu)
                    THEN 'NEAR_EXPIRY'
                ELSE 'VALID'
            END) AS TinhTrangHanDung
        FROM dbo.vw_TON_KHO_THEO_LO AS lot
        WHERE lot.SoLuongTon > 0
    )
    SELECT
        lot.MaLo,
        lot.MaSP,
        lot.TenSP,
        lot.DonViTinh,
        lot.MaLoai,
        lot.TenLoai,
        lot.SoLo,
        lot.NgaySanXuat,
        lot.HanSuDung,
        lot.GiaNhap,
        lot.SoLuongTon,
        lot.TrangThaiLo,
        lot.SoNgayConLai,
        lot.TinhTrangHanDung,
        COUNT_BIG(*) OVER () AS TongSoBanGhi
    FROM ClassifiedLots AS lot
    WHERE (@MaSP IS NULL OR lot.MaSP = @MaSP)
      AND (@MaLoai IS NULL OR lot.MaLoai = @MaLoai)
      AND (@TrangThaiLo IS NULL OR lot.TrangThaiLo = @TrangThaiLo)
      AND (@TinhTrangHanDung = 'ALL' OR lot.TinhTrangHanDung = @TinhTrangHanDung)
      AND (
          @TuKhoa IS NULL
          OR (LEN(@TuKhoa) <= 10 AND lot.MaSP = CONVERT(VARCHAR(10), @TuKhoa))
          OR lot.TenSP LIKE @TenPrefix ESCAPE N'~'
      )
    ORDER BY
        CASE lot.TinhTrangHanDung
            WHEN 'EXPIRED' THEN 1
            WHEN 'NEAR_EXPIRY' THEN 2
            ELSE 3
        END,
        CASE WHEN lot.HanSuDung IS NULL THEN 1 ELSE 0 END,
        lot.HanSuDung,
        lot.MaSP,
        lot.SoLo,
        lot.MaLo
    OFFSET CONVERT(INT, @Offset) ROWS FETCH NEXT @KichThuocTrang ROWS ONLY;
END;
GO
