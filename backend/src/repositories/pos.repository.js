'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { getSqlErrorNumber } = require('../utils/sql-error');
const { BaseRepository } = require('./base.repository');

class PosRepository extends BaseRepository {
  constructor(options = {}) {
    super(options);
    this.sqlDriver = options.sqlDriver || null;
    this.currentTimeProvider = options.currentTimeProvider || (() => null);
  }

  get sql() {
    if (!this.sqlDriver) {
      this.sqlDriver = getSqlDriver(getDatabaseSettings().driver);
    }
    return this.sqlDriver;
  }

  async findCurrentOpenShift(employeeId, transaction = null) {
    const result = await this.query({
      text: `
        SELECT TOP (1)
          work_shift.MaCa,
          work_shift.MaNV,
          employee.HoTen AS TenNhanVien,
          work_shift.GioBatDau,
          work_shift.TienDauCa,
          work_shift.TrangThai,
          work_shift.GhiChu,
          CONVERT(CHAR(10), business_calendar.ShiftBusinessDate, 23) AS BusinessDate,
          CONVERT(BIT, CASE
            WHEN business_calendar.ShiftBusinessDate < business_calendar.CurrentBusinessDate THEN 1
            ELSE 0
          END) AS IsCarryOver
        FROM dbo.CA_LAM_VIEC AS work_shift
        JOIN dbo.NHAN_VIEN AS employee ON employee.MaNV = work_shift.MaNV
        CROSS APPLY (VALUES (
          CONVERT(
            DATE,
            (work_shift.GioBatDau AT TIME ZONE 'UTC') AT TIME ZONE 'SE Asia Standard Time'
          ),
          CONVERT(
            DATE,
            (COALESCE(@CurrentUtc, SYSUTCDATETIME()) AT TIME ZONE 'UTC')
              AT TIME ZONE 'SE Asia Standard Time'
          )
        )) AS business_calendar (ShiftBusinessDate, CurrentBusinessDate)
        WHERE work_shift.MaNV = @EmployeeId
          AND work_shift.TrangThai = 'OPEN'
        ORDER BY work_shift.GioBatDau DESC, work_shift.MaCa DESC
      `,
      parameters: {
        CurrentUtc: { type: this.sql.DateTime2(0), value: this.currentTimeProvider() },
        EmployeeId: { type: this.sql.VarChar(10), value: employeeId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findOwnedShiftForUpdate(shiftId, employeeId, transaction) {
    const result = await this.query({
      text: `
        SELECT
          work_shift.MaCa,
          work_shift.MaNV,
          employee.HoTen AS TenNhanVien,
          work_shift.GioBatDau,
          work_shift.GioKetThuc,
          work_shift.TienDauCa,
          work_shift.TienCuoiCa,
          work_shift.TrangThai,
          work_shift.GhiChu
        FROM dbo.CA_LAM_VIEC AS work_shift WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.NHAN_VIEN AS employee ON employee.MaNV = work_shift.MaNV
        WHERE work_shift.MaCa = @ShiftId
          AND work_shift.MaNV = @EmployeeId
      `,
      parameters: {
        EmployeeId: { type: this.sql.VarChar(10), value: employeeId },
        ShiftId: { type: this.sql.BigInt, value: shiftId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async getShiftReconciliation(shiftId, employeeId, transaction = null) {
    const result = await this.query({
      text: `
        SELECT
          work_shift.MaCa,
          work_shift.MaNV,
          employee.HoTen AS TenNhanVien,
          work_shift.GioBatDau,
          work_shift.GioKetThuc,
          work_shift.TienDauCa,
          work_shift.TienCuoiCa,
          work_shift.TrangThai,
          work_shift.GhiChu,
          CONVERT(CHAR(10), business_calendar.ShiftBusinessDate, 23) AS BusinessDate,
          CONVERT(BIT, CASE
            WHEN business_calendar.ShiftBusinessDate < business_calendar.CurrentBusinessDate THEN 1
            ELSE 0
          END) AS IsCarryOver,
          COALESCE(invoice_totals.SoHoaDon, 0) AS SoHoaDon,
          COALESCE(invoice_totals.SoHoaDonHoanTat, 0) AS SoHoaDonHoanTat,
          COALESCE(invoice_totals.SoHoaDonHuy, 0) AS SoHoaDonHuy,
          COALESCE(invoice_totals.SoHoaDonChuaHoanTat, 0) AS SoHoaDonChuaHoanTat,
          COALESCE(invoice_totals.DoanhThuGop, 0) AS DoanhThuGop,
          COALESCE(invoice_totals.TongTienHoan, 0) AS TongTienHoan,
          COALESCE(invoice_totals.DoanhThuThuan, 0) AS DoanhThuThuan,
          COALESCE(payment_totals.DoanhThuTienMat, 0) AS DoanhThuTienMat,
          COALESCE(payment_totals.DoanhThuKhongTienMat, 0) AS DoanhThuKhongTienMat
        FROM dbo.CA_LAM_VIEC AS work_shift
        JOIN dbo.NHAN_VIEN AS employee ON employee.MaNV = work_shift.MaNV
        CROSS APPLY (VALUES (
          CONVERT(
            DATE,
            (work_shift.GioBatDau AT TIME ZONE 'UTC') AT TIME ZONE 'SE Asia Standard Time'
          ),
          CONVERT(
            DATE,
            (COALESCE(@CurrentUtc, SYSUTCDATETIME()) AT TIME ZONE 'UTC')
              AT TIME ZONE 'SE Asia Standard Time'
          )
        )) AS business_calendar (ShiftBusinessDate, CurrentBusinessDate)
        OUTER APPLY (
          SELECT
            COUNT_BIG(*) AS SoHoaDon,
            COALESCE(SUM(CASE WHEN invoice_summary.TrangThai IN ('PAID', 'REFUNDED') THEN 1 ELSE 0 END), 0)
              AS SoHoaDonHoanTat,
            COALESCE(SUM(CASE WHEN invoice_summary.TrangThai = 'CANCELLED' THEN 1 ELSE 0 END), 0)
              AS SoHoaDonHuy,
            COALESCE(SUM(CASE WHEN invoice_summary.TrangThai = 'DRAFT' THEN 1 ELSE 0 END), 0)
              AS SoHoaDonChuaHoanTat,
            COALESCE(SUM(invoice_summary.DoanhThuGop), 0) AS DoanhThuGop,
            COALESCE(SUM(invoice_summary.TienHoan), 0) AS TongTienHoan,
            COALESCE(SUM(invoice_summary.DoanhThuThuan), 0) AS DoanhThuThuan
          FROM (
            SELECT
              invoice.TrangThai,
              CASE
                WHEN invoice.TrangThai IN ('PAID', 'REFUNDED')
                  THEN invoice.TongThanhToan
                ELSE CONVERT(DECIMAL(18,2), 0)
              END AS DoanhThuGop,
              CASE
                WHEN invoice.TrangThai IN ('PAID', 'REFUNDED')
                  THEN CASE
                    WHEN COALESCE(return_totals.TienHoan, 0) > invoice.TongThanhToan
                      THEN invoice.TongThanhToan
                    ELSE COALESCE(return_totals.TienHoan, 0)
                  END
                ELSE CONVERT(DECIMAL(18,2), 0)
              END AS TienHoan,
              CASE
                WHEN invoice.TrangThai IN ('PAID', 'REFUNDED')
                  THEN CASE
                    WHEN COALESCE(return_totals.TienHoan, 0) >= invoice.TongThanhToan
                      THEN CONVERT(DECIMAL(18,2), 0)
                    ELSE invoice.TongThanhToan - COALESCE(return_totals.TienHoan, 0)
                  END
                ELSE CONVERT(DECIMAL(18,2), 0)
              END AS DoanhThuThuan
            FROM dbo.HOA_DON AS invoice
            OUTER APPLY (
              SELECT SUM(return_header.TongTienHoan) AS TienHoan
              FROM dbo.PHIEU_TRA AS return_header
              WHERE return_header.MaHD = invoice.MaHD
                AND return_header.TrangThai = 'COMPLETED'
            ) AS return_totals
            WHERE invoice.MaCa = work_shift.MaCa
          ) AS invoice_summary
        ) AS invoice_totals
        OUTER APPLY (
          SELECT
            COALESCE(SUM(CASE
              WHEN allocated_payment.PhuongThuc = 'CASH'
                THEN allocated_payment.SoTienThuan ELSE CONVERT(DECIMAL(18,2), 0)
            END), 0) AS DoanhThuTienMat,
            COALESCE(SUM(CASE
              WHEN allocated_payment.PhuongThuc <> 'CASH'
                THEN allocated_payment.SoTienThuan ELSE CONVERT(DECIMAL(18,2), 0)
            END), 0) AS DoanhThuKhongTienMat
          FROM (
            SELECT
              ranked_payment.PhuongThuc,
              CONVERT(DECIMAL(18,2), CASE
                WHEN ranked_payment.TienHoan <= ranked_payment.SoTienTruocDo
                  THEN ranked_payment.SoTienGop
                WHEN ranked_payment.TienHoan >= ranked_payment.SoTienTruocDo + ranked_payment.SoTienGop
                  THEN 0
                ELSE ranked_payment.SoTienTruocDo + ranked_payment.SoTienGop - ranked_payment.TienHoan
              END) AS SoTienThuan
            FROM (
              SELECT
                payment_by_method.MaHD,
                payment_by_method.PhuongThuc,
                payment_by_method.SoTienGop,
                payment_by_method.TienHoan,
                COALESCE(SUM(payment_by_method.SoTienGop) OVER (
                  PARTITION BY payment_by_method.MaHD
                  ORDER BY payment_by_method.ThuTuThanhToan, payment_by_method.PhuongThuc
                  ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                ), 0) AS SoTienTruocDo
              FROM (
                SELECT
                  invoice.MaHD,
                  payment.PhuongThuc,
                  MIN(payment.MaThanhToan) AS ThuTuThanhToan,
                  SUM(payment.SoTien) AS SoTienGop,
                  CASE
                    WHEN COALESCE(return_totals.TienHoan, 0) > invoice.TongThanhToan
                      THEN invoice.TongThanhToan
                    ELSE COALESCE(return_totals.TienHoan, 0)
                  END AS TienHoan
                FROM dbo.HOA_DON AS invoice
                JOIN dbo.THANH_TOAN AS payment
                  ON payment.MaHD = invoice.MaHD
                 AND payment.TrangThai IN ('SUCCESS', 'REFUNDED')
                OUTER APPLY (
                  SELECT SUM(return_header.TongTienHoan) AS TienHoan
                  FROM dbo.PHIEU_TRA AS return_header
                  WHERE return_header.MaHD = invoice.MaHD
                    AND return_header.TrangThai = 'COMPLETED'
                ) AS return_totals
                WHERE invoice.MaCa = work_shift.MaCa
                  AND invoice.TrangThai IN ('PAID', 'REFUNDED')
                GROUP BY
                  invoice.MaHD,
                  invoice.TongThanhToan,
                  payment.PhuongThuc,
                  return_totals.TienHoan
              ) AS payment_by_method
            ) AS ranked_payment
          ) AS allocated_payment
        ) AS payment_totals
        WHERE work_shift.MaCa = @ShiftId
          AND work_shift.MaNV = @EmployeeId
      `,
      parameters: {
        CurrentUtc: { type: this.sql.DateTime2(0), value: this.currentTimeProvider() },
        EmployeeId: { type: this.sql.VarChar(10), value: employeeId },
        ShiftId: { type: this.sql.BigInt, value: shiftId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async closeShift({ closingCash, employeeId, note, shiftId }, transaction) {
    const result = await this.query({
      text: `
        UPDATE dbo.CA_LAM_VIEC
        SET
          GioKetThuc = SYSUTCDATETIME(),
          TienCuoiCa = @ClosingCash,
          TrangThai = 'CLOSED',
          GhiChu = COALESCE(@Note, GhiChu)
        OUTPUT
          inserted.MaCa,
          inserted.MaNV,
          inserted.GioBatDau,
          inserted.GioKetThuc,
          inserted.TienDauCa,
          inserted.TienCuoiCa,
          inserted.TrangThai,
          inserted.GhiChu
        WHERE MaCa = @ShiftId
          AND MaNV = @EmployeeId
          AND TrangThai = 'OPEN'
      `,
      parameters: {
        ClosingCash: { type: this.sql.Decimal(18, 2), value: closingCash },
        EmployeeId: { type: this.sql.VarChar(10), value: employeeId },
        Note: { type: this.sql.NVarChar(255), value: note },
        ShiftId: { type: this.sql.BigInt, value: shiftId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async openShift({ employeeId, note, openingCash }, transaction = null) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_CA_LAM_VIEC_Mo
          @MaNV = @EmployeeId,
          @TienDauCa = @OpeningCash,
          @GhiChu = @Note
      `,
      parameters: {
        EmployeeId: { type: this.sql.VarChar(10), value: employeeId },
        Note: { type: this.sql.NVarChar(255), value: note },
        OpeningCash: { type: this.sql.Decimal(18, 2), value: openingCash },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findQuoteProducts(productIds, transaction = null) {
    if (productIds.length === 0) return [];
    const parameters = {};
    const placeholders = productIds.map((productId, index) => {
      const name = `ProductId${index}`;
      parameters[name] = { type: this.sql.VarChar(10), value: productId };
      return `@${name}`;
    });
    const result = await this.query({
      text: `
        DECLARE @BusinessDate DATE = CONVERT(
          DATE,
          (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'SE Asia Standard Time'
        );

        SELECT
          product.MaSP,
          product.TenSP,
          product.MaVach,
          product.DonViTinh,
          product.GiaBan,
          product.TrangThai AS TrangThaiSanPham,
          category.MaLoai,
          category.TenLoai,
          category.TrangThai AS TrangThaiLoai,
          COALESCE(sellable.TonKhaDung, CONVERT(BIGINT, 0)) AS TonKhaDung
        FROM dbo.SAN_PHAM AS product
        JOIN dbo.LOAI_SAN_PHAM AS category ON category.MaLoai = product.MaLoai
        LEFT JOIN dbo.ufn_SAN_PHAM_CoTheBan(@BusinessDate) AS sellable
          ON sellable.MaSP = product.MaSP
        WHERE product.MaSP IN (${placeholders.join(', ')})
      `,
      parameters,
      transaction,
    });
    return result.recordset;
  }

  async findActiveCustomerByPhone(phone, transaction = null) {
    const result = await this.query({
      text: `
        SELECT
          MaKH,
          HoTen,
          SDT,
          DiemTichLuy,
          HangThanhVien
        FROM dbo.KHACH_HANG
        WHERE SDT = @Phone
          AND TrangThai = 'ACTIVE'
      `,
      parameters: {
        Phone: { type: this.sql.VarChar(15), value: phone },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async finalizeCheckout({
    customerId,
    externalTransactionId,
    invoiceId,
    items,
    note,
    paymentAmount,
    paymentMethod,
    promotionId,
    shiftId,
  }, transaction = null) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_HOA_DON_HoanTatBanHang
          @MaHD = @InvoiceId,
          @MaCa = @ShiftId,
          @MaKH = @CustomerId,
          @DanhSachSanPham = @ItemsJson,
          @MaKM = @PromotionId,
          @PhuongThuc = @PaymentMethod,
          @SoTienThanhToan = @PaymentAmount,
          @MaGiaoDichNgoai = @ExternalTransactionId,
          @GhiChu = @Note
      `,
      parameters: {
        CustomerId: { type: this.sql.VarChar(10), value: customerId },
        ExternalTransactionId: {
          type: this.sql.VarChar(100),
          value: externalTransactionId,
        },
        InvoiceId: { type: this.sql.VarChar(15), value: invoiceId },
        ItemsJson: {
          type: this.sql.NVarChar(this.sql.MAX),
          value: JSON.stringify(items.map((item) => ({
            MaSP: item.productId,
            SoLuong: item.quantity,
          }))),
        },
        Note: { type: this.sql.NVarChar(255), value: note },
        PaymentAmount: { type: this.sql.Decimal(18, 2), value: paymentAmount },
        PaymentMethod: { type: this.sql.VarChar(20), value: paymentMethod },
        PromotionId: { type: this.sql.VarChar(12), value: promotionId },
        ShiftId: { type: this.sql.BigInt, value: shiftId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findPaidReceipt(invoiceId, transaction = null) {
    try {
      const result = await this.query({
        text: `
          EXEC dbo.usp_HOA_DON_LayChiTiet @MaHD = @InvoiceId;

          SELECT customer.SDT
          FROM dbo.HOA_DON AS invoice
          LEFT JOIN dbo.KHACH_HANG AS customer ON customer.MaKH = invoice.MaKH
          WHERE invoice.MaHD = @InvoiceId
            AND invoice.TrangThai = 'PAID';
        `,
        parameters: {
          InvoiceId: { type: this.sql.VarChar(15), value: invoiceId },
        },
        transaction,
      });
      return {
        customer: result.recordsets[3]?.[0] ?? null,
        header: result.recordsets[0]?.[0] ?? null,
        items: result.recordsets[1] ?? [],
        payments: result.recordsets[2] ?? [],
      };
    } catch (error) {
      if (getSqlErrorNumber(error) === 51531) return null;
      throw error;
    }
  }

  async searchSellableProducts({ page, pageSize, search }, transaction = null) {
    const result = await this.query({
      text: `
        DECLARE @BusinessDate DATE = CONVERT(
          DATE,
          (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'SE Asia Standard Time'
        );

        SELECT
          sellable.*,
          COUNT_BIG(*) OVER () AS TongSoBanGhi
        FROM dbo.ufn_SAN_PHAM_CoTheBan(@BusinessDate) AS sellable
        WHERE @Search IS NULL
           OR CHARINDEX(@Search, sellable.MaSP) > 0
           OR CHARINDEX(@Search, sellable.TenSP) > 0
           OR CHARINDEX(@Search, sellable.MaVach) > 0
        ORDER BY
          CASE
            WHEN sellable.MaSP = @Search THEN 0
            WHEN sellable.MaVach = @Search THEN 1
            WHEN CHARINDEX(@Search, sellable.MaSP) = 1 THEN 2
            WHEN CHARINDEX(@Search, sellable.TenSP) = 1 THEN 3
            ELSE 4
          END,
          sellable.TenSP,
          sellable.MaSP
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `,
      parameters: {
        Offset: { type: this.sql.Int, value: (page - 1) * pageSize },
        PageSize: { type: this.sql.Int, value: pageSize },
        Search: { type: this.sql.NVarChar(150), value: search },
      },
      transaction,
    });
    return {
      items: result.recordset,
      totalItems: Number(result.recordset[0]?.TongSoBanGhi ?? 0),
    };
  }

  async findSellableProductByBarcode(barcode, transaction = null) {
    const result = await this.query({
      text: `
        DECLARE @BusinessDate DATE = CONVERT(
          DATE,
          (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'SE Asia Standard Time'
        );

        SELECT TOP (1) *
        FROM dbo.ufn_SAN_PHAM_CoTheBan(@BusinessDate)
        WHERE MaVach = @Barcode
      `,
      parameters: {
        Barcode: { type: this.sql.VarChar(30), value: barcode },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }
}

module.exports = {
  PosRepository,
};
