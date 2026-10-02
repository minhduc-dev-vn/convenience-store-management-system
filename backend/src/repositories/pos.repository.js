'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { getSqlErrorNumber } = require('../utils/sql-error');
const { BaseRepository } = require('./base.repository');

const SELLABLE_PRODUCT_CTE = `
  WITH SellableProducts AS (
    SELECT
      product.MaSP,
      product.TenSP,
      product.MaVach,
      product.DonViTinh,
      product.GiaBan,
      product.MaLoai,
      category.TenLoai,
      SUM(CONVERT(BIGINT, lot.SoLuongTon)) AS TonKhaDung
    FROM dbo.SAN_PHAM AS product
    JOIN dbo.LOAI_SAN_PHAM AS category
      ON category.MaLoai = product.MaLoai
     AND category.TrangThai = 'ACTIVE'
    JOIN dbo.LO_HANG AS lot
      ON lot.MaSP = product.MaSP
     AND lot.TrangThai = 'ACTIVE'
     AND lot.SoLuongTon > 0
     AND (lot.HanSuDung IS NULL OR lot.HanSuDung > CONVERT(DATE, SYSDATETIME()))
    WHERE product.TrangThai = 'ACTIVE'
    GROUP BY
      product.MaSP, product.TenSP, product.MaVach, product.DonViTinh,
      product.GiaBan, product.MaLoai, category.TenLoai
  )
`;

class PosRepository extends BaseRepository {
  constructor(options = {}) {
    super(options);
    this.sqlDriver = options.sqlDriver || null;
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
          work_shift.GhiChu
        FROM dbo.CA_LAM_VIEC AS work_shift
        JOIN dbo.NHAN_VIEN AS employee ON employee.MaNV = work_shift.MaNV
        WHERE work_shift.MaNV = @EmployeeId
          AND work_shift.TrangThai = 'OPEN'
        ORDER BY work_shift.GioBatDau DESC, work_shift.MaCa DESC
      `,
      parameters: {
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
          COALESCE(invoice_totals.SoHoaDon, 0) AS SoHoaDon,
          COALESCE(invoice_totals.SoHoaDonHoanTat, 0) AS SoHoaDonHoanTat,
          COALESCE(invoice_totals.SoHoaDonHuy, 0) AS SoHoaDonHuy,
          COALESCE(invoice_totals.SoHoaDonChuaHoanTat, 0) AS SoHoaDonChuaHoanTat,
          COALESCE(invoice_totals.DoanhThu, 0) AS DoanhThu,
          COALESCE(payment_totals.DoanhThuTienMat, 0) AS DoanhThuTienMat,
          COALESCE(payment_totals.DoanhThuKhongTienMat, 0) AS DoanhThuKhongTienMat
        FROM dbo.CA_LAM_VIEC AS work_shift
        JOIN dbo.NHAN_VIEN AS employee ON employee.MaNV = work_shift.MaNV
        OUTER APPLY (
          SELECT
            COUNT_BIG(*) AS SoHoaDon,
            COALESCE(SUM(CASE WHEN invoice.TrangThai IN ('PAID', 'REFUNDED') THEN 1 ELSE 0 END), 0)
              AS SoHoaDonHoanTat,
            COALESCE(SUM(CASE WHEN invoice.TrangThai = 'CANCELLED' THEN 1 ELSE 0 END), 0)
              AS SoHoaDonHuy,
            COALESCE(SUM(CASE WHEN invoice.TrangThai = 'DRAFT' THEN 1 ELSE 0 END), 0)
              AS SoHoaDonChuaHoanTat,
            COALESCE(SUM(CASE
              WHEN invoice.TrangThai IN ('PAID', 'REFUNDED') THEN invoice.TongThanhToan
              ELSE CONVERT(DECIMAL(18,2), 0)
            END), 0) AS DoanhThu
          FROM dbo.HOA_DON AS invoice
          WHERE invoice.MaCa = work_shift.MaCa
        ) AS invoice_totals
        OUTER APPLY (
          SELECT
            COALESCE(SUM(CASE
              WHEN payment.TrangThai = 'SUCCESS' AND payment.PhuongThuc = 'CASH'
                THEN payment.SoTien ELSE CONVERT(DECIMAL(18,2), 0)
            END), 0) AS DoanhThuTienMat,
            COALESCE(SUM(CASE
              WHEN payment.TrangThai = 'SUCCESS' AND payment.PhuongThuc <> 'CASH'
                THEN payment.SoTien ELSE CONVERT(DECIMAL(18,2), 0)
            END), 0) AS DoanhThuKhongTienMat
          FROM dbo.HOA_DON AS invoice
          JOIN dbo.THANH_TOAN AS payment ON payment.MaHD = invoice.MaHD
          WHERE invoice.MaCa = work_shift.MaCa
        ) AS payment_totals
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

  async closeShift({ closingCash, employeeId, note, shiftId }, transaction) {
    const result = await this.query({
      text: `
        UPDATE dbo.CA_LAM_VIEC
        SET
          GioKetThuc = SYSDATETIME(),
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
          COALESCE(SUM(
            CASE
              WHEN lot.TrangThai = 'ACTIVE'
               AND lot.SoLuongTon > 0
               AND (lot.HanSuDung IS NULL OR lot.HanSuDung > CONVERT(DATE, SYSDATETIME()))
                THEN CONVERT(BIGINT, lot.SoLuongTon)
              ELSE CONVERT(BIGINT, 0)
            END
          ), 0) AS TonKhaDung
        FROM dbo.SAN_PHAM AS product
        JOIN dbo.LOAI_SAN_PHAM AS category ON category.MaLoai = product.MaLoai
        LEFT JOIN dbo.LO_HANG AS lot ON lot.MaSP = product.MaSP
        WHERE product.MaSP IN (${placeholders.join(', ')})
        GROUP BY
          product.MaSP, product.TenSP, product.MaVach, product.DonViTinh,
          product.GiaBan, product.TrangThai,
          category.MaLoai, category.TenLoai, category.TrangThai
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

  async searchSellableProducts({ page, pageSize, search, searchPattern }, transaction = null) {
    const result = await this.query({
      text: `
        ${SELLABLE_PRODUCT_CTE}
        SELECT
          sellable.*,
          COUNT_BIG(*) OVER () AS TongSoBanGhi
        FROM SellableProducts AS sellable
        WHERE @Search IS NULL
           OR sellable.MaSP LIKE @SearchPattern ESCAPE N'~'
           OR sellable.TenSP LIKE @SearchPattern ESCAPE N'~'
           OR sellable.MaVach = @Search
        ORDER BY
          CASE
            WHEN sellable.MaSP = @Search THEN 0
            WHEN sellable.MaVach = @Search THEN 1
            ELSE 2
          END,
          sellable.TenSP,
          sellable.MaSP
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `,
      parameters: {
        Offset: { type: this.sql.Int, value: (page - 1) * pageSize },
        PageSize: { type: this.sql.Int, value: pageSize },
        Search: { type: this.sql.NVarChar(150), value: search },
        SearchPattern: { type: this.sql.NVarChar(304), value: searchPattern },
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
        ${SELLABLE_PRODUCT_CTE}
        SELECT TOP (1) *
        FROM SellableProducts
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
