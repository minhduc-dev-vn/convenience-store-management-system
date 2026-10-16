'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { BaseRepository } = require('./base.repository');

class InvoiceRepository extends BaseRepository {
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

  async listInvoices(filters, transaction = null) {
    const result = await this.query({
      text: `
        DECLARE
          @UtcFrom DATETIME2(0) = CASE WHEN @FromDate IS NULL THEN NULL ELSE CONVERT(
            DATETIME2(0),
            (CONVERT(DATETIME2(0), @FromDate) AT TIME ZONE 'SE Asia Standard Time') AT TIME ZONE 'UTC'
          ) END,
          @UtcToExclusive DATETIME2(0) = CASE WHEN @ToDate IS NULL THEN NULL ELSE CONVERT(
            DATETIME2(0),
            (DATEADD(DAY, 1, CONVERT(DATETIME2(0), @ToDate)) AT TIME ZONE 'SE Asia Standard Time') AT TIME ZONE 'UTC'
          ) END;

        SELECT
          invoice.MaHD,
          invoice.NgayLap,
          invoice.MaCa,
          work_shift.MaNV,
          employee.HoTen AS TenNhanVien,
          invoice.MaKH,
          customer.HoTen AS TenKhachHang,
          customer.SDT AS SDTKhachHang,
          invoice.TongTienHang,
          invoice.TongGiamGia,
          invoice.TongThanhToan,
          invoice.TrangThai,
          COUNT_BIG(*) OVER () AS TongSoBanGhi
        FROM dbo.HOA_DON AS invoice
        JOIN dbo.CA_LAM_VIEC AS work_shift ON work_shift.MaCa = invoice.MaCa
        JOIN dbo.NHAN_VIEN AS employee ON employee.MaNV = work_shift.MaNV
        LEFT JOIN dbo.KHACH_HANG AS customer ON customer.MaKH = invoice.MaKH
        WHERE (@InvoiceId IS NULL OR CHARINDEX(@InvoiceId, invoice.MaHD) > 0)
          AND (@CashierId IS NULL OR work_shift.MaNV = @CashierId)
          AND (@UtcFrom IS NULL OR invoice.NgayLap >= @UtcFrom)
          AND (@UtcToExclusive IS NULL OR invoice.NgayLap < @UtcToExclusive)
        ORDER BY invoice.NgayLap DESC, invoice.MaHD DESC
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `,
      parameters: {
        CashierId: { type: this.sql.VarChar(10), value: filters.cashierId },
        FromDate: { type: this.sql.Date, value: filters.from },
        InvoiceId: { type: this.sql.VarChar(15), value: filters.invoiceId },
        Offset: { type: this.sql.Int, value: (filters.page - 1) * filters.pageSize },
        PageSize: { type: this.sql.Int, value: filters.pageSize },
        ToDate: { type: this.sql.Date, value: filters.to },
      },
      transaction,
    });
    return {
      items: result.recordset,
      totalItems: Number(result.recordset[0]?.TongSoBanGhi ?? 0),
    };
  }

  async findInvoiceDetail(invoiceId, transaction = null) {
    const result = await this.query({
      text: `
        SELECT
          invoice.MaHD,
          invoice.NgayLap,
          invoice.MaCa,
          work_shift.MaNV,
          employee.HoTen AS TenNhanVien,
          invoice.MaKH,
          customer.HoTen AS TenKhachHang,
          customer.SDT AS SDTKhachHang,
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
        WHERE invoice.MaHD = @InvoiceId;

        WITH ReturnedByLine AS (
          SELECT MaCTHD, SUM(SoLuongDaTra) AS SoLuongDaTra
          FROM dbo.ufn_HOA_DON_PhanBoCoTheTra(@InvoiceId)
          GROUP BY MaCTHD
        )
        SELECT
          detail.MaCTHD,
          detail.MaSP,
          product.TenSP,
          product.MaVach,
          product.DonViTinh,
          detail.SoLuong,
          detail.DonGiaBan,
          detail.TienGiam,
          detail.ThanhTien,
          detail.MaKM,
          promotion.TenKM,
          COALESCE(returned.SoLuongDaTra, 0) AS SoLuongDaTra,
          CASE
            WHEN invoice.TrangThai IN ('PAID', 'REFUNDED')
              THEN detail.SoLuong - COALESCE(returned.SoLuongDaTra, 0)
            ELSE 0
          END AS SoLuongConLaiCoTheTra
        FROM dbo.CHI_TIET_HOA_DON AS detail
        JOIN dbo.HOA_DON AS invoice ON invoice.MaHD = detail.MaHD
        JOIN dbo.SAN_PHAM AS product ON product.MaSP = detail.MaSP
        LEFT JOIN dbo.KHUYEN_MAI AS promotion ON promotion.MaKM = detail.MaKM
        LEFT JOIN ReturnedByLine AS returned ON returned.MaCTHD = detail.MaCTHD
        WHERE detail.MaHD = @InvoiceId
        ORDER BY detail.MaCTHD;

        SELECT
          payment.MaThanhToan,
          payment.PhuongThuc,
          payment.SoTien,
          payment.ThoiGian,
          payment.MaGiaoDichNgoai,
          payment.TrangThai
        FROM dbo.THANH_TOAN AS payment
        WHERE payment.MaHD = @InvoiceId
        ORDER BY payment.ThoiGian, payment.MaThanhToan;

        SELECT
          MaCTHD,
          MaLo,
          SoLo,
          SoLuongXuat,
          SoLuongDaTra,
          SoLuongConLaiCoTheTra
        FROM dbo.ufn_HOA_DON_PhanBoCoTheTra(@InvoiceId)
        ORDER BY MaCTHD, MaLo;

        SELECT
          return_header.MaPT,
          return_header.NgayTra,
          return_header.MaNV,
          employee.HoTen AS TenNhanVien,
          return_header.LyDo,
          return_header.TongTienHoan,
          return_header.TrangThai
        FROM dbo.PHIEU_TRA AS return_header
        JOIN dbo.NHAN_VIEN AS employee ON employee.MaNV = return_header.MaNV
        WHERE return_header.MaHD = @InvoiceId
        ORDER BY return_header.NgayTra DESC, return_header.MaPT DESC;
      `,
      parameters: {
        InvoiceId: { type: this.sql.VarChar(15), value: invoiceId },
      },
      transaction,
    });
    return {
      header: result.recordsets[0]?.[0] ?? null,
      items: result.recordsets[1] ?? [],
      payments: result.recordsets[2] ?? [],
      lotAllocations: result.recordsets[3] ?? [],
      returns: result.recordsets[4] ?? [],
    };
  }
}

module.exports = {
  InvoiceRepository,
};
