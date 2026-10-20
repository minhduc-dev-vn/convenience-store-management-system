SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @RequiredObjects TABLE (
    ObjectName NVARCHAR(261) NOT NULL,
    ObjectType CHAR(2) NOT NULL
);

INSERT INTO @RequiredObjects (ObjectName, ObjectType)
VALUES
    (N'dbo.NHAN_VIEN', N'U'),
    (N'dbo.KHACH_HANG', N'U'),
    (N'dbo.TAI_KHOAN', N'U'),
    (N'dbo.CA_LAM_VIEC', N'U'),
    (N'dbo.PHIEU_NHAP', N'U'),
    (N'dbo.KIEM_KE', N'U'),
    (N'dbo.GIAO_DICH_KHO', N'U'),
    (N'dbo.HOA_DON', N'U'),
    (N'dbo.THANH_TOAN', N'U'),
    (N'dbo.PHIEU_TRA', N'U'),
    (N'dbo.NHAT_KY_HE_THONG', N'U');

IF EXISTS (
    SELECT 1
    FROM @RequiredObjects AS required
    WHERE OBJECT_ID(required.ObjectName, required.ObjectType) IS NULL
)
BEGIN
    THROW 51020, 'Business-timezone migration requires the complete core schema.', 1;
END;

ALTER TABLE dbo.NHAN_VIEN DROP CONSTRAINT DF_NHAN_VIEN_NgayVaoLam;
ALTER TABLE dbo.NHAN_VIEN ADD CONSTRAINT DF_NHAN_VIEN_NgayVaoLam DEFAULT (
    CONVERT(DATE, (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'SE Asia Standard Time')
) FOR NgayVaoLam;

ALTER TABLE dbo.KHACH_HANG DROP CONSTRAINT DF_KHACH_HANG_NgayDangKy;
ALTER TABLE dbo.KHACH_HANG ADD CONSTRAINT DF_KHACH_HANG_NgayDangKy
    DEFAULT (SYSUTCDATETIME()) FOR NgayDangKy;

ALTER TABLE dbo.TAI_KHOAN DROP CONSTRAINT DF_TAI_KHOAN_NgayTao;
ALTER TABLE dbo.TAI_KHOAN ADD CONSTRAINT DF_TAI_KHOAN_NgayTao
    DEFAULT (SYSUTCDATETIME()) FOR NgayTao;

ALTER TABLE dbo.CA_LAM_VIEC DROP CONSTRAINT DF_CA_LAM_VIEC_GioBatDau;
ALTER TABLE dbo.CA_LAM_VIEC ADD CONSTRAINT DF_CA_LAM_VIEC_GioBatDau
    DEFAULT (SYSUTCDATETIME()) FOR GioBatDau;

ALTER TABLE dbo.PHIEU_NHAP DROP CONSTRAINT DF_PHIEU_NHAP_NgayNhap;
ALTER TABLE dbo.PHIEU_NHAP ADD CONSTRAINT DF_PHIEU_NHAP_NgayNhap
    DEFAULT (SYSUTCDATETIME()) FOR NgayNhap;

ALTER TABLE dbo.KIEM_KE DROP CONSTRAINT DF_KIEM_KE_NgayKiemKe;
ALTER TABLE dbo.KIEM_KE ADD CONSTRAINT DF_KIEM_KE_NgayKiemKe
    DEFAULT (SYSUTCDATETIME()) FOR NgayKiemKe;

ALTER TABLE dbo.GIAO_DICH_KHO DROP CONSTRAINT DF_GIAO_DICH_KHO_ThoiGian;
ALTER TABLE dbo.GIAO_DICH_KHO ADD CONSTRAINT DF_GIAO_DICH_KHO_ThoiGian
    DEFAULT (SYSUTCDATETIME()) FOR ThoiGian;

ALTER TABLE dbo.HOA_DON DROP CONSTRAINT DF_HOA_DON_NgayLap;
ALTER TABLE dbo.HOA_DON ADD CONSTRAINT DF_HOA_DON_NgayLap
    DEFAULT (SYSUTCDATETIME()) FOR NgayLap;

ALTER TABLE dbo.THANH_TOAN DROP CONSTRAINT DF_THANH_TOAN_ThoiGian;
ALTER TABLE dbo.THANH_TOAN ADD CONSTRAINT DF_THANH_TOAN_ThoiGian
    DEFAULT (SYSUTCDATETIME()) FOR ThoiGian;

ALTER TABLE dbo.PHIEU_TRA DROP CONSTRAINT DF_PHIEU_TRA_NgayTra;
ALTER TABLE dbo.PHIEU_TRA ADD CONSTRAINT DF_PHIEU_TRA_NgayTra
    DEFAULT (SYSUTCDATETIME()) FOR NgayTra;

ALTER TABLE dbo.NHAT_KY_HE_THONG DROP CONSTRAINT DF_NHAT_KY_HE_THONG_ThoiGian;
ALTER TABLE dbo.NHAT_KY_HE_THONG ADD CONSTRAINT DF_NHAT_KY_HE_THONG_ThoiGian
    DEFAULT (SYSUTCDATETIME()) FOR ThoiGian;

-- Module definitions use CREATE OR ALTER inside dynamic batches because the
-- migration runner executes this file as one batch.


EXEC(N'CREATE OR ALTER VIEW dbo.vw_LO_HANG_THEO_DOI
AS
SELECT
    lot.MaLo,
    lot.MaSP,
    product.TenSP,
    product.DonViTinh,
    lot.SoLo,
    lot.NgaySanXuat,
    lot.HanSuDung,
    lot.GiaNhap,
    lot.SoLuongTon,
    lot.TrangThai,
    CASE
        WHEN lot.HanSuDung IS NULL THEN NULL
        ELSE DATEDIFF(
            DAY,
            CONVERT(DATE, (SYSUTCDATETIME() AT TIME ZONE ''UTC'') AT TIME ZONE ''SE Asia Standard Time''),
            lot.HanSuDung
        )
    END AS SoNgayConLai,
    CONVERT(BIT, CASE
        WHEN lot.HanSuDung < CONVERT(
            DATE,
            (SYSUTCDATETIME() AT TIME ZONE ''UTC'') AT TIME ZONE ''SE Asia Standard Time''
        ) THEN 1
        ELSE 0
    END) AS DaHetHan,
    CONVERT(BIT, CASE
        WHEN lot.HanSuDung >= CONVERT(
                DATE,
                (SYSUTCDATETIME() AT TIME ZONE ''UTC'') AT TIME ZONE ''SE Asia Standard Time''
             )
         AND lot.HanSuDung <= DATEADD(
                DAY,
                30,
                CONVERT(DATE, (SYSUTCDATETIME() AT TIME ZONE ''UTC'') AT TIME ZONE ''SE Asia Standard Time'')
             ) THEN 1
        ELSE 0
    END) AS SapHetHan
FROM dbo.LO_HANG AS lot
JOIN dbo.SAN_PHAM AS product
    ON product.MaSP = lot.MaSP
WHERE lot.SoLuongTon > 0;');



EXEC(N'CREATE OR ALTER VIEW dbo.vw_BAO_CAO_TON_KHO_HIEN_TAI
AS
    SELECT
        product.MaSP,
        product.TenSP,
        product.DonViTinh,
        product.MaLoai,
        category.TenLoai,
        product.MucTonToiThieu,
        product.TrangThai AS TrangThaiSanPham,
        SUM(CONVERT(BIGINT, COALESCE(lot.SoLuongTon, 0))) AS TongTon,
        SUM(CONVERT(BIGINT, CASE
            WHEN lot.TrangThai = ''ACTIVE''
             AND (
                 lot.HanSuDung IS NULL
                 OR lot.HanSuDung >= CONVERT(
                     DATE,
                     (SYSUTCDATETIME() AT TIME ZONE ''UTC'') AT TIME ZONE ''SE Asia Standard Time''
                 )
             )
                THEN lot.SoLuongTon
            ELSE 0
        END)) AS TonCoTheBan,
        SUM(CONVERT(BIGINT, CASE
            WHEN lot.TrangThai = ''BLOCKED'' THEN lot.SoLuongTon ELSE 0
        END)) AS TonBiKhoa,
        SUM(CONVERT(BIGINT, CASE
            WHEN lot.TrangThai = ''EXPIRED''
              OR (
                  lot.HanSuDung IS NOT NULL
                  AND lot.HanSuDung < CONVERT(
                      DATE,
                      (SYSUTCDATETIME() AT TIME ZONE ''UTC'') AT TIME ZONE ''SE Asia Standard Time''
                  )
              )
                THEN lot.SoLuongTon
            ELSE 0
        END)) AS TonHetHan,
        SUM(CONVERT(DECIMAL(38,2), COALESCE(lot.SoLuongTon, 0) * COALESCE(lot.GiaNhap, 0))) AS GiaTriTonTheoGiaNhap,
        SUM(CONVERT(BIGINT, CASE WHEN lot.SoLuongTon > 0 THEN 1 ELSE 0 END)) AS SoLoConTon
    FROM dbo.SAN_PHAM AS product
    JOIN dbo.LOAI_SAN_PHAM AS category
        ON category.MaLoai = product.MaLoai
    LEFT JOIN dbo.LO_HANG AS lot
        ON lot.MaSP = product.MaSP
    GROUP BY
        product.MaSP,
        product.TenSP,
        product.DonViTinh,
        product.MaLoai,
        category.TenLoai,
        product.MucTonToiThieu,
        product.TrangThai;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_KHUYEN_MAI_DangHieuLuc
    @ThoiDiem DATETIME2(0) = NULL,
    @MaSP VARCHAR(10) = NULL,
    @GiaTriDonHang DECIMAL(18,2) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SET @ThoiDiem = COALESCE(@ThoiDiem, SYSUTCDATETIME());
    SET @MaSP = NULLIF(LTRIM(RTRIM(@MaSP)), '''');

    IF @GiaTriDonHang IS NOT NULL AND @GiaTriDonHang < 0
        THROW 51210, ''Order value for promotion lookup cannot be negative.'', 1;

    IF @MaSP IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.SAN_PHAM WHERE MaSP = @MaSP)
        THROW 51211, ''Promotion product does not exist.'', 1;

    SELECT
        promotion.MaKM,
        promotion.TenKM,
        promotion.LoaiKM,
        promotion.GiaTri,
        promotion.GiaTriDonToiThieu,
        promotion.MucGiamToiDa,
        promotion.NgayBatDau,
        promotion.NgayKetThuc,
        promotion.TrangThai,
        product_scope.SoSanPhamApDung
    FROM dbo.KHUYEN_MAI AS promotion
    CROSS APPLY (
        SELECT COUNT_BIG(*) AS SoSanPhamApDung
        FROM dbo.KHUYEN_MAI_SAN_PHAM AS promotion_product
        WHERE promotion_product.MaKM = promotion.MaKM
    ) AS product_scope
    WHERE promotion.TrangThai = ''ACTIVE''
      AND promotion.NgayBatDau <= @ThoiDiem
      AND promotion.NgayKetThuc > @ThoiDiem
      AND (@GiaTriDonHang IS NULL OR @GiaTriDonHang >= promotion.GiaTriDonToiThieu)
      AND (
          @MaSP IS NULL
          OR EXISTS (
              SELECT 1
              FROM dbo.KHUYEN_MAI_SAN_PHAM AS promotion_product
              WHERE promotion_product.MaKM = promotion.MaKM
                AND promotion_product.MaSP = @MaSP
          )
      )
    ORDER BY promotion.NgayKetThuc, promotion.MaKM;
END;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_PHIEU_NHAP_LuuNhap
    @MaPN VARCHAR(15),
    @MaNV VARCHAR(10),
    @MaNCC VARCHAR(10),
    @NgayNhap DATETIME2(0) = NULL,
    @GhiChu NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @MaPN = NULLIF(LTRIM(RTRIM(@MaPN)), '''');
    SET @MaNV = NULLIF(LTRIM(RTRIM(@MaNV)), '''');
    SET @MaNCC = NULLIF(LTRIM(RTRIM(@MaNCC)), '''');
    SET @GhiChu = NULLIF(LTRIM(RTRIM(@GhiChu)), N'''');

    IF @MaPN IS NULL
        THROW 51301, ''Receipt code is required.'', 1;

    IF @MaNV IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.NHAN_VIEN WHERE MaNV = @MaNV)
        THROW 51302, ''Receipt employee does not exist.'', 1;

    IF @MaNCC IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.NHA_CUNG_CAP WHERE MaNCC = @MaNCC)
        THROW 51303, ''Receipt supplier does not exist.'', 1;

    DECLARE @InitialTransactionCount INT = @@TRANCOUNT;

    BEGIN TRY
        IF @InitialTransactionCount = 0
            BEGIN TRANSACTION;
        ELSE
            SAVE TRANSACTION SaveReceiptDraft;

        DECLARE @CurrentStatus VARCHAR(20);

        SELECT @CurrentStatus = TrangThai
        FROM dbo.PHIEU_NHAP WITH (UPDLOCK, HOLDLOCK)
        WHERE MaPN = @MaPN;

        IF @CurrentStatus IS NULL
        BEGIN
            INSERT INTO dbo.PHIEU_NHAP (
                MaPN, NgayNhap, MaNV, MaNCC, TongTien, TrangThai, NgayXacNhan, GhiChu
            )
            VALUES (
                @MaPN, COALESCE(@NgayNhap, SYSUTCDATETIME()), @MaNV, @MaNCC, 0, ''DRAFT'', NULL, @GhiChu
            );
        END
        ELSE
        BEGIN
            IF @CurrentStatus <> ''DRAFT''
                THROW 51304, ''Only a DRAFT receipt can be updated.'', 1;

            UPDATE dbo.PHIEU_NHAP
            SET NgayNhap = COALESCE(@NgayNhap, NgayNhap),
                MaNV = @MaNV,
                MaNCC = @MaNCC,
                GhiChu = @GhiChu
            WHERE MaPN = @MaPN;
        END;

        IF @InitialTransactionCount = 0
            COMMIT TRANSACTION;

        SELECT
            MaPN, NgayNhap, MaNV, MaNCC, TongTien, TrangThai, NgayXacNhan, GhiChu
        FROM dbo.PHIEU_NHAP
        WHERE MaPN = @MaPN;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() = -1
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1 AND @InitialTransactionCount = 0
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1
            ROLLBACK TRANSACTION SaveReceiptDraft;

        THROW;
    END CATCH;
END;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_PHIEU_NHAP_XacNhan
    @MaPN VARCHAR(15)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @MaPN = NULLIF(LTRIM(RTRIM(@MaPN)), '''');

    IF @MaPN IS NULL
        THROW 51330, ''Receipt code is required.'', 1;

    DECLARE @InitialTransactionCount INT = @@TRANCOUNT;

    BEGIN TRY
        IF @InitialTransactionCount = 0
            BEGIN TRANSACTION;
        ELSE
            SAVE TRANSACTION ConfirmReceipt;

        DECLARE
            @ReceiptStatus VARCHAR(20),
            @EmployeeCode VARCHAR(10),
            @ConfirmationTime DATETIME2(0) = SYSUTCDATETIME(),
            @ReceiptTotal DECIMAL(18,2);

        SELECT
            @ReceiptStatus = TrangThai,
            @EmployeeCode = MaNV
        FROM dbo.PHIEU_NHAP WITH (UPDLOCK, HOLDLOCK)
        WHERE MaPN = @MaPN;

        IF @ReceiptStatus IS NULL
            THROW 51331, ''Receipt does not exist.'', 1;

        IF @ReceiptStatus = ''CONFIRMED''
            THROW 51332, ''Receipt has already been confirmed.'', 1;

        IF @ReceiptStatus <> ''DRAFT''
            THROW 51333, ''Only a DRAFT receipt can be confirmed.'', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.GIAO_DICH_KHO WITH (UPDLOCK, HOLDLOCK)
            WHERE LoaiGiaoDich = ''IMPORT''
              AND MaThamChieu = @MaPN
        )
            THROW 51334, ''Receipt already has an import stock transaction.'', 1;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_PHIEU_NHAP
            WHERE MaPN = @MaPN
        )
            THROW 51335, ''Receipt must contain at least one detail before confirmation.'', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_PHIEU_NHAP AS detail
            LEFT JOIN dbo.LO_HANG AS lot WITH (UPDLOCK, HOLDLOCK)
                ON lot.MaLo = detail.MaLo
            WHERE detail.MaPN = @MaPN
              AND (
                  detail.SoLuong <= 0
                  OR detail.DonGiaNhap < 0
                  OR lot.MaLo IS NULL
                  OR (lot.HanSuDung IS NOT NULL AND lot.NgaySanXuat IS NOT NULL AND lot.HanSuDung <= lot.NgaySanXuat)
              )
        )
            THROW 51336, ''Receipt contains an invalid quantity, unit cost or lot date relation.'', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_PHIEU_NHAP AS detail
            JOIN dbo.LO_HANG AS lot WITH (UPDLOCK, HOLDLOCK)
                ON lot.MaLo = detail.MaLo
            WHERE detail.MaPN = @MaPN
              AND lot.SoLuongTon > 2147483647 - detail.SoLuong
        )
            THROW 51337, ''Confirming the receipt would overflow lot inventory.'', 1;

        SELECT @ReceiptTotal = SUM(detail.ThanhTien)
        FROM dbo.CHI_TIET_PHIEU_NHAP AS detail
        WHERE detail.MaPN = @MaPN;

        UPDATE dbo.PHIEU_NHAP
        SET TongTien = @ReceiptTotal,
            TrangThai = ''CONFIRMED'',
            NgayXacNhan = @ConfirmationTime
        WHERE MaPN = @MaPN;

        UPDATE lot
        SET lot.SoLuongTon = lot.SoLuongTon + detail.SoLuong,
            lot.GiaNhap = detail.DonGiaNhap
        FROM dbo.LO_HANG AS lot
        JOIN dbo.CHI_TIET_PHIEU_NHAP AS detail
            ON detail.MaLo = lot.MaLo
        WHERE detail.MaPN = @MaPN;

        INSERT INTO dbo.GIAO_DICH_KHO (
            MaSP,
            MaLo,
            LoaiGiaoDich,
            SoLuongBienDong,
            ThoiGian,
            MaThamChieu,
            MaNV,
            GhiChu
        )
        SELECT
            lot.MaSP,
            detail.MaLo,
            ''IMPORT'',
            detail.SoLuong,
            @ConfirmationTime,
            @MaPN,
            @EmployeeCode,
            N''Xác nhận nhập kho từ phiếu nhập '' + @MaPN
        FROM dbo.CHI_TIET_PHIEU_NHAP AS detail
        JOIN dbo.LO_HANG AS lot
            ON lot.MaLo = detail.MaLo
        WHERE detail.MaPN = @MaPN;

        IF @InitialTransactionCount = 0
            COMMIT TRANSACTION;

        SELECT
            receipt.MaPN,
            receipt.TrangThai,
            receipt.NgayXacNhan,
            receipt.TongTien,
            COUNT_BIG(stock_transaction.MaGiaoDich) AS SoGiaoDichNhap
        FROM dbo.PHIEU_NHAP AS receipt
        LEFT JOIN dbo.GIAO_DICH_KHO AS stock_transaction
            ON stock_transaction.MaThamChieu = receipt.MaPN
           AND stock_transaction.LoaiGiaoDich = ''IMPORT''
        WHERE receipt.MaPN = @MaPN
        GROUP BY receipt.MaPN, receipt.TrangThai, receipt.NgayXacNhan, receipt.TongTien;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() = -1
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1 AND @InitialTransactionCount = 0
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1
            ROLLBACK TRANSACTION ConfirmReceipt;

        THROW;
    END CATCH;
END;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_TON_KHO_SAN_PHAM_TraCuu
    @TuKhoa NVARCHAR(150) = NULL,
    @MaLoai VARCHAR(10) = NULL,
    @CheDo VARCHAR(20) = ''ALL'',
    @NgayThamChieu DATE = NULL,
    @NguongCanHanNgay INT = 30,
    @SoTrang INT = 1,
    @KichThuocTrang INT = 20
AS
BEGIN
    SET NOCOUNT ON;

    SET @TuKhoa = NULLIF(LTRIM(RTRIM(@TuKhoa)), N'''');
    SET @MaLoai = NULLIF(LTRIM(RTRIM(@MaLoai)), '''');
    SET @CheDo = UPPER(COALESCE(NULLIF(LTRIM(RTRIM(@CheDo)), ''''), ''ALL''));
    SET @NgayThamChieu = COALESCE(
        @NgayThamChieu,
        CONVERT(DATE, (SYSUTCDATETIME() AT TIME ZONE ''UTC'') AT TIME ZONE ''SE Asia Standard Time'')
    );

    IF @CheDo NOT IN (''ALL'', ''LOW_STOCK'', ''NEAR_EXPIRY'', ''EXPIRED'')
        THROW 51410, ''Inventory mode must be ALL, LOW_STOCK, NEAR_EXPIRY or EXPIRED.'', 1;

    IF @NguongCanHanNgay IS NULL OR @NguongCanHanNgay < 0 OR @NguongCanHanNgay > 3650
        THROW 51411, ''Near-expiry threshold must be between 0 and 3650 days.'', 1;

    IF @SoTrang < 1
        THROW 51412, ''Inventory page must be greater than or equal to 1.'', 1;

    IF @KichThuocTrang < 1 OR @KichThuocTrang > 100
        THROW 51413, ''Inventory page size must be between 1 and 100.'', 1;

    IF @MaLoai IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = @MaLoai)
        THROW 51414, ''Inventory category does not exist.'', 1;

    DECLARE @Offset BIGINT = CONVERT(BIGINT, @SoTrang - 1) * @KichThuocTrang;

    IF @Offset > 2147483647
        THROW 51415, ''Inventory page offset is too large.'', 1;

    DECLARE @TenPrefix NVARCHAR(304) = NULL;

    IF @TuKhoa IS NOT NULL
        SET @TenPrefix = REPLACE(REPLACE(REPLACE(@TuKhoa, N''~'', N''~~''), N''%'', N''~%''), N''_'', N''~_'') + N''%'';

    ;WITH LotMetrics AS (
        SELECT
            product.MaSP,
            SUM(CONVERT(BIGINT, COALESCE(lot.SoLuongTon, 0))) AS TongTon,
            COALESCE(SUM(CONVERT(BIGINT, CASE
                WHEN lot.TrangThai = ''ACTIVE''
                 AND (lot.HanSuDung IS NULL OR lot.HanSuDung > @NgayThamChieu)
                    THEN lot.SoLuongTon
                ELSE 0
            END)), 0) AS TongTonKhaDung,
            COALESCE(SUM(CONVERT(BIGINT, CASE
                WHEN lot.TrangThai = ''ACTIVE''
                 AND lot.HanSuDung > @NgayThamChieu
                 AND lot.HanSuDung <= DATEADD(DAY, @NguongCanHanNgay, @NgayThamChieu)
                    THEN lot.SoLuongTon
                ELSE 0
            END)), 0) AS TongTonCanHan,
            COALESCE(SUM(CONVERT(BIGINT, CASE
                WHEN lot.TrangThai = ''EXPIRED''
                  OR (lot.HanSuDung IS NOT NULL AND lot.HanSuDung <= @NgayThamChieu)
                    THEN lot.SoLuongTon
                ELSE 0
            END)), 0) AS TongTonHetHan,
            COALESCE(SUM(CONVERT(BIGINT, CASE
                WHEN lot.TrangThai = ''BLOCKED''
                 AND (lot.HanSuDung IS NULL OR lot.HanSuDung > @NgayThamChieu)
                    THEN lot.SoLuongTon
                ELSE 0
            END)), 0) AS TongTonBiKhoa,
            SUM(CONVERT(BIGINT, CASE WHEN lot.SoLuongTon > 0 THEN 1 ELSE 0 END)) AS SoLoConTon,
            SUM(CONVERT(BIGINT, CASE
                WHEN lot.SoLuongTon > 0
                 AND lot.TrangThai = ''ACTIVE''
                 AND lot.HanSuDung > @NgayThamChieu
                 AND lot.HanSuDung <= DATEADD(DAY, @NguongCanHanNgay, @NgayThamChieu)
                    THEN 1
                ELSE 0
            END)) AS SoLoCanHan,
            SUM(CONVERT(BIGINT, CASE
                WHEN lot.SoLuongTon > 0
                 AND (
                     lot.TrangThai = ''EXPIRED''
                     OR (lot.HanSuDung IS NOT NULL AND lot.HanSuDung <= @NgayThamChieu)
                 )
                    THEN 1
                ELSE 0
            END)) AS SoLoHetHan
        FROM dbo.SAN_PHAM AS product
        LEFT JOIN dbo.LO_HANG AS lot
            ON lot.MaSP = product.MaSP
        GROUP BY product.MaSP
    ),
    Inventory AS (
        SELECT
            product.MaSP,
            product.TenSP,
            product.DonViTinh,
            product.MucTonToiThieu,
            product.MaLoai,
            category.TenLoai,
            product.TrangThai AS TrangThaiSanPham,
            metrics.TongTon,
            metrics.TongTonKhaDung,
            metrics.TongTonCanHan,
            metrics.TongTonHetHan,
            metrics.TongTonBiKhoa,
            metrics.SoLoConTon,
            metrics.SoLoCanHan,
            metrics.SoLoHetHan,
            CONVERT(BIT, CASE
                WHEN metrics.TongTonKhaDung < product.MucTonToiThieu THEN 1
                ELSE 0
            END) AS CanhBaoTonThap
        FROM dbo.SAN_PHAM AS product
        JOIN dbo.LOAI_SAN_PHAM AS category
            ON category.MaLoai = product.MaLoai
        JOIN LotMetrics AS metrics
            ON metrics.MaSP = product.MaSP
    )
    SELECT
        inventory.MaSP,
        inventory.TenSP,
        inventory.DonViTinh,
        inventory.MucTonToiThieu,
        inventory.MaLoai,
        inventory.TenLoai,
        inventory.TrangThaiSanPham,
        inventory.TongTon,
        inventory.TongTonKhaDung,
        inventory.TongTonCanHan,
        inventory.TongTonHetHan,
        inventory.TongTonBiKhoa,
        inventory.SoLoConTon,
        inventory.SoLoCanHan,
        inventory.SoLoHetHan,
        inventory.CanhBaoTonThap,
        COUNT_BIG(*) OVER () AS TongSoBanGhi
    FROM Inventory AS inventory
    WHERE (@MaLoai IS NULL OR inventory.MaLoai = @MaLoai)
      AND (
          @TuKhoa IS NULL
          OR (LEN(@TuKhoa) <= 10 AND inventory.MaSP = CONVERT(VARCHAR(10), @TuKhoa))
          OR inventory.TenSP LIKE @TenPrefix ESCAPE N''~''
      )
      AND (
          @CheDo = ''ALL''
          OR (@CheDo = ''LOW_STOCK'' AND inventory.CanhBaoTonThap = 1)
          OR (@CheDo = ''NEAR_EXPIRY'' AND inventory.SoLoCanHan > 0)
          OR (@CheDo = ''EXPIRED'' AND inventory.SoLoHetHan > 0)
      )
    ORDER BY inventory.TenSP, inventory.MaSP
    OFFSET CONVERT(INT, @Offset) ROWS FETCH NEXT @KichThuocTrang ROWS ONLY;
END;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_LO_HANG_TraCuu
    @MaSP VARCHAR(10) = NULL,
    @TuKhoa NVARCHAR(150) = NULL,
    @MaLoai VARCHAR(10) = NULL,
    @TinhTrangHanDung VARCHAR(20) = ''ALL'',
    @TrangThaiLo VARCHAR(20) = NULL,
    @NgayThamChieu DATE = NULL,
    @NguongCanHanNgay INT = 30,
    @SoTrang INT = 1,
    @KichThuocTrang INT = 20
AS
BEGIN
    SET NOCOUNT ON;

    SET @MaSP = NULLIF(LTRIM(RTRIM(@MaSP)), '''');
    SET @TuKhoa = NULLIF(LTRIM(RTRIM(@TuKhoa)), N'''');
    SET @MaLoai = NULLIF(LTRIM(RTRIM(@MaLoai)), '''');
    SET @TinhTrangHanDung = UPPER(COALESCE(NULLIF(LTRIM(RTRIM(@TinhTrangHanDung)), ''''), ''ALL''));
    SET @TrangThaiLo = UPPER(NULLIF(LTRIM(RTRIM(@TrangThaiLo)), ''''));
    SET @NgayThamChieu = COALESCE(
        @NgayThamChieu,
        CONVERT(DATE, (SYSUTCDATETIME() AT TIME ZONE ''UTC'') AT TIME ZONE ''SE Asia Standard Time'')
    );

    IF @TinhTrangHanDung NOT IN (''ALL'', ''VALID'', ''NEAR_EXPIRY'', ''EXPIRED'')
        THROW 51420, ''Lot expiry status must be ALL, VALID, NEAR_EXPIRY or EXPIRED.'', 1;

    IF @TrangThaiLo IS NOT NULL AND @TrangThaiLo NOT IN (''ACTIVE'', ''BLOCKED'', ''EXPIRED'')
        THROW 51421, ''Lot status must be ACTIVE, BLOCKED or EXPIRED.'', 1;

    IF @NguongCanHanNgay IS NULL OR @NguongCanHanNgay < 0 OR @NguongCanHanNgay > 3650
        THROW 51422, ''Near-expiry threshold must be between 0 and 3650 days.'', 1;

    IF @SoTrang < 1
        THROW 51423, ''Lot page must be greater than or equal to 1.'', 1;

    IF @KichThuocTrang < 1 OR @KichThuocTrang > 100
        THROW 51424, ''Lot page size must be between 1 and 100.'', 1;

    IF @MaSP IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.SAN_PHAM WHERE MaSP = @MaSP)
        THROW 51425, ''Lot product does not exist.'', 1;

    IF @MaLoai IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = @MaLoai)
        THROW 51426, ''Lot category does not exist.'', 1;

    DECLARE @Offset BIGINT = CONVERT(BIGINT, @SoTrang - 1) * @KichThuocTrang;

    IF @Offset > 2147483647
        THROW 51427, ''Lot page offset is too large.'', 1;

    DECLARE @TenPrefix NVARCHAR(304) = NULL;

    IF @TuKhoa IS NOT NULL
        SET @TenPrefix = REPLACE(REPLACE(REPLACE(@TuKhoa, N''~'', N''~~''), N''%'', N''~%''), N''_'', N''~_'') + N''%'';

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
                WHEN lot.TrangThaiLo = ''EXPIRED''
                  OR (lot.HanSuDung IS NOT NULL AND lot.HanSuDung <= @NgayThamChieu)
                    THEN ''EXPIRED''
                WHEN lot.HanSuDung > @NgayThamChieu
                 AND lot.HanSuDung <= DATEADD(DAY, @NguongCanHanNgay, @NgayThamChieu)
                    THEN ''NEAR_EXPIRY''
                ELSE ''VALID''
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
      AND (@TinhTrangHanDung = ''ALL'' OR lot.TinhTrangHanDung = @TinhTrangHanDung)
      AND (
          @TuKhoa IS NULL
          OR (LEN(@TuKhoa) <= 10 AND lot.MaSP = CONVERT(VARCHAR(10), @TuKhoa))
          OR lot.TenSP LIKE @TenPrefix ESCAPE N''~''
      )
    ORDER BY
        CASE lot.TinhTrangHanDung
            WHEN ''EXPIRED'' THEN 1
            WHEN ''NEAR_EXPIRY'' THEN 2
            ELSE 3
        END,
        CASE WHEN lot.HanSuDung IS NULL THEN 1 ELSE 0 END,
        lot.HanSuDung,
        lot.MaSP,
        lot.SoLo,
        lot.MaLo
    OFFSET CONVERT(INT, @Offset) ROWS FETCH NEXT @KichThuocTrang ROWS ONLY;
END;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_HOA_DON_HoanTatBanHang
    @MaHD VARCHAR(15),
    @MaCa BIGINT,
    @MaKH VARCHAR(10) = NULL,
    @DanhSachSanPham NVARCHAR(MAX),
    @MaKM VARCHAR(12) = NULL,
    @PhuongThuc VARCHAR(20),
    @SoTienThanhToan DECIMAL(18,2),
    @MaGiaoDichNgoai VARCHAR(100) = NULL,
    @GhiChu NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @MaHD = NULLIF(LTRIM(RTRIM(@MaHD)), '''');
    SET @MaKH = NULLIF(LTRIM(RTRIM(@MaKH)), '''');
    SET @MaKM = NULLIF(LTRIM(RTRIM(@MaKM)), '''');
    SET @PhuongThuc = UPPER(NULLIF(LTRIM(RTRIM(@PhuongThuc)), ''''));
    SET @MaGiaoDichNgoai = NULLIF(LTRIM(RTRIM(@MaGiaoDichNgoai)), '''');
    SET @GhiChu = NULLIF(LTRIM(RTRIM(@GhiChu)), N'''');

    IF @MaHD IS NULL
        THROW 51510, ''Invoice code is required.'', 1;

    IF @DanhSachSanPham IS NULL
       OR ISJSON(@DanhSachSanPham) <> 1
       OR LEFT(LTRIM(@DanhSachSanPham), 1) <> ''[''
        THROW 51511, ''Sale items must be a JSON array.'', 1;

    IF @PhuongThuc IS NULL
       OR @PhuongThuc NOT IN (''CASH'', ''CARD'', ''TRANSFER'', ''EWALLET'')
        THROW 51512, ''Unsupported payment method.'', 1;

    IF @SoTienThanhToan IS NULL OR @SoTienThanhToan <= 0
        THROW 51513, ''Payment amount must be greater than zero.'', 1;

    DECLARE @Items TABLE (
        RowNumber INT NOT NULL PRIMARY KEY,
        MaSP VARCHAR(10) NULL,
        SoLuong INT NULL
    );

    INSERT INTO @Items (RowNumber, MaSP, SoLuong)
    SELECT
        TRY_CONVERT(INT, item.[key]),
        NULLIF(LTRIM(RTRIM(parsed.MaSP)), ''''),
        parsed.SoLuong
    FROM OPENJSON(@DanhSachSanPham) AS item
    CROSS APPLY OPENJSON(item.[value])
        WITH (
            MaSP VARCHAR(10) ''$.MaSP'',
            SoLuong INT ''$.SoLuong''
        ) AS parsed;

    IF NOT EXISTS (SELECT 1 FROM @Items)
       OR EXISTS (SELECT 1 FROM @Items WHERE MaSP IS NULL OR SoLuong IS NULL OR SoLuong <= 0)
        THROW 51514, ''Every sale item requires a product code and a positive integer quantity.'', 1;

    IF EXISTS (
        SELECT MaSP
        FROM @Items
        GROUP BY MaSP
        HAVING COUNT(*) > 1
    )
        THROW 51515, ''A product can appear only once in a sale request.'', 1;

    DECLARE @Cart TABLE (
        MaSP VARCHAR(10) NOT NULL PRIMARY KEY,
        SoLuong INT NOT NULL,
        DonGiaBan DECIMAL(18,2) NOT NULL,
        TienHang DECIMAL(18,2) NOT NULL,
        DuocKhuyenMai BIT NOT NULL DEFAULT (0),
        TienGiam DECIMAL(18,2) NOT NULL DEFAULT (0)
    );

    DECLARE @InitialTransactionCount INT = @@TRANCOUNT;

    BEGIN TRY
        IF @InitialTransactionCount = 0
            BEGIN TRANSACTION;
        ELSE
            SAVE TRANSACTION FinalizeSale;

        IF EXISTS (
            SELECT 1
            FROM dbo.HOA_DON WITH (UPDLOCK, HOLDLOCK)
            WHERE MaHD = @MaHD
        )
            THROW 51516, ''Invoice code already exists.'', 1;

        DECLARE
            @MaNV VARCHAR(10),
            @ThoiGian DATETIME2(0) = SYSUTCDATETIME();

        DECLARE @NgayNghiepVu DATE = CONVERT(
            DATE,
            (@ThoiGian AT TIME ZONE ''UTC'') AT TIME ZONE ''SE Asia Standard Time''
        );

        SELECT @MaNV = work_shift.MaNV
        FROM dbo.CA_LAM_VIEC AS work_shift WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.NHAN_VIEN AS employee WITH (UPDLOCK, HOLDLOCK)
            ON employee.MaNV = work_shift.MaNV
        JOIN dbo.TAI_KHOAN AS account WITH (UPDLOCK, HOLDLOCK)
            ON account.MaNV = employee.MaNV
        WHERE work_shift.MaCa = @MaCa
          AND work_shift.TrangThai = ''OPEN''
          AND employee.TrangThai = ''ACTIVE''
          AND account.MaVaiTro = ''CASHIER''
          AND account.TrangThai = ''ACTIVE'';

        IF @MaNV IS NULL
            THROW 51517, ''Sale requires an OPEN shift owned by an active CASHIER account.'', 1;

        IF @MaKH IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
               FROM dbo.KHACH_HANG WITH (UPDLOCK, HOLDLOCK)
               WHERE MaKH = @MaKH
                 AND TrangThai = ''ACTIVE''
           )
            THROW 51518, ''Customer member does not exist or is inactive.'', 1;

        INSERT INTO @Cart (MaSP, SoLuong, DonGiaBan, TienHang)
        SELECT
            item.MaSP,
            item.SoLuong,
            product.GiaBan,
            CONVERT(DECIMAL(18,2), item.SoLuong * product.GiaBan)
        FROM @Items AS item
        JOIN dbo.SAN_PHAM AS product WITH (UPDLOCK, HOLDLOCK)
            ON product.MaSP = item.MaSP
           AND product.TrangThai = ''ACTIVE''
        JOIN dbo.LOAI_SAN_PHAM AS category WITH (UPDLOCK, HOLDLOCK)
            ON category.MaLoai = product.MaLoai
           AND category.TrangThai = ''ACTIVE'';

        IF (SELECT COUNT(*) FROM @Cart) <> (SELECT COUNT(*) FROM @Items)
            THROW 51519, ''Every sale product and category must exist and be ACTIVE.'', 1;

        DECLARE
            @TongTienHang DECIMAL(18,2),
            @TongGiamGia DECIMAL(18,2) = 0,
            @TongThanhToan DECIMAL(18,2),
            @LoaiKM VARCHAR(20),
            @GiaTriKM DECIMAL(18,2),
            @GiaTriDonToiThieu DECIMAL(18,2),
            @MucGiamToiDa DECIMAL(18,2),
            @TongTienDuocKhuyenMai DECIMAL(18,2),
            @TongDaPhanBo DECIMAL(18,2),
            @SoCentConLai INT;

        SELECT @TongTienHang = SUM(TienHang)
        FROM @Cart;

        IF @MaKM IS NOT NULL
        BEGIN
            SELECT
                @LoaiKM = promotion.LoaiKM,
                @GiaTriKM = promotion.GiaTri,
                @GiaTriDonToiThieu = promotion.GiaTriDonToiThieu,
                @MucGiamToiDa = promotion.MucGiamToiDa
            FROM dbo.KHUYEN_MAI AS promotion WITH (UPDLOCK, HOLDLOCK)
            WHERE promotion.MaKM = @MaKM
              AND promotion.TrangThai = ''ACTIVE''
              AND promotion.NgayBatDau <= @ThoiGian
              AND promotion.NgayKetThuc > @ThoiGian;

            IF @LoaiKM IS NULL
                THROW 51520, ''Promotion does not exist or is not active at the sale time.'', 1;

            IF @TongTienHang < @GiaTriDonToiThieu
                THROW 51521, ''Sale subtotal does not meet the promotion minimum order value.'', 1;

            UPDATE cart
            SET DuocKhuyenMai = 1
            FROM @Cart AS cart
            WHERE EXISTS (
                SELECT 1
                FROM dbo.KHUYEN_MAI_SAN_PHAM AS promotion_product WITH (UPDLOCK, HOLDLOCK)
                WHERE promotion_product.MaKM = @MaKM
                  AND promotion_product.MaSP = cart.MaSP
            );

            SELECT @TongTienDuocKhuyenMai = SUM(TienHang)
            FROM @Cart
            WHERE DuocKhuyenMai = 1;

            IF @TongTienDuocKhuyenMai IS NULL OR @TongTienDuocKhuyenMai <= 0
                THROW 51522, ''Promotion is not assigned to any product in the sale.'', 1;

            SET @TongGiamGia = CASE
                WHEN @LoaiKM = ''PERCENT''
                    THEN ROUND(@TongTienDuocKhuyenMai * @GiaTriKM / 100, 2)
                ELSE @GiaTriKM
            END;

            IF @MucGiamToiDa IS NOT NULL AND @TongGiamGia > @MucGiamToiDa
                SET @TongGiamGia = @MucGiamToiDa;

            IF @TongGiamGia > @TongTienDuocKhuyenMai
                SET @TongGiamGia = @TongTienDuocKhuyenMai;

            UPDATE @Cart
            SET TienGiam = CONVERT(
                    DECIMAL(18,2),
                    FLOOR((CONVERT(DECIMAL(38,8), @TongGiamGia) * TienHang / @TongTienDuocKhuyenMai) * 100) / 100
                )
            WHERE DuocKhuyenMai = 1;

            SELECT @TongDaPhanBo = SUM(TienGiam)
            FROM @Cart;

            SET @SoCentConLai = CONVERT(INT, ROUND((@TongGiamGia - @TongDaPhanBo) * 100, 0));

            ;WITH FractionalRemainders AS (
                SELECT
                    MaSP,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            (CONVERT(DECIMAL(38,8), @TongGiamGia) * TienHang / @TongTienDuocKhuyenMai)
                                - TienGiam DESC,
                            MaSP
                    ) AS RemainderRank
                FROM @Cart
                WHERE DuocKhuyenMai = 1
            )
            UPDATE cart
            SET TienGiam = cart.TienGiam + 0.01
            FROM @Cart AS cart
            JOIN FractionalRemainders AS remainder
                ON remainder.MaSP = cart.MaSP
            WHERE remainder.RemainderRank <= @SoCentConLai;
        END;

        SELECT @TongGiamGia = SUM(TienGiam)
        FROM @Cart;

        SET @TongGiamGia = COALESCE(@TongGiamGia, 0);
        SET @TongThanhToan = @TongTienHang - @TongGiamGia;

        IF @TongThanhToan <= 0
            THROW 51523, ''The finalized total must be positive for the current payment schema.'', 1;

        IF @SoTienThanhToan <> @TongThanhToan
            THROW 51524, ''Successful payment amount must equal the server-calculated invoice total.'', 1;

        DECLARE @DiemTichLuy INT = FLOOR(@TongThanhToan / 10000);

        IF @MaKH IS NULL
            SET @DiemTichLuy = 0;
        ELSE IF EXISTS (
            SELECT 1
            FROM dbo.KHACH_HANG
            WHERE MaKH = @MaKH
              AND DiemTichLuy > 2147483647 - @DiemTichLuy
        )
            THROW 51525, ''The loyalty point update would overflow the customer balance.'', 1;

        INSERT INTO dbo.HOA_DON (
            MaHD, NgayLap, MaCa, MaKH, TongTienHang, TongGiamGia,
            TongThanhToan, DiemSuDung, DiemTichLuy, TrangThai, GhiChu
        )
        VALUES (
            @MaHD, @ThoiGian, @MaCa, @MaKH, @TongTienHang, @TongGiamGia,
            @TongThanhToan, 0, @DiemTichLuy, ''DRAFT'', @GhiChu
        );

        DECLARE @InvoiceDetails TABLE (
            MaCTHD BIGINT NOT NULL PRIMARY KEY,
            MaSP VARCHAR(10) NOT NULL,
            SoLuong INT NOT NULL
        );

        INSERT INTO dbo.CHI_TIET_HOA_DON (MaHD, MaSP, MaKM, SoLuong, DonGiaBan, TienGiam)
        OUTPUT inserted.MaCTHD, inserted.MaSP, inserted.SoLuong
            INTO @InvoiceDetails (MaCTHD, MaSP, SoLuong)
        SELECT
            @MaHD,
            cart.MaSP,
            CASE WHEN cart.DuocKhuyenMai = 1 THEN @MaKM ELSE NULL END,
            cart.SoLuong,
            cart.DonGiaBan,
            cart.TienGiam
        FROM @Cart AS cart;

        DECLARE
            @MaCTHD BIGINT,
            @MaSP VARCHAR(10),
            @SoLuongYeuCau INT,
            @SoLuongConLai INT,
            @MaLo VARCHAR(20),
            @SoLuongTon INT,
            @SoLuongXuat INT,
            @TongTonKhaDung BIGINT;

        DECLARE ProductCursor CURSOR LOCAL FAST_FORWARD FOR
            SELECT MaCTHD, MaSP, SoLuong
            FROM @InvoiceDetails
            ORDER BY MaSP;

        OPEN ProductCursor;
        FETCH NEXT FROM ProductCursor INTO @MaCTHD, @MaSP, @SoLuongYeuCau;

        WHILE @@FETCH_STATUS = 0
        BEGIN
            SELECT @TongTonKhaDung = COALESCE(SUM(CONVERT(BIGINT, lot.SoLuongTon)), 0)
            FROM dbo.LO_HANG AS lot WITH (UPDLOCK, HOLDLOCK)
            WHERE lot.MaSP = @MaSP
              AND lot.TrangThai = ''ACTIVE''
              AND lot.SoLuongTon > 0
              AND (lot.HanSuDung IS NULL OR lot.HanSuDung > @NgayNghiepVu);

            IF @TongTonKhaDung < @SoLuongYeuCau
            BEGIN
                CLOSE ProductCursor;
                DEALLOCATE ProductCursor;
                THROW 51526, ''Insufficient unexpired inventory to complete the sale.'', 1;
            END;

            SET @SoLuongConLai = @SoLuongYeuCau;

            DECLARE LotCursor CURSOR LOCAL FAST_FORWARD FOR
                SELECT lot.MaLo, lot.SoLuongTon
                FROM dbo.LO_HANG AS lot WITH (UPDLOCK, HOLDLOCK)
                WHERE lot.MaSP = @MaSP
                  AND lot.TrangThai = ''ACTIVE''
                  AND lot.SoLuongTon > 0
                  AND (lot.HanSuDung IS NULL OR lot.HanSuDung > @NgayNghiepVu)
                ORDER BY
                    CASE WHEN lot.HanSuDung IS NULL THEN 1 ELSE 0 END,
                    lot.HanSuDung,
                    lot.MaLo;

            OPEN LotCursor;
            FETCH NEXT FROM LotCursor INTO @MaLo, @SoLuongTon;

            WHILE @@FETCH_STATUS = 0 AND @SoLuongConLai > 0
            BEGIN
                SET @SoLuongXuat = CASE
                    WHEN @SoLuongTon < @SoLuongConLai THEN @SoLuongTon
                    ELSE @SoLuongConLai
                END;

                UPDATE dbo.LO_HANG
                SET SoLuongTon = SoLuongTon - @SoLuongXuat
                WHERE MaLo = @MaLo
                  AND SoLuongTon >= @SoLuongXuat;

                IF @@ROWCOUNT <> 1
                BEGIN
                    CLOSE LotCursor;
                    DEALLOCATE LotCursor;
                    CLOSE ProductCursor;
                    DEALLOCATE ProductCursor;
                    THROW 51527, ''Inventory changed while FEFO allocation was in progress.'', 1;
                END;

                INSERT INTO dbo.CHI_TIET_XUAT_LO (MaCTHD, MaLo, SoLuong)
                VALUES (@MaCTHD, @MaLo, @SoLuongXuat);

                INSERT INTO dbo.GIAO_DICH_KHO (
                    MaSP, MaLo, LoaiGiaoDich, SoLuongBienDong,
                    ThoiGian, MaThamChieu, MaNV, GhiChu
                )
                VALUES (
                    @MaSP, @MaLo, ''SALE'', -@SoLuongXuat,
                    @ThoiGian, @MaHD, @MaNV, N''Xuất bán theo hóa đơn '' + @MaHD
                );

                SET @SoLuongConLai = @SoLuongConLai - @SoLuongXuat;
                FETCH NEXT FROM LotCursor INTO @MaLo, @SoLuongTon;
            END;

            CLOSE LotCursor;
            DEALLOCATE LotCursor;

            FETCH NEXT FROM ProductCursor INTO @MaCTHD, @MaSP, @SoLuongYeuCau;
        END;

        CLOSE ProductCursor;
        DEALLOCATE ProductCursor;

        INSERT INTO dbo.THANH_TOAN (
            MaHD, ThoiGian, PhuongThuc, SoTien, TrangThai, MaGiaoDichNgoai
        )
        VALUES (
            @MaHD, @ThoiGian, @PhuongThuc, @TongThanhToan, ''SUCCESS'', @MaGiaoDichNgoai
        );

        IF @MaKH IS NOT NULL AND @DiemTichLuy > 0
        BEGIN
            UPDATE dbo.KHACH_HANG
            SET DiemTichLuy = DiemTichLuy + @DiemTichLuy
            WHERE MaKH = @MaKH;
        END;

        UPDATE dbo.HOA_DON
        SET TrangThai = ''PAID''
        WHERE MaHD = @MaHD;

        IF @InitialTransactionCount = 0
            COMMIT TRANSACTION;

        SELECT
            invoice.MaHD,
            invoice.NgayLap,
            invoice.MaCa,
            invoice.MaKH,
            invoice.TongTienHang,
            invoice.TongGiamGia,
            invoice.TongThanhToan,
            invoice.DiemSuDung,
            invoice.DiemTichLuy,
            invoice.TrangThai,
            payment.PhuongThuc,
            payment.SoTien,
            payment.MaGiaoDichNgoai
        FROM dbo.HOA_DON AS invoice
        JOIN dbo.THANH_TOAN AS payment
            ON payment.MaHD = invoice.MaHD
           AND payment.TrangThai = ''SUCCESS''
        WHERE invoice.MaHD = @MaHD;
    END TRY
    BEGIN CATCH
        IF CURSOR_STATUS(''local'', ''LotCursor'') >= -1
        BEGIN
            IF CURSOR_STATUS(''local'', ''LotCursor'') > -1 CLOSE LotCursor;
            DEALLOCATE LotCursor;
        END;

        IF CURSOR_STATUS(''local'', ''ProductCursor'') >= -1
        BEGIN
            IF CURSOR_STATUS(''local'', ''ProductCursor'') > -1 CLOSE ProductCursor;
            DEALLOCATE ProductCursor;
        END;

        IF XACT_STATE() = -1
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1 AND @InitialTransactionCount = 0
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1
            ROLLBACK TRANSACTION FinalizeSale;

        THROW;
    END CATCH;
END;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_PHIEU_TRA_HoanTat
    @MaPT VARCHAR(15),
    @MaHD VARCHAR(15),
    @MaNV VARCHAR(10),
    @LyDo NVARCHAR(255),
    @DanhSachHangTra NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @MaPT = NULLIF(LTRIM(RTRIM(@MaPT)), '''');
    SET @MaHD = NULLIF(LTRIM(RTRIM(@MaHD)), '''');
    SET @MaNV = NULLIF(LTRIM(RTRIM(@MaNV)), '''');
    SET @LyDo = NULLIF(LTRIM(RTRIM(@LyDo)), N'''');

    IF @MaPT IS NULL
        THROW 51601, ''Return code is required.'', 1;

    IF @MaHD IS NULL
        THROW 51602, ''Original invoice code is required.'', 1;

    IF @MaNV IS NULL
        THROW 51603, ''Processing employee code is required.'', 1;

    IF @LyDo IS NULL
        THROW 51604, ''Return reason is required.'', 1;

    IF @DanhSachHangTra IS NULL
       OR ISJSON(@DanhSachHangTra) <> 1
       OR LEFT(LTRIM(@DanhSachHangTra), 1) <> ''[''
        THROW 51605, ''Return items must be a JSON array.'', 1;

    DECLARE @RawItems TABLE (
        RowNumber INT NOT NULL PRIMARY KEY,
        MaCTHDText NVARCHAR(100) NULL,
        MaLoText NVARCHAR(4000) NULL,
        SoLuongTraText NVARCHAR(100) NULL,
        TinhTrangHangText NVARCHAR(4000) NULL
    );

    INSERT INTO @RawItems (
        RowNumber, MaCTHDText, MaLoText, SoLuongTraText, TinhTrangHangText
    )
    SELECT
        TRY_CONVERT(INT, item.[key]),
        JSON_VALUE(item.[value], ''$.MaCTHD''),
        JSON_VALUE(item.[value], ''$.MaLo''),
        JSON_VALUE(item.[value], ''$.SoLuongTra''),
        JSON_VALUE(item.[value], ''$.TinhTrangHang'')
    FROM OPENJSON(@DanhSachHangTra) AS item;

    IF NOT EXISTS (SELECT 1 FROM @RawItems)
       OR EXISTS (
           SELECT 1
           FROM @RawItems
           WHERE TRY_CONVERT(BIGINT, MaCTHDText) IS NULL
              OR TRY_CONVERT(BIGINT, MaCTHDText) <= 0
              OR NULLIF(LTRIM(RTRIM(MaLoText)), N'''') IS NULL
              OR LEN(LTRIM(RTRIM(MaLoText))) > 20
              OR TRY_CONVERT(INT, SoLuongTraText) IS NULL
              OR TRY_CONVERT(INT, SoLuongTraText) <= 0
              OR UPPER(NULLIF(LTRIM(RTRIM(TinhTrangHangText)), N'''')) NOT IN (''RESALABLE'', ''DAMAGED'')
       )
        THROW 51606, ''Every return item requires a valid invoice line, lot, positive quantity and condition.'', 1;

    DECLARE @Items TABLE (
        RowNumber INT NOT NULL PRIMARY KEY,
        MaCTHD BIGINT NOT NULL,
        MaLo VARCHAR(20) NOT NULL,
        SoLuongTra INT NOT NULL,
        TinhTrangHang VARCHAR(20) NOT NULL,
        UNIQUE (MaCTHD, MaLo)
    );

    BEGIN TRY
        INSERT INTO @Items (RowNumber, MaCTHD, MaLo, SoLuongTra, TinhTrangHang)
        SELECT
            RowNumber,
            CONVERT(BIGINT, MaCTHDText),
            CONVERT(VARCHAR(20), LTRIM(RTRIM(MaLoText))),
            CONVERT(INT, SoLuongTraText),
            CONVERT(VARCHAR(20), UPPER(LTRIM(RTRIM(TinhTrangHangText))))
        FROM @RawItems;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() IN (2601, 2627)
            THROW 51607, ''The same invoice-line lot can appear only once in a return request.'', 1;
        THROW;
    END CATCH;

    DECLARE @Prepared TABLE (
        RowNumber INT NOT NULL PRIMARY KEY,
        MaCTHD BIGINT NOT NULL,
        MaLo VARCHAR(20) NOT NULL,
        MaSP VARCHAR(10) NOT NULL,
        SoLuongTra INT NOT NULL,
        TinhTrangHang VARCHAR(20) NOT NULL,
        SoLuongXuat INT NOT NULL,
        SoLuongDaTraLo INT NOT NULL,
        SoLuongDongHoaDon INT NOT NULL,
        SoLuongDaTraDong INT NOT NULL,
        ThanhTienDong DECIMAL(18,2) NOT NULL,
        TienHoan DECIMAL(18,2) NULL
    );

    DECLARE @InitialTransactionCount INT = @@TRANCOUNT;

    BEGIN TRY
        IF @InitialTransactionCount = 0
            BEGIN TRANSACTION;
        ELSE
            SAVE TRANSACTION CompleteReturn;

        IF EXISTS (
            SELECT 1
            FROM dbo.PHIEU_TRA WITH (UPDLOCK, HOLDLOCK)
            WHERE MaPT = @MaPT
        )
            THROW 51608, ''Return code already exists.'', 1;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.NHAN_VIEN WITH (UPDLOCK, HOLDLOCK)
            WHERE MaNV = @MaNV
              AND TrangThai = ''ACTIVE''
        )
            THROW 51609, ''Processing employee does not exist or is inactive.'', 1;

        DECLARE
            @TrangThaiHoaDon VARCHAR(20),
            @MaKH VARCHAR(10),
            @TongThanhToan DECIMAL(18,2),
            @DiemSuDung INT,
            @DiemTichLuyHoaDon INT;

        SELECT
            @TrangThaiHoaDon = invoice.TrangThai,
            @MaKH = invoice.MaKH,
            @TongThanhToan = invoice.TongThanhToan,
            @DiemSuDung = invoice.DiemSuDung,
            @DiemTichLuyHoaDon = invoice.DiemTichLuy
        FROM dbo.HOA_DON AS invoice WITH (UPDLOCK, HOLDLOCK)
        WHERE invoice.MaHD = @MaHD;

        IF @TrangThaiHoaDon IS NULL
            THROW 51610, ''Original invoice does not exist.'', 1;

        IF @TrangThaiHoaDon <> ''PAID''
            THROW 51611, ''Only a PAID invoice can receive another return.'', 1;

        IF @DiemSuDung > 0
            THROW 51612, ''Returns for invoices that redeemed loyalty points require a resolved redemption policy.'', 1;

        INSERT INTO @Prepared (
            RowNumber, MaCTHD, MaLo, MaSP, SoLuongTra, TinhTrangHang,
            SoLuongXuat, SoLuongDaTraLo, SoLuongDongHoaDon,
            SoLuongDaTraDong, ThanhTienDong
        )
        SELECT
            item.RowNumber,
            item.MaCTHD,
            item.MaLo,
            invoice_line.MaSP,
            item.SoLuongTra,
            item.TinhTrangHang,
            lot_output.SoLuong,
            COALESCE(returned_lot.SoLuongDaTra, 0),
            invoice_line.SoLuong,
            COALESCE(returned_line.SoLuongDaTra, 0),
            invoice_line.ThanhTien
        FROM @Items AS item
        JOIN dbo.CHI_TIET_XUAT_LO AS lot_output WITH (UPDLOCK, HOLDLOCK)
            ON lot_output.MaCTHD = item.MaCTHD
           AND lot_output.MaLo = item.MaLo
        JOIN dbo.CHI_TIET_HOA_DON AS invoice_line WITH (UPDLOCK, HOLDLOCK)
            ON invoice_line.MaCTHD = lot_output.MaCTHD
           AND invoice_line.MaHD = @MaHD
        OUTER APPLY (
            SELECT SUM(CONVERT(BIGINT, return_line.SoLuongTra)) AS SoLuongDaTra
            FROM dbo.CHI_TIET_PHIEU_TRA AS return_line WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.PHIEU_TRA AS return_header WITH (UPDLOCK, HOLDLOCK)
                ON return_header.MaPT = return_line.MaPT
            WHERE return_line.MaCTHD = item.MaCTHD
              AND return_line.MaLo = item.MaLo
              AND return_header.MaHD = @MaHD
              AND return_header.TrangThai = ''COMPLETED''
        ) AS returned_lot
        OUTER APPLY (
            SELECT SUM(CONVERT(BIGINT, return_line.SoLuongTra)) AS SoLuongDaTra
            FROM dbo.CHI_TIET_PHIEU_TRA AS return_line WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.PHIEU_TRA AS return_header WITH (UPDLOCK, HOLDLOCK)
                ON return_header.MaPT = return_line.MaPT
            WHERE return_line.MaCTHD = item.MaCTHD
              AND return_header.MaHD = @MaHD
              AND return_header.TrangThai = ''COMPLETED''
        ) AS returned_line;

        IF (SELECT COUNT(*) FROM @Prepared) <> (SELECT COUNT(*) FROM @Items)
            THROW 51613, ''Every return item must belong to a lot exported by the original invoice.'', 1;

        IF EXISTS (
            SELECT 1
            FROM @Prepared
            WHERE SoLuongDaTraLo + SoLuongTra > SoLuongXuat
        )
            THROW 51614, ''Return quantity exceeds the quantity still returnable from the original lot allocation.'', 1;

        ;WITH RunningRefund AS (
            SELECT
                RowNumber,
                SoLuongDaTraDong
                    + SUM(SoLuongTra) OVER (
                        PARTITION BY MaCTHD
                        ORDER BY MaLo, RowNumber
                        ROWS UNBOUNDED PRECEDING
                    ) AS SoLuongLuyKeSau,
                SoLuongDaTraDong
                    + COALESCE(
                        SUM(SoLuongTra) OVER (
                            PARTITION BY MaCTHD
                            ORDER BY MaLo, RowNumber
                            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                        ),
                        0
                    ) AS SoLuongLuyKeTruoc,
                SoLuongDongHoaDon,
                ThanhTienDong
            FROM @Prepared
        )
        UPDATE prepared
        SET TienHoan = CONVERT(
                DECIMAL(18,2),
                ROUND(
                    CONVERT(DECIMAL(38,8), running.ThanhTienDong)
                        * running.SoLuongLuyKeSau / running.SoLuongDongHoaDon,
                    2
                )
                - ROUND(
                    CONVERT(DECIMAL(38,8), running.ThanhTienDong)
                        * running.SoLuongLuyKeTruoc / running.SoLuongDongHoaDon,
                    2
                )
            )
        FROM @Prepared AS prepared
        JOIN RunningRefund AS running ON running.RowNumber = prepared.RowNumber;

        DECLARE
            @TongTienHoan DECIMAL(18,2),
            @TongTienHoanTruoc DECIMAL(18,2);

        SELECT @TongTienHoan = SUM(TienHoan)
        FROM @Prepared;

        SELECT @TongTienHoanTruoc = COALESCE(SUM(return_header.TongTienHoan), 0)
        FROM dbo.PHIEU_TRA AS return_header WITH (UPDLOCK, HOLDLOCK)
        WHERE return_header.MaHD = @MaHD
          AND return_header.TrangThai = ''COMPLETED'';

        IF @TongTienHoan IS NULL
           OR @TongTienHoan < 0
           OR @TongTienHoanTruoc + @TongTienHoan > @TongThanhToan
            THROW 51615, ''Calculated refund exceeds the authoritative paid invoice value.'', 1;

        INSERT INTO dbo.PHIEU_TRA (
            MaPT, MaHD, MaNV, NgayTra, LyDo, TongTienHoan, TrangThai
        )
        VALUES (
            @MaPT, @MaHD, @MaNV, SYSUTCDATETIME(), @LyDo, @TongTienHoan, ''CREATED''
        );

        INSERT INTO dbo.CHI_TIET_PHIEU_TRA (
            MaPT, MaCTHD, MaLo, SoLuongTra, TienHoan, TinhTrangHang
        )
        SELECT
            @MaPT, MaCTHD, MaLo, SoLuongTra, TienHoan, TinhTrangHang
        FROM @Prepared;

        IF EXISTS (
            SELECT 1
            FROM @Prepared AS prepared
            JOIN dbo.LO_HANG AS lot WITH (UPDLOCK, HOLDLOCK)
                ON lot.MaLo = prepared.MaLo
            WHERE prepared.TinhTrangHang = ''RESALABLE''
              AND lot.SoLuongTon > 2147483647 - prepared.SoLuongTra
        )
            THROW 51616, ''Restoring the returned quantity would overflow the lot balance.'', 1;

        UPDATE lot
        SET SoLuongTon = lot.SoLuongTon + prepared.SoLuongTra
        FROM dbo.LO_HANG AS lot
        JOIN @Prepared AS prepared ON prepared.MaLo = lot.MaLo
        WHERE prepared.TinhTrangHang = ''RESALABLE'';

        INSERT INTO dbo.GIAO_DICH_KHO (
            MaSP, MaLo, LoaiGiaoDich, SoLuongBienDong,
            ThoiGian, MaThamChieu, MaNV, GhiChu
        )
        SELECT
            prepared.MaSP,
            prepared.MaLo,
            ''RETURN'',
            prepared.SoLuongTra,
            SYSUTCDATETIME(),
            @MaPT,
            @MaNV,
            N''Hoàn kho từ phiếu trả '' + @MaPT
        FROM @Prepared AS prepared
        WHERE prepared.TinhTrangHang = ''RESALABLE'';

        DECLARE
            @DiemTru INT = 0,
            @GiaTriConLaiTruoc DECIMAL(18,2),
            @GiaTriConLaiSau DECIMAL(18,2),
            @DiemTheoGiaTriTruoc INT,
            @DiemTheoGiaTriSau INT;

        SET @GiaTriConLaiTruoc = @TongThanhToan - @TongTienHoanTruoc;
        SET @GiaTriConLaiSau = @GiaTriConLaiTruoc - @TongTienHoan;

        IF @GiaTriConLaiTruoc < 0 SET @GiaTriConLaiTruoc = 0;
        IF @GiaTriConLaiSau < 0 SET @GiaTriConLaiSau = 0;

        SET @DiemTheoGiaTriTruoc = FLOOR(@GiaTriConLaiTruoc / 10000);
        SET @DiemTheoGiaTriSau = FLOOR(@GiaTriConLaiSau / 10000);

        IF @DiemTheoGiaTriTruoc > @DiemTichLuyHoaDon
            SET @DiemTheoGiaTriTruoc = @DiemTichLuyHoaDon;

        IF @DiemTheoGiaTriSau > @DiemTichLuyHoaDon
            SET @DiemTheoGiaTriSau = @DiemTichLuyHoaDon;

        SET @DiemTru = @DiemTheoGiaTriTruoc - @DiemTheoGiaTriSau;

        IF @MaKH IS NOT NULL AND @DiemTru > 0
        BEGIN
            UPDATE dbo.KHACH_HANG
            SET DiemTichLuy = DiemTichLuy - @DiemTru
            WHERE MaKH = @MaKH
              AND DiemTichLuy >= @DiemTru;

            IF @@ROWCOUNT <> 1
                THROW 51617, ''Customer loyalty balance is insufficient for the return adjustment.'', 1;
        END;

        UPDATE dbo.PHIEU_TRA
        SET TrangThai = ''COMPLETED''
        WHERE MaPT = @MaPT;

        DECLARE @DaTraHet BIT = 0;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_XUAT_LO AS lot_output
            JOIN dbo.CHI_TIET_HOA_DON AS invoice_line
                ON invoice_line.MaCTHD = lot_output.MaCTHD
            OUTER APPLY (
                SELECT SUM(CONVERT(BIGINT, return_line.SoLuongTra)) AS SoLuongDaTra
                FROM dbo.CHI_TIET_PHIEU_TRA AS return_line
                JOIN dbo.PHIEU_TRA AS return_header
                    ON return_header.MaPT = return_line.MaPT
                WHERE return_line.MaCTHD = lot_output.MaCTHD
                  AND return_line.MaLo = lot_output.MaLo
                  AND return_header.MaHD = @MaHD
                  AND return_header.TrangThai = ''COMPLETED''
            ) AS returned
            WHERE invoice_line.MaHD = @MaHD
              AND lot_output.SoLuong > COALESCE(returned.SoLuongDaTra, 0)
        )
            SET @DaTraHet = 1;

        IF @DaTraHet = 1
        BEGIN
            UPDATE dbo.HOA_DON
            SET TrangThai = ''REFUNDED''
            WHERE MaHD = @MaHD;

            UPDATE dbo.THANH_TOAN
            SET TrangThai = ''REFUNDED''
            WHERE MaHD = @MaHD
              AND TrangThai = ''SUCCESS'';
        END;

        IF @InitialTransactionCount = 0
            COMMIT TRANSACTION;

        SELECT
            return_header.MaPT,
            return_header.MaHD,
            return_header.MaNV,
            return_header.NgayTra,
            return_header.LyDo,
            return_header.TongTienHoan,
            return_header.TrangThai,
            invoice.TrangThai AS TrangThaiHoaDon,
            @DiemTru AS DiemDaDieuChinh
        FROM dbo.PHIEU_TRA AS return_header
        JOIN dbo.HOA_DON AS invoice ON invoice.MaHD = return_header.MaHD
        WHERE return_header.MaPT = @MaPT;

        SELECT
            MaCTHD, MaSP, TenSP, DonViTinh, MaLo, SoLo,
            SoLuongTra, TienHoan, TinhTrangHang
        FROM dbo.vw_PHIEU_TRA_CHI_TIET
        WHERE MaPT = @MaPT
        ORDER BY MaCTHD, MaLo;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() = -1
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1 AND @InitialTransactionCount = 0
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1
            ROLLBACK TRANSACTION CompleteReturn;

        THROW;
    END CATCH;
END;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_KIEM_KE_Tao
    @MaKK VARCHAR(15),
    @MaNV VARCHAR(10),
    @NgayKiemKe DATETIME2(0) = NULL,
    @GhiChu NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @MaKK = NULLIF(LTRIM(RTRIM(@MaKK)), '''');
    SET @MaNV = NULLIF(LTRIM(RTRIM(@MaNV)), '''');
    SET @GhiChu = NULLIF(LTRIM(RTRIM(@GhiChu)), N'''');

    IF @MaKK IS NULL
        THROW 51701, ''Stocktake code is required.'', 1;

    IF @MaNV IS NULL
       OR NOT EXISTS (
           SELECT 1
           FROM dbo.NHAN_VIEN
           WHERE MaNV = @MaNV
             AND TrangThai = ''ACTIVE''
       )
        THROW 51702, ''An active stocktake employee is required.'', 1;

    DECLARE @InitialTransactionCount INT = @@TRANCOUNT;

    BEGIN TRY
        IF @InitialTransactionCount = 0
            BEGIN TRANSACTION;
        ELSE
            SAVE TRANSACTION CreateStocktake;

        IF EXISTS (
            SELECT 1
            FROM dbo.KIEM_KE WITH (UPDLOCK, HOLDLOCK)
            WHERE MaKK = @MaKK
        )
            THROW 51703, ''Stocktake code already exists.'', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.KIEM_KE WITH (UPDLOCK, HOLDLOCK)
            WHERE TrangThai = ''DRAFT''
        )
            THROW 51704, ''Another DRAFT stocktake is already in progress.'', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.LO_HANG)
            THROW 51705, ''Stocktake cannot start without inventory lots.'', 1;

        INSERT INTO dbo.KIEM_KE (
            MaKK, NgayKiemKe, MaNV, TrangThai, GhiChu
        )
        VALUES (
            @MaKK, COALESCE(@NgayKiemKe, SYSUTCDATETIME()), @MaNV, ''DRAFT'', @GhiChu
        );

        INSERT INTO dbo.CHI_TIET_KIEM_KE (
            MaKK, MaLo, SoLuongHeThong, SoLuongThucTe, LyDo
        )
        SELECT
            @MaKK,
            lot.MaLo,
            lot.SoLuongTon,
            lot.SoLuongTon,
            NULL
        FROM dbo.LO_HANG AS lot WITH (UPDLOCK, HOLDLOCK);

        IF @InitialTransactionCount = 0
            COMMIT TRANSACTION;

        SELECT MaKK, NgayKiemKe, MaNV, TrangThai, GhiChu
        FROM dbo.KIEM_KE
        WHERE MaKK = @MaKK;

        SELECT *
        FROM dbo.vw_KIEM_KE_CHI_TIET
        WHERE MaKK = @MaKK
        ORDER BY MaSP, MaLo;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() = -1
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1 AND @InitialTransactionCount = 0
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1
            ROLLBACK TRANSACTION CreateStocktake;

        THROW;
    END CATCH;
END;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_KIEM_KE_PheDuyetDieuChinh
    @MaKK VARCHAR(15),
    @MaNV VARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @MaKK = NULLIF(LTRIM(RTRIM(@MaKK)), '''');
    SET @MaNV = NULLIF(LTRIM(RTRIM(@MaNV)), '''');

    IF @MaKK IS NULL
        THROW 51712, ''Stocktake code is required.'', 1;

    IF @MaNV IS NULL
       OR NOT EXISTS (
           SELECT 1
           FROM dbo.NHAN_VIEN
           WHERE MaNV = @MaNV
             AND TrangThai = ''ACTIVE''
       )
        THROW 51713, ''An active approving employee is required.'', 1;

    DECLARE @InitialTransactionCount INT = @@TRANCOUNT;

    BEGIN TRY
        IF @InitialTransactionCount = 0
            BEGIN TRANSACTION;
        ELSE
            SAVE TRANSACTION ApproveStocktake;

        DECLARE @TrangThai VARCHAR(20);

        SELECT @TrangThai = TrangThai
        FROM dbo.KIEM_KE WITH (UPDLOCK, HOLDLOCK)
        WHERE MaKK = @MaKK;

        IF @TrangThai IS NULL
            THROW 51714, ''Stocktake does not exist.'', 1;

        IF @TrangThai <> ''DRAFT''
            THROW 51715, ''Only a DRAFT stocktake can be approved.'', 1;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_KIEM_KE
            WHERE MaKK = @MaKK
        )
            THROW 51716, ''Stocktake has no snapshot details.'', 1;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_KIEM_KE
            WHERE MaKK = @MaKK
              AND ChenhLech <> 0
        )
            THROW 51717, ''Stocktake has no discrepancy to approve.'', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_KIEM_KE
            WHERE MaKK = @MaKK
              AND ChenhLech <> 0
              AND NULLIF(LTRIM(RTRIM(LyDo)), N'''') IS NULL
        )
            THROW 51718, ''Every stocktake discrepancy requires a reason.'', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_KIEM_KE AS detail
            JOIN dbo.LO_HANG AS lot WITH (UPDLOCK, HOLDLOCK)
                ON lot.MaLo = detail.MaLo
            WHERE detail.MaKK = @MaKK
              AND lot.SoLuongTon <> detail.SoLuongHeThong
        )
            THROW 51719, ''Inventory changed after the stocktake snapshot; approval was rejected.'', 1;

        UPDATE lot
        SET SoLuongTon = detail.SoLuongThucTe
        FROM dbo.LO_HANG AS lot
        JOIN dbo.CHI_TIET_KIEM_KE AS detail
            ON detail.MaLo = lot.MaLo
        WHERE detail.MaKK = @MaKK
          AND detail.ChenhLech <> 0;

        INSERT INTO dbo.GIAO_DICH_KHO (
            MaSP, MaLo, LoaiGiaoDich, SoLuongBienDong,
            ThoiGian, MaThamChieu, MaNV, GhiChu
        )
        SELECT
            lot.MaSP,
            detail.MaLo,
            ''ADJUSTMENT'',
            detail.ChenhLech,
            SYSUTCDATETIME(),
            @MaKK,
            @MaNV,
            LEFT(CONCAT(N''Điều chỉnh kiểm kê: '', detail.LyDo), 255)
        FROM dbo.CHI_TIET_KIEM_KE AS detail
        JOIN dbo.LO_HANG AS lot
            ON lot.MaLo = detail.MaLo
        WHERE detail.MaKK = @MaKK
          AND detail.ChenhLech <> 0;

        UPDATE dbo.KIEM_KE
        SET TrangThai = ''APPROVED''
        WHERE MaKK = @MaKK;

        IF @InitialTransactionCount = 0
            COMMIT TRANSACTION;

        SELECT MaKK, NgayKiemKe, MaNV, TrangThai, GhiChu
        FROM dbo.KIEM_KE
        WHERE MaKK = @MaKK;

        SELECT *
        FROM dbo.vw_KIEM_KE_CHI_TIET
        WHERE MaKK = @MaKK
        ORDER BY MaSP, MaLo;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() = -1
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1 AND @InitialTransactionCount = 0
            ROLLBACK TRANSACTION;
        ELSE IF XACT_STATE() = 1
            ROLLBACK TRANSACTION ApproveStocktake;

        THROW;
    END CATCH;
END;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_NHAT_KY_HE_THONG_TraCuu
    @TuNgay DATE = NULL,
    @DenNgay DATE = NULL,
    @TenDangNhap VARCHAR(50) = NULL,
    @HanhDong VARCHAR(50) = NULL,
    @TenBang VARCHAR(128) = NULL,
    @MaBanGhi VARCHAR(100) = NULL,
    @SoTrang INT = 1,
    @KichThuocTrang INT = 50
AS
BEGIN
    SET NOCOUNT ON;

    SET @TenDangNhap = NULLIF(LTRIM(RTRIM(@TenDangNhap)), '''');
    SET @HanhDong = NULLIF(LTRIM(RTRIM(@HanhDong)), '''');
    SET @TenBang = NULLIF(LTRIM(RTRIM(@TenBang)), '''');
    SET @MaBanGhi = NULLIF(LTRIM(RTRIM(@MaBanGhi)), '''');

    IF @TuNgay IS NOT NULL AND @DenNgay IS NOT NULL AND @TuNgay > @DenNgay
        THROW 51810, ''Audit start date must not be after end date.'', 1;

    IF @SoTrang < 1
        THROW 51811, ''Audit page must be greater than or equal to 1.'', 1;

    IF @KichThuocTrang < 1 OR @KichThuocTrang > 100
        THROW 51812, ''Audit page size must be between 1 and 100.'', 1;

    DECLARE
        @Offset BIGINT = CONVERT(BIGINT, @SoTrang - 1) * @KichThuocTrang,
        @TuNgayUtc DATETIME2(0) = CASE WHEN @TuNgay IS NULL THEN NULL ELSE CONVERT(
            DATETIME2(0),
            (CONVERT(DATETIME2(0), @TuNgay) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        ) END,
        @DenNgayKeTiepUtc DATETIME2(0) = CASE WHEN @DenNgay IS NULL THEN NULL ELSE CONVERT(
            DATETIME2(0),
            (DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay)) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        ) END;

    IF @Offset > 2147483647
        THROW 51813, ''Audit page offset is too large.'', 1;

    SELECT
        audit_log.MaNhatKy,
        audit_log.MaTK,
        audit_log.TenDangNhap,
        audit_log.MaVaiTro,
        audit_log.TenVaiTro,
        audit_log.LoaiChuSoHuu,
        audit_log.MaChuSoHuu,
        audit_log.TenChuSoHuu,
        audit_log.HanhDong,
        audit_log.TenBang,
        audit_log.MaBanGhi,
        audit_log.DuLieuCu,
        audit_log.DuLieuMoi,
        audit_log.DuLieuCuLaJson,
        audit_log.DuLieuMoiLaJson,
        audit_log.ThoiGian,
        audit_log.DiaChiIP,
        COUNT_BIG(*) OVER () AS TongSoBanGhi
    FROM dbo.vw_NHAT_KY_HE_THONG_CHI_TIET AS audit_log
    WHERE (@TuNgayUtc IS NULL OR audit_log.ThoiGian >= @TuNgayUtc)
      AND (@DenNgayKeTiepUtc IS NULL OR audit_log.ThoiGian < @DenNgayKeTiepUtc)
      AND (@TenDangNhap IS NULL OR audit_log.TenDangNhap = @TenDangNhap)
      AND (@HanhDong IS NULL OR audit_log.HanhDong = @HanhDong)
      AND (@TenBang IS NULL OR audit_log.TenBang = @TenBang)
      AND (@MaBanGhi IS NULL OR audit_log.MaBanGhi = @MaBanGhi)
    ORDER BY audit_log.ThoiGian DESC, audit_log.MaNhatKy DESC
    OFFSET CONVERT(INT, @Offset) ROWS FETCH NEXT @KichThuocTrang ROWS ONLY;
END;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_BAO_CAO_DoanhThuTongQuan
    @TuNgay DATE,
    @DenNgay DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
        THROW 51910, ''A valid inclusive report date range is required.'', 1;

    DECLARE
        @TuNgayUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (CONVERT(DATETIME2(0), @TuNgay) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        ),
        @DenNgayKeTiepUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay)) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        );

    SELECT
        @TuNgay AS TuNgay,
        @DenNgay AS DenNgay,
        COALESCE(SUM(event.SoHoaDon), 0) AS SoHoaDonHoanTat,
        COALESCE(SUM(event.DoanhThuGop), 0) AS DoanhThuGop,
        COALESCE(SUM(event.TienHoanTra), 0) AS TienHoanTra,
        COALESCE(SUM(event.DoanhThuThuan), 0) AS DoanhThuThuan
    FROM dbo.vw_BAO_CAO_DOANH_THU_SU_KIEN AS event
    WHERE event.NgayGiaoDich >= @TuNgayUtc
      AND event.NgayGiaoDich < @DenNgayKeTiepUtc;
END;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_BAO_CAO_XuHuongDoanhThu
    @TuNgay DATE,
    @DenNgay DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
        THROW 51910, ''A valid inclusive report date range is required.'', 1;

    DECLARE
        @TuNgayUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (CONVERT(DATETIME2(0), @TuNgay) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        ),
        @DenNgayKeTiepUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay)) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        );

    SELECT
        business_date.Ngay AS Ngay,
        SUM(event.SoHoaDon) AS SoHoaDonHoanTat,
        SUM(event.DoanhThuGop) AS DoanhThuGop,
        SUM(event.TienHoanTra) AS TienHoanTra,
        SUM(event.DoanhThuThuan) AS DoanhThuThuan
    FROM dbo.vw_BAO_CAO_DOANH_THU_SU_KIEN AS event
    CROSS APPLY (VALUES (
        CONVERT(
            DATE,
            (event.NgayGiaoDich AT TIME ZONE ''UTC'') AT TIME ZONE ''SE Asia Standard Time''
        )
    )) AS business_date (Ngay)
    WHERE event.NgayGiaoDich >= @TuNgayUtc
      AND event.NgayGiaoDich < @DenNgayKeTiepUtc
    GROUP BY business_date.Ngay
    ORDER BY Ngay;
END;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_BAO_CAO_DoanhThuTheoNganhHang
    @TuNgay DATE,
    @DenNgay DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
        THROW 51910, ''A valid inclusive report date range is required.'', 1;

    DECLARE
        @TuNgayUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (CONVERT(DATETIME2(0), @TuNgay) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        ),
        @DenNgayKeTiepUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay)) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        );

    ;WITH CategoryTotals AS (
        SELECT
            event.MaLoai,
            event.TenLoai,
            SUM(event.SoLuongBan) AS SoLuongBan,
            SUM(event.SoLuongTra) AS SoLuongTra,
            SUM(event.DoanhThuGop) AS DoanhThuGop,
            SUM(event.TienHoanTra) AS TienHoanTra,
            SUM(event.DoanhThuThuan) AS DoanhThuThuan
        FROM dbo.vw_BAO_CAO_HANG_HOA_SU_KIEN AS event
        WHERE event.NgayGiaoDich >= @TuNgayUtc
          AND event.NgayGiaoDich < @DenNgayKeTiepUtc
        GROUP BY event.MaLoai, event.TenLoai
    )
    SELECT
        category.MaLoai,
        category.TenLoai,
        category.SoLuongBan,
        category.SoLuongTra,
        category.SoLuongBan - category.SoLuongTra AS SoLuongBanThuan,
        category.DoanhThuGop,
        category.TienHoanTra,
        category.DoanhThuThuan,
        CONVERT(DECIMAL(9,2), CASE
            WHEN SUM(category.DoanhThuThuan) OVER () = 0 THEN 0
            ELSE category.DoanhThuThuan * 100.0 / SUM(category.DoanhThuThuan) OVER ()
        END) AS TyTrongDoanhThuThuan
    FROM CategoryTotals AS category
    ORDER BY category.DoanhThuThuan DESC, category.MaLoai;
END;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_BAO_CAO_XepHangSanPham
    @TuNgay DATE,
    @DenNgay DATE,
    @Kieu VARCHAR(10),
    @SoLuong INT = 10
AS
BEGIN
    SET NOCOUNT ON;

    SET @Kieu = UPPER(LTRIM(RTRIM(COALESCE(@Kieu, ''''))));

    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
        THROW 51910, ''A valid inclusive report date range is required.'', 1;

    IF @Kieu NOT IN (''BEST'', ''SLOW'')
        THROW 51911, ''Product ranking type must be BEST or SLOW.'', 1;

    IF @SoLuong IS NULL OR @SoLuong < 1 OR @SoLuong > 100
        THROW 51912, ''Product ranking size must be between 1 and 100.'', 1;

    DECLARE
        @TuNgayUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (CONVERT(DATETIME2(0), @TuNgay) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        ),
        @DenNgayKeTiepUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay)) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        );

    ;WITH ProductActivity AS (
        SELECT
            event.MaSP,
            SUM(event.SoLuongBan) AS SoLuongBan,
            SUM(event.SoLuongTra) AS SoLuongTra,
            SUM(event.DoanhThuGop) AS DoanhThuGop,
            SUM(event.TienHoanTra) AS TienHoanTra,
            SUM(event.DoanhThuThuan) AS DoanhThuThuan
        FROM dbo.vw_BAO_CAO_HANG_HOA_SU_KIEN AS event
        WHERE event.NgayGiaoDich >= @TuNgayUtc
          AND event.NgayGiaoDich < @DenNgayKeTiepUtc
        GROUP BY event.MaSP
    ), RankedProducts AS (
        SELECT
            product.MaSP,
            product.TenSP,
            product.MaLoai,
            category.TenLoai,
            product.DonViTinh,
            product.TrangThai AS TrangThaiSanPham,
            COALESCE(activity.SoLuongBan, 0) AS SoLuongBan,
            COALESCE(activity.SoLuongTra, 0) AS SoLuongTra,
            COALESCE(activity.SoLuongBan, 0) - COALESCE(activity.SoLuongTra, 0) AS SoLuongBanThuan,
            COALESCE(activity.DoanhThuGop, 0) AS DoanhThuGop,
            COALESCE(activity.TienHoanTra, 0) AS TienHoanTra,
            COALESCE(activity.DoanhThuThuan, 0) AS DoanhThuThuan,
            COALESCE(inventory.TongTon, 0) AS TongTon,
            ROW_NUMBER() OVER (
                ORDER BY
                    CASE WHEN @Kieu = ''BEST''
                        THEN COALESCE(activity.SoLuongBan, 0) - COALESCE(activity.SoLuongTra, 0)
                    END DESC,
                    CASE WHEN @Kieu = ''BEST'' THEN COALESCE(activity.DoanhThuThuan, 0) END DESC,
                    CASE WHEN @Kieu = ''SLOW''
                        THEN COALESCE(activity.SoLuongBan, 0) - COALESCE(activity.SoLuongTra, 0)
                    END ASC,
                    CASE WHEN @Kieu = ''SLOW'' THEN COALESCE(activity.DoanhThuThuan, 0) END ASC,
                    CASE WHEN @Kieu = ''SLOW'' THEN COALESCE(inventory.TongTon, 0) END DESC,
                    product.MaSP
            ) AS XepHang
        FROM dbo.SAN_PHAM AS product
        JOIN dbo.LOAI_SAN_PHAM AS category
            ON category.MaLoai = product.MaLoai
        LEFT JOIN ProductActivity AS activity
            ON activity.MaSP = product.MaSP
        LEFT JOIN dbo.vw_BAO_CAO_TON_KHO_HIEN_TAI AS inventory
            ON inventory.MaSP = product.MaSP
        WHERE (@Kieu = ''BEST'' AND COALESCE(activity.SoLuongBan, 0) > 0)
           OR (@Kieu = ''SLOW'' AND product.TrangThai = ''ACTIVE'')
    )
    SELECT
        XepHang,
        MaSP,
        TenSP,
        MaLoai,
        TenLoai,
        DonViTinh,
        TrangThaiSanPham,
        SoLuongBan,
        SoLuongTra,
        SoLuongBanThuan,
        DoanhThuGop,
        TienHoanTra,
        DoanhThuThuan,
        TongTon
    FROM RankedProducts
    WHERE XepHang <= @SoLuong
    ORDER BY XepHang;
END;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_BAO_CAO_NhapHangTongQuan
    @TuNgay DATE,
    @DenNgay DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
        THROW 51910, ''A valid inclusive report date range is required.'', 1;

    DECLARE
        @TuNgayUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (CONVERT(DATETIME2(0), @TuNgay) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        ),
        @DenNgayKeTiepUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay)) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        );

    SELECT
        @TuNgay AS TuNgay,
        @DenNgay AS DenNgay,
        COUNT_BIG(DISTINCT receipt.MaPN) AS SoPhieuNhap,
        COUNT_BIG(DISTINCT receipt.MaNCC) AS SoNhaCungCap,
        COALESCE(SUM(CONVERT(BIGINT, receipt.SoLuong)), 0) AS TongSoLuongNhap,
        COALESCE(SUM(receipt.ThanhTien), 0) AS TongChiPhiNhap
    FROM dbo.vw_BAO_CAO_NHAP_HANG_HOP_LE AS receipt
    WHERE receipt.NgayXacNhan >= @TuNgayUtc
      AND receipt.NgayXacNhan < @DenNgayKeTiepUtc;
END;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_BAO_CAO_NhapHangTheoNhaCungCap
    @TuNgay DATE,
    @DenNgay DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
        THROW 51910, ''A valid inclusive report date range is required.'', 1;

    DECLARE
        @TuNgayUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (CONVERT(DATETIME2(0), @TuNgay) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        ),
        @DenNgayKeTiepUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay)) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        );

    SELECT
        receipt.MaNCC,
        receipt.TenNCC,
        COUNT_BIG(DISTINCT receipt.MaPN) AS SoPhieuNhap,
        SUM(CONVERT(BIGINT, receipt.SoLuong)) AS TongSoLuongNhap,
        SUM(receipt.ThanhTien) AS TongChiPhiNhap
    FROM dbo.vw_BAO_CAO_NHAP_HANG_HOP_LE AS receipt
    WHERE receipt.NgayXacNhan >= @TuNgayUtc
      AND receipt.NgayXacNhan < @DenNgayKeTiepUtc
    GROUP BY receipt.MaNCC, receipt.TenNCC
    ORDER BY TongChiPhiNhap DESC, receipt.MaNCC;
END;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_BAO_CAO_DoanhThuNhanVien
    @TuNgay DATE,
    @DenNgay DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
        THROW 51910, ''A valid inclusive report date range is required.'', 1;

    DECLARE
        @TuNgayUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (CONVERT(DATETIME2(0), @TuNgay) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        ),
        @DenNgayKeTiepUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay)) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        );

    ;WITH ShiftTotals AS (
        SELECT work_shift.MaNV, COUNT_BIG(*) AS SoCaDaMo
        FROM dbo.CA_LAM_VIEC AS work_shift
        WHERE work_shift.GioBatDau >= @TuNgayUtc
          AND work_shift.GioBatDau < @DenNgayKeTiepUtc
        GROUP BY work_shift.MaNV
    ), RevenueTotals AS (
        SELECT
            event.MaNV,
            SUM(event.SoHoaDon) AS SoHoaDonHoanTat,
            SUM(event.DoanhThuGop) AS DoanhThuGop,
            SUM(event.TienHoanTra) AS TienHoanTra,
            SUM(event.DoanhThuThuan) AS DoanhThuThuan
        FROM dbo.vw_BAO_CAO_DOANH_THU_SU_KIEN AS event
        WHERE event.NgayGiaoDich >= @TuNgayUtc
          AND event.NgayGiaoDich < @DenNgayKeTiepUtc
        GROUP BY event.MaNV
    ), EmployeeKeys AS (
        SELECT MaNV FROM ShiftTotals
        UNION
        SELECT MaNV FROM RevenueTotals
    )
    SELECT
        employee.MaNV,
        employee.HoTen AS TenNhanVien,
        COALESCE(shift_total.SoCaDaMo, 0) AS SoCaDaMo,
        COALESCE(revenue.SoHoaDonHoanTat, 0) AS SoHoaDonHoanTat,
        COALESCE(revenue.DoanhThuGop, 0) AS DoanhThuGop,
        COALESCE(revenue.TienHoanTra, 0) AS TienHoanTra,
        COALESCE(revenue.DoanhThuThuan, 0) AS DoanhThuThuan
    FROM EmployeeKeys AS employee_key
    JOIN dbo.NHAN_VIEN AS employee
        ON employee.MaNV = employee_key.MaNV
    LEFT JOIN ShiftTotals AS shift_total
        ON shift_total.MaNV = employee.MaNV
    LEFT JOIN RevenueTotals AS revenue
        ON revenue.MaNV = employee.MaNV
    ORDER BY DoanhThuThuan DESC, employee.MaNV;
END;');



EXEC(N'CREATE OR ALTER PROCEDURE dbo.usp_BAO_CAO_CaLamViec
    @TuNgay DATE,
    @DenNgay DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @TuNgay IS NULL OR @DenNgay IS NULL OR @TuNgay > @DenNgay
        THROW 51910, ''A valid inclusive report date range is required.'', 1;

    DECLARE
        @TuNgayUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (CONVERT(DATETIME2(0), @TuNgay) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        ),
        @DenNgayKeTiepUtc DATETIME2(0) = CONVERT(
            DATETIME2(0),
            (DATEADD(DAY, 1, CONVERT(DATETIME2(0), @DenNgay)) AT TIME ZONE ''SE Asia Standard Time'') AT TIME ZONE ''UTC''
        );

    SELECT
        work_shift.MaCa,
        work_shift.MaNV,
        employee.HoTen AS TenNhanVien,
        work_shift.GioBatDau,
        work_shift.GioKetThuc,
        work_shift.TienDauCa,
        work_shift.TienCuoiCa,
        work_shift.TrangThai,
        COALESCE(revenue.SoHoaDonHoanTat, 0) AS SoHoaDonHoanTat,
        COALESCE(revenue.DoanhThuGop, 0) AS DoanhThuGop,
        COALESCE(revenue.TienHoanTra, 0) AS TienHoanTra,
        COALESCE(revenue.DoanhThuThuan, 0) AS DoanhThuThuan,
        COALESCE(cash_payment.DoanhThuTienMatGhiNhan, 0) AS DoanhThuTienMatGhiNhan,
        CASE
            WHEN work_shift.TienCuoiCa IS NULL THEN NULL
            ELSE CONVERT(DECIMAL(18,2),
                work_shift.TienCuoiCa
                - work_shift.TienDauCa
                - COALESCE(cash_payment.DoanhThuTienMatGhiNhan, 0)
            )
        END AS ChenhLechTienMat
    FROM dbo.CA_LAM_VIEC AS work_shift
    JOIN dbo.NHAN_VIEN AS employee
        ON employee.MaNV = work_shift.MaNV
    OUTER APPLY (
        SELECT
            SUM(event.SoHoaDon) AS SoHoaDonHoanTat,
            SUM(event.DoanhThuGop) AS DoanhThuGop,
            SUM(event.TienHoanTra) AS TienHoanTra,
            SUM(event.DoanhThuThuan) AS DoanhThuThuan
        FROM dbo.vw_BAO_CAO_DOANH_THU_SU_KIEN AS event
        WHERE event.MaCa = work_shift.MaCa
    ) AS revenue
    OUTER APPLY (
        SELECT SUM(payment.SoTien) AS DoanhThuTienMatGhiNhan
        FROM dbo.HOA_DON AS invoice
        JOIN dbo.THANH_TOAN AS payment
            ON payment.MaHD = invoice.MaHD
        WHERE invoice.MaCa = work_shift.MaCa
          AND payment.TrangThai = ''SUCCESS''
          AND payment.PhuongThuc = ''CASH''
    ) AS cash_payment
    WHERE work_shift.GioBatDau >= @TuNgayUtc
      AND work_shift.GioBatDau < @DenNgayKeTiepUtc
    ORDER BY work_shift.GioBatDau DESC, work_shift.MaCa DESC;
END;');

IF OBJECT_DEFINITION(OBJECT_ID(N'dbo.usp_BAO_CAO_XuHuongDoanhThu', N'P')) NOT LIKE '%SE Asia Standard Time%'
    THROW 51021, 'Revenue trend must group by the Vietnam business timezone.', 1;

IF OBJECT_DEFINITION(OBJECT_ID(N'dbo.usp_HOA_DON_HoanTatBanHang', N'P')) LIKE '%SYSDATETIME()%'
    THROW 51022, 'Sale finalization still depends on the SQL Server local timezone.', 1;

IF OBJECT_DEFINITION(OBJECT_ID(N'dbo.usp_PHIEU_NHAP_XacNhan', N'P')) LIKE '%SYSDATETIME()%'
    THROW 51023, 'Receiving confirmation still depends on the SQL Server local timezone.', 1;

IF OBJECT_DEFINITION(OBJECT_ID(N'dbo.usp_PHIEU_TRA_HoanTat', N'P')) LIKE '%SYSDATETIME()%'
    THROW 51024, 'Return completion still depends on the SQL Server local timezone.', 1;

IF OBJECT_DEFINITION(OBJECT_ID(N'dbo.usp_KIEM_KE_PheDuyetDieuChinh', N'P')) LIKE '%SYSDATETIME()%'
    THROW 51025, 'Stocktake approval still depends on the SQL Server local timezone.', 1;
