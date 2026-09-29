SET NOCOUNT ON;
SET XACT_ABORT ON;
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

DROP PROCEDURE IF EXISTS dbo.usp_HOA_DON_HoanTatBanHang;
GO

CREATE PROCEDURE dbo.usp_HOA_DON_HoanTatBanHang
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

    SET @MaHD = NULLIF(LTRIM(RTRIM(@MaHD)), '');
    SET @MaKH = NULLIF(LTRIM(RTRIM(@MaKH)), '');
    SET @MaKM = NULLIF(LTRIM(RTRIM(@MaKM)), '');
    SET @PhuongThuc = UPPER(NULLIF(LTRIM(RTRIM(@PhuongThuc)), ''));
    SET @MaGiaoDichNgoai = NULLIF(LTRIM(RTRIM(@MaGiaoDichNgoai)), '');
    SET @GhiChu = NULLIF(LTRIM(RTRIM(@GhiChu)), N'');

    IF @MaHD IS NULL
        THROW 51510, 'Invoice code is required.', 1;

    IF @DanhSachSanPham IS NULL
       OR ISJSON(@DanhSachSanPham) <> 1
       OR LEFT(LTRIM(@DanhSachSanPham), 1) <> '['
        THROW 51511, 'Sale items must be a JSON array.', 1;

    IF @PhuongThuc IS NULL
       OR @PhuongThuc NOT IN ('CASH', 'CARD', 'TRANSFER', 'EWALLET')
        THROW 51512, 'Unsupported payment method.', 1;

    IF @SoTienThanhToan IS NULL OR @SoTienThanhToan <= 0
        THROW 51513, 'Payment amount must be greater than zero.', 1;

    DECLARE @Items TABLE (
        RowNumber INT NOT NULL PRIMARY KEY,
        MaSP VARCHAR(10) NULL,
        SoLuong INT NULL
    );

    INSERT INTO @Items (RowNumber, MaSP, SoLuong)
    SELECT
        TRY_CONVERT(INT, item.[key]),
        NULLIF(LTRIM(RTRIM(parsed.MaSP)), ''),
        parsed.SoLuong
    FROM OPENJSON(@DanhSachSanPham) AS item
    CROSS APPLY OPENJSON(item.[value])
        WITH (
            MaSP VARCHAR(10) '$.MaSP',
            SoLuong INT '$.SoLuong'
        ) AS parsed;

    IF NOT EXISTS (SELECT 1 FROM @Items)
       OR EXISTS (SELECT 1 FROM @Items WHERE MaSP IS NULL OR SoLuong IS NULL OR SoLuong <= 0)
        THROW 51514, 'Every sale item requires a product code and a positive integer quantity.', 1;

    IF EXISTS (
        SELECT MaSP
        FROM @Items
        GROUP BY MaSP
        HAVING COUNT(*) > 1
    )
        THROW 51515, 'A product can appear only once in a sale request.', 1;

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
            THROW 51516, 'Invoice code already exists.', 1;

        DECLARE
            @MaNV VARCHAR(10),
            @ThoiGian DATETIME2(0) = SYSDATETIME();

        SELECT @MaNV = work_shift.MaNV
        FROM dbo.CA_LAM_VIEC AS work_shift WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.NHAN_VIEN AS employee WITH (UPDLOCK, HOLDLOCK)
            ON employee.MaNV = work_shift.MaNV
        JOIN dbo.TAI_KHOAN AS account WITH (UPDLOCK, HOLDLOCK)
            ON account.MaNV = employee.MaNV
        WHERE work_shift.MaCa = @MaCa
          AND work_shift.TrangThai = 'OPEN'
          AND employee.TrangThai = 'ACTIVE'
          AND account.MaVaiTro = 'CASHIER'
          AND account.TrangThai = 'ACTIVE';

        IF @MaNV IS NULL
            THROW 51517, 'Sale requires an OPEN shift owned by an active CASHIER account.', 1;

        IF @MaKH IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
               FROM dbo.KHACH_HANG WITH (UPDLOCK, HOLDLOCK)
               WHERE MaKH = @MaKH
                 AND TrangThai = 'ACTIVE'
           )
            THROW 51518, 'Customer member does not exist or is inactive.', 1;

        INSERT INTO @Cart (MaSP, SoLuong, DonGiaBan, TienHang)
        SELECT
            item.MaSP,
            item.SoLuong,
            product.GiaBan,
            CONVERT(DECIMAL(18,2), item.SoLuong * product.GiaBan)
        FROM @Items AS item
        JOIN dbo.SAN_PHAM AS product WITH (UPDLOCK, HOLDLOCK)
            ON product.MaSP = item.MaSP
           AND product.TrangThai = 'ACTIVE'
        JOIN dbo.LOAI_SAN_PHAM AS category WITH (UPDLOCK, HOLDLOCK)
            ON category.MaLoai = product.MaLoai
           AND category.TrangThai = 'ACTIVE';

        IF (SELECT COUNT(*) FROM @Cart) <> (SELECT COUNT(*) FROM @Items)
            THROW 51519, 'Every sale product and category must exist and be ACTIVE.', 1;

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
              AND promotion.TrangThai = 'ACTIVE'
              AND promotion.NgayBatDau <= @ThoiGian
              AND promotion.NgayKetThuc > @ThoiGian;

            IF @LoaiKM IS NULL
                THROW 51520, 'Promotion does not exist or is not active at the sale time.', 1;

            IF @TongTienHang < @GiaTriDonToiThieu
                THROW 51521, 'Sale subtotal does not meet the promotion minimum order value.', 1;

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
                THROW 51522, 'Promotion is not assigned to any product in the sale.', 1;

            SET @TongGiamGia = CASE
                WHEN @LoaiKM = 'PERCENT'
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
            THROW 51523, 'The finalized total must be positive for the current payment schema.', 1;

        IF @SoTienThanhToan <> @TongThanhToan
            THROW 51524, 'Successful payment amount must equal the server-calculated invoice total.', 1;

        DECLARE @DiemTichLuy INT = FLOOR(@TongThanhToan / 10000);

        IF @MaKH IS NULL
            SET @DiemTichLuy = 0;
        ELSE IF EXISTS (
            SELECT 1
            FROM dbo.KHACH_HANG
            WHERE MaKH = @MaKH
              AND DiemTichLuy > 2147483647 - @DiemTichLuy
        )
            THROW 51525, 'The loyalty point update would overflow the customer balance.', 1;

        INSERT INTO dbo.HOA_DON (
            MaHD, NgayLap, MaCa, MaKH, TongTienHang, TongGiamGia,
            TongThanhToan, DiemSuDung, DiemTichLuy, TrangThai, GhiChu
        )
        VALUES (
            @MaHD, @ThoiGian, @MaCa, @MaKH, @TongTienHang, @TongGiamGia,
            @TongThanhToan, 0, @DiemTichLuy, 'DRAFT', @GhiChu
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
              AND lot.TrangThai = 'ACTIVE'
              AND lot.SoLuongTon > 0
              AND (lot.HanSuDung IS NULL OR lot.HanSuDung > CONVERT(DATE, @ThoiGian));

            IF @TongTonKhaDung < @SoLuongYeuCau
            BEGIN
                CLOSE ProductCursor;
                DEALLOCATE ProductCursor;
                THROW 51526, 'Insufficient unexpired inventory to complete the sale.', 1;
            END;

            SET @SoLuongConLai = @SoLuongYeuCau;

            DECLARE LotCursor CURSOR LOCAL FAST_FORWARD FOR
                SELECT lot.MaLo, lot.SoLuongTon
                FROM dbo.LO_HANG AS lot WITH (UPDLOCK, HOLDLOCK)
                WHERE lot.MaSP = @MaSP
                  AND lot.TrangThai = 'ACTIVE'
                  AND lot.SoLuongTon > 0
                  AND (lot.HanSuDung IS NULL OR lot.HanSuDung > CONVERT(DATE, @ThoiGian))
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
                    THROW 51527, 'Inventory changed while FEFO allocation was in progress.', 1;
                END;

                INSERT INTO dbo.CHI_TIET_XUAT_LO (MaCTHD, MaLo, SoLuong)
                VALUES (@MaCTHD, @MaLo, @SoLuongXuat);

                INSERT INTO dbo.GIAO_DICH_KHO (
                    MaSP, MaLo, LoaiGiaoDich, SoLuongBienDong,
                    ThoiGian, MaThamChieu, MaNV, GhiChu
                )
                VALUES (
                    @MaSP, @MaLo, 'SALE', -@SoLuongXuat,
                    @ThoiGian, @MaHD, @MaNV, N'Xuất bán theo hóa đơn ' + @MaHD
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
            @MaHD, @ThoiGian, @PhuongThuc, @TongThanhToan, 'SUCCESS', @MaGiaoDichNgoai
        );

        IF @MaKH IS NOT NULL AND @DiemTichLuy > 0
        BEGIN
            UPDATE dbo.KHACH_HANG
            SET DiemTichLuy = DiemTichLuy + @DiemTichLuy
            WHERE MaKH = @MaKH;
        END;

        UPDATE dbo.HOA_DON
        SET TrangThai = 'PAID'
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
           AND payment.TrangThai = 'SUCCESS'
        WHERE invoice.MaHD = @MaHD;
    END TRY
    BEGIN CATCH
        IF CURSOR_STATUS('local', 'LotCursor') >= -1
        BEGIN
            IF CURSOR_STATUS('local', 'LotCursor') > -1 CLOSE LotCursor;
            DEALLOCATE LotCursor;
        END;

        IF CURSOR_STATUS('local', 'ProductCursor') >= -1
        BEGIN
            IF CURSOR_STATUS('local', 'ProductCursor') > -1 CLOSE ProductCursor;
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
END;
GO

DROP PROCEDURE IF EXISTS dbo.usp_HOA_DON_LayChiTiet;
GO

CREATE PROCEDURE dbo.usp_HOA_DON_LayChiTiet
    @MaHD VARCHAR(15)
AS
BEGIN
    SET NOCOUNT ON;

    SET @MaHD = NULLIF(LTRIM(RTRIM(@MaHD)), '');

    IF @MaHD IS NULL
        THROW 51530, 'Invoice code is required.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.HOA_DON
        WHERE MaHD = @MaHD
          AND TrangThai = 'PAID'
    )
        THROW 51531, 'A paid invoice with the requested code does not exist.', 1;

    SELECT
        invoice.MaHD,
        invoice.NgayLap,
        invoice.MaCa,
        work_shift.MaNV,
        employee.HoTen AS TenNhanVien,
        invoice.MaKH,
        customer.HoTen AS TenKhachHang,
        invoice.TongTienHang,
        invoice.TongGiamGia,
        invoice.TongThanhToan,
        invoice.DiemSuDung,
        invoice.DiemTichLuy,
        invoice.TrangThai,
        invoice.GhiChu
    FROM dbo.HOA_DON AS invoice
    JOIN dbo.CA_LAM_VIEC AS work_shift ON work_shift.MaCa = invoice.MaCa
    JOIN dbo.NHAN_VIEN AS employee ON employee.MaNV = work_shift.MaNV
    LEFT JOIN dbo.KHACH_HANG AS customer ON customer.MaKH = invoice.MaKH
    WHERE invoice.MaHD = @MaHD;

    SELECT
        MaCTHD, MaSP, TenSP, MaVach, DonViTinh,
        SoLuong, DonGiaBan, TienGiam, ThanhTien, MaKM, TenKM
    FROM dbo.vw_HOA_DON_CHI_TIET
    WHERE MaHD = @MaHD
    ORDER BY MaCTHD;

    SELECT
        MaThanhToan, PhuongThuc, SoTien, ThoiGian,
        MaGiaoDichNgoai, TrangThaiThanhToan
    FROM dbo.vw_HOA_DON_THANH_TOAN
    WHERE MaHD = @MaHD
      AND TrangThaiThanhToan = 'SUCCESS'
    ORDER BY MaThanhToan;
END;
GO

PRINT 'Cashier shift opening, atomic FEFO sale finalization and paid invoice query procedures are ready.';
GO
