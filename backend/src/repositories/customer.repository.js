'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { BaseRepository } = require('./base.repository');

class CustomerRepository extends BaseRepository {
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

  async findById(customerId, transaction = null) {
    const result = await this.query({
      text: `
        SELECT
          MaKH,
          HoTen,
          SDT,
          Email,
          DiaChi,
          NgaySinh,
          DiemTichLuy,
          HangThanhVien,
          NgayDangKy,
          TrangThai
        FROM dbo.KHACH_HANG
        WHERE MaKH = @CustomerId
      `,
      parameters: {
        CustomerId: { type: this.sql.VarChar(10), value: customerId },
      },
      transaction,
    });

    return result.recordset[0] ?? null;
  }

  async findLoyaltyById(customerId, transaction = null) {
    const result = await this.query({
      text: `
        SELECT MaKH, DiemTichLuy, HangThanhVien, TrangThai
        FROM dbo.KHACH_HANG
        WHERE MaKH = @CustomerId
      `,
      parameters: {
        CustomerId: { type: this.sql.VarChar(10), value: customerId },
      },
      transaction,
    });

    return result.recordset[0] ?? null;
  }

  async listInvoices({ customerId, from, page, pageSize, to }, transaction = null) {
    const result = await this.query({
      text: `
        SELECT COUNT(*) AS TotalItems
        FROM dbo.HOA_DON AS invoice
        WHERE invoice.MaKH = @CustomerId
          AND invoice.TrangThai IN ('PAID', 'REFUNDED')
          AND (@FromDate IS NULL OR invoice.NgayLap >= @FromDate)
          AND (@ToDate IS NULL OR invoice.NgayLap < DATEADD(DAY, 1, @ToDate));

        SELECT
          invoice.MaHD,
          invoice.NgayLap,
          invoice.TongThanhToan,
          invoice.TrangThai
        FROM dbo.HOA_DON AS invoice
        WHERE invoice.MaKH = @CustomerId
          AND invoice.TrangThai IN ('PAID', 'REFUNDED')
          AND (@FromDate IS NULL OR invoice.NgayLap >= @FromDate)
          AND (@ToDate IS NULL OR invoice.NgayLap < DATEADD(DAY, 1, @ToDate))
        ORDER BY invoice.NgayLap DESC, invoice.MaHD DESC
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
      `,
      parameters: {
        CustomerId: { type: this.sql.VarChar(10), value: customerId },
        FromDate: { type: this.sql.Date, value: from },
        Offset: { type: this.sql.Int, value: (page - 1) * pageSize },
        PageSize: { type: this.sql.Int, value: pageSize },
        ToDate: { type: this.sql.Date, value: to },
      },
      transaction,
    });

    return {
      items: result.recordsets[1] ?? [],
      totalItems: Number(result.recordsets[0]?.[0]?.TotalItems ?? 0),
    };
  }

  async findInvoiceDetail(customerId, invoiceId, transaction = null) {
    const result = await this.query({
      text: `
        SELECT
          invoice.MaHD,
          invoice.NgayLap,
          invoice.TongTienHang,
          invoice.TongGiamGia,
          invoice.TongThanhToan,
          invoice.TrangThai
        FROM dbo.HOA_DON AS invoice
        WHERE invoice.MaHD = @InvoiceId
          AND invoice.MaKH = @CustomerId
          AND invoice.TrangThai IN ('PAID', 'REFUNDED');

        SELECT
          detail.MaSP,
          product.TenSP,
          detail.SoLuong,
          detail.DonGiaBan,
          detail.TienGiam,
          detail.ThanhTien
        FROM dbo.CHI_TIET_HOA_DON AS detail
        JOIN dbo.HOA_DON AS invoice ON invoice.MaHD = detail.MaHD
        JOIN dbo.SAN_PHAM AS product ON product.MaSP = detail.MaSP
        WHERE invoice.MaHD = @InvoiceId
          AND invoice.MaKH = @CustomerId
          AND invoice.TrangThai IN ('PAID', 'REFUNDED')
        ORDER BY detail.MaCTHD;
      `,
      parameters: {
        CustomerId: { type: this.sql.VarChar(10), value: customerId },
        InvoiceId: { type: this.sql.VarChar(15), value: invoiceId },
      },
      transaction,
    });

    const invoice = result.recordsets[0]?.[0];
    if (!invoice) return null;

    return {
      invoice,
      items: result.recordsets[1] ?? [],
    };
  }

  async emailExistsForAnotherOwner(email, customerId, transaction) {
    if (!email) return false;

    const result = await this.query({
      text: `
        SELECT CAST(CASE WHEN EXISTS (
          SELECT 1 FROM dbo.TAI_KHOAN WITH (UPDLOCK, HOLDLOCK)
          WHERE TenDangNhap = @Email
            AND (MaKH IS NULL OR MaKH <> @CustomerId)
        ) OR EXISTS (
          SELECT 1 FROM dbo.KHACH_HANG WITH (UPDLOCK, HOLDLOCK)
          WHERE Email = @Email AND MaKH <> @CustomerId
        ) OR EXISTS (
          SELECT 1 FROM dbo.NHAN_VIEN WITH (UPDLOCK, HOLDLOCK)
          WHERE Email = @Email
        ) THEN 1 ELSE 0 END AS BIT) AS EmailExists
      `,
      parameters: {
        CustomerId: { type: this.sql.VarChar(10), value: customerId },
        Email: { type: this.sql.VarChar(100), value: email },
      },
      transaction,
    });

    return Boolean(result.recordset[0].EmailExists);
  }

  async updateProfile(customerId, changes, transaction) {
    const result = await this.query({
      text: `
        UPDATE dbo.KHACH_HANG
        SET
          HoTen = CASE WHEN @SetFullName = 1 THEN @FullName ELSE HoTen END,
          Email = CASE WHEN @SetEmail = 1 THEN @Email ELSE Email END,
          DiaChi = CASE WHEN @SetAddress = 1 THEN @Address ELSE DiaChi END
        WHERE MaKH = @CustomerId
          AND TrangThai = 'ACTIVE';

        SELECT
          MaKH,
          HoTen,
          SDT,
          Email,
          DiaChi,
          NgaySinh,
          DiemTichLuy,
          HangThanhVien,
          NgayDangKy,
          TrangThai
        FROM dbo.KHACH_HANG
        WHERE MaKH = @CustomerId;
      `,
      parameters: {
        Address: { type: this.sql.NVarChar(255), value: changes.address ?? null },
        CustomerId: { type: this.sql.VarChar(10), value: customerId },
        Email: { type: this.sql.VarChar(100), value: changes.email ?? null },
        FullName: { type: this.sql.NVarChar(100), value: changes.fullName ?? null },
        SetAddress: { type: this.sql.Bit, value: Object.hasOwn(changes, 'address') },
        SetEmail: { type: this.sql.Bit, value: Object.hasOwn(changes, 'email') },
        SetFullName: { type: this.sql.Bit, value: Object.hasOwn(changes, 'fullName') },
      },
      transaction,
    });

    return result.recordset[0] ?? null;
  }
}

module.exports = {
  CustomerRepository,
};
