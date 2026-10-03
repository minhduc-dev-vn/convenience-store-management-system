SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DROP PROCEDURE IF EXISTS dbo.usp_PHIEU_TRA_HoanTat;
GO

CREATE PROCEDURE dbo.usp_PHIEU_TRA_HoanTat
    @MaPT VARCHAR(15),
    @MaHD VARCHAR(15),
    @MaNV VARCHAR(10),
    @LyDo NVARCHAR(255),
    @DanhSachHangTra NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @MaPT = NULLIF(LTRIM(RTRIM(@MaPT)), '');
    SET @MaHD = NULLIF(LTRIM(RTRIM(@MaHD)), '');
    SET @MaNV = NULLIF(LTRIM(RTRIM(@MaNV)), '');
    SET @LyDo = NULLIF(LTRIM(RTRIM(@LyDo)), N'');

    IF @MaPT IS NULL
        THROW 51601, 'Return code is required.', 1;

    IF @MaHD IS NULL
        THROW 51602, 'Original invoice code is required.', 1;

    IF @MaNV IS NULL
        THROW 51603, 'Processing employee code is required.', 1;

    IF @LyDo IS NULL
        THROW 51604, 'Return reason is required.', 1;

    IF @DanhSachHangTra IS NULL
       OR ISJSON(@DanhSachHangTra) <> 1
       OR LEFT(LTRIM(@DanhSachHangTra), 1) <> '['
        THROW 51605, 'Return items must be a JSON array.', 1;

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
        JSON_VALUE(item.[value], '$.MaCTHD'),
        JSON_VALUE(item.[value], '$.MaLo'),
        JSON_VALUE(item.[value], '$.SoLuongTra'),
        JSON_VALUE(item.[value], '$.TinhTrangHang')
    FROM OPENJSON(@DanhSachHangTra) AS item;

    IF NOT EXISTS (SELECT 1 FROM @RawItems)
       OR EXISTS (
           SELECT 1
           FROM @RawItems
           WHERE TRY_CONVERT(BIGINT, MaCTHDText) IS NULL
              OR TRY_CONVERT(BIGINT, MaCTHDText) <= 0
              OR NULLIF(LTRIM(RTRIM(MaLoText)), N'') IS NULL
              OR LEN(LTRIM(RTRIM(MaLoText))) > 20
              OR TRY_CONVERT(INT, SoLuongTraText) IS NULL
              OR TRY_CONVERT(INT, SoLuongTraText) <= 0
              OR UPPER(NULLIF(LTRIM(RTRIM(TinhTrangHangText)), N'')) NOT IN ('RESALABLE', 'DAMAGED')
       )
        THROW 51606, 'Every return item requires a valid invoice line, lot, positive quantity and condition.', 1;

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
            THROW 51607, 'The same invoice-line lot can appear only once in a return request.', 1;
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
            THROW 51608, 'Return code already exists.', 1;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.NHAN_VIEN WITH (UPDLOCK, HOLDLOCK)
            WHERE MaNV = @MaNV
              AND TrangThai = 'ACTIVE'
        )
            THROW 51609, 'Processing employee does not exist or is inactive.', 1;

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
            THROW 51610, 'Original invoice does not exist.', 1;

        IF @TrangThaiHoaDon <> 'PAID'
            THROW 51611, 'Only a PAID invoice can receive another return.', 1;

        IF @DiemSuDung > 0
            THROW 51612, 'Returns for invoices that redeemed loyalty points require a resolved redemption policy.', 1;

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
              AND return_header.TrangThai = 'COMPLETED'
        ) AS returned_lot
        OUTER APPLY (
            SELECT SUM(CONVERT(BIGINT, return_line.SoLuongTra)) AS SoLuongDaTra
            FROM dbo.CHI_TIET_PHIEU_TRA AS return_line WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.PHIEU_TRA AS return_header WITH (UPDLOCK, HOLDLOCK)
                ON return_header.MaPT = return_line.MaPT
            WHERE return_line.MaCTHD = item.MaCTHD
              AND return_header.MaHD = @MaHD
              AND return_header.TrangThai = 'COMPLETED'
        ) AS returned_line;

        IF (SELECT COUNT(*) FROM @Prepared) <> (SELECT COUNT(*) FROM @Items)
            THROW 51613, 'Every return item must belong to a lot exported by the original invoice.', 1;

        IF EXISTS (
            SELECT 1
            FROM @Prepared
            WHERE SoLuongDaTraLo + SoLuongTra > SoLuongXuat
        )
            THROW 51614, 'Return quantity exceeds the quantity still returnable from the original lot allocation.', 1;

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
          AND return_header.TrangThai = 'COMPLETED';

        IF @TongTienHoan IS NULL
           OR @TongTienHoan < 0
           OR @TongTienHoanTruoc + @TongTienHoan > @TongThanhToan
            THROW 51615, 'Calculated refund exceeds the authoritative paid invoice value.', 1;

        INSERT INTO dbo.PHIEU_TRA (
            MaPT, MaHD, MaNV, NgayTra, LyDo, TongTienHoan, TrangThai
        )
        VALUES (
            @MaPT, @MaHD, @MaNV, SYSDATETIME(), @LyDo, @TongTienHoan, 'CREATED'
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
            WHERE prepared.TinhTrangHang = 'RESALABLE'
              AND lot.SoLuongTon > 2147483647 - prepared.SoLuongTra
        )
            THROW 51616, 'Restoring the returned quantity would overflow the lot balance.', 1;

        UPDATE lot
        SET SoLuongTon = lot.SoLuongTon + prepared.SoLuongTra
        FROM dbo.LO_HANG AS lot
        JOIN @Prepared AS prepared ON prepared.MaLo = lot.MaLo
        WHERE prepared.TinhTrangHang = 'RESALABLE';

        INSERT INTO dbo.GIAO_DICH_KHO (
            MaSP, MaLo, LoaiGiaoDich, SoLuongBienDong,
            ThoiGian, MaThamChieu, MaNV, GhiChu
        )
        SELECT
            prepared.MaSP,
            prepared.MaLo,
            'RETURN',
            prepared.SoLuongTra,
            SYSDATETIME(),
            @MaPT,
            @MaNV,
            N'Hoàn kho từ phiếu trả ' + @MaPT
        FROM @Prepared AS prepared
        WHERE prepared.TinhTrangHang = 'RESALABLE';

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
                THROW 51617, 'Customer loyalty balance is insufficient for the return adjustment.', 1;
        END;

        UPDATE dbo.PHIEU_TRA
        SET TrangThai = 'COMPLETED'
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
                  AND return_header.TrangThai = 'COMPLETED'
            ) AS returned
            WHERE invoice_line.MaHD = @MaHD
              AND lot_output.SoLuong > COALESCE(returned.SoLuongDaTra, 0)
        )
            SET @DaTraHet = 1;

        IF @DaTraHet = 1
        BEGIN
            UPDATE dbo.HOA_DON
            SET TrangThai = 'REFUNDED'
            WHERE MaHD = @MaHD;

            UPDATE dbo.THANH_TOAN
            SET TrangThai = 'REFUNDED'
            WHERE MaHD = @MaHD
              AND TrangThai = 'SUCCESS';
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
END;
GO

PRINT 'Atomic return, refund and exact-lot stock restoration procedure is ready.';
GO
