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
        WHERE (@InvoiceId IS NULL OR invoice.MaHD = @InvoiceId)
          AND (@CashierId IS NULL OR work_shift.MaNV = @CashierId)
          AND (@FromDate IS NULL OR invoice.NgayLap >= @FromDate)
          AND (@ToDate IS NULL OR invoice.NgayLap < DATEADD(DAY, 1, @ToDate))
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
          SELECT return_line.MaCTHD, SUM(return_line.SoLuongTra) AS SoLuongDaTra
          FROM dbo.CHI_TIET_PHIEU_TRA AS return_line
          JOIN dbo.PHIEU_TRA AS return_header ON return_header.MaPT = return_line.MaPT
          WHERE return_header.MaHD = @InvoiceId
            AND return_header.TrangThai = 'COMPLETED'
          GROUP BY return_line.MaCTHD
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

        WITH ReturnedByLot AS (
          SELECT
            return_line.MaCTHD,
            return_line.MaLo,
            SUM(return_line.SoLuongTra) AS SoLuongDaTra
          FROM dbo.CHI_TIET_PHIEU_TRA AS return_line
          JOIN dbo.PHIEU_TRA AS return_header ON return_header.MaPT = return_line.MaPT
          WHERE return_header.MaHD = @InvoiceId
            AND return_header.TrangThai = 'COMPLETED'
          GROUP BY return_line.MaCTHD, return_line.MaLo
        )
        SELECT
          lot_output.MaCTHD,
          lot_output.MaLo,
          lot.SoLo,
          lot_output.SoLuong AS SoLuongXuat,
          COALESCE(returned.SoLuongDaTra, 0) AS SoLuongDaTra,
          lot_output.SoLuong - COALESCE(returned.SoLuongDaTra, 0) AS SoLuongConLaiCoTheTra
        FROM dbo.CHI_TIET_XUAT_LO AS lot_output
        JOIN dbo.CHI_TIET_HOA_DON AS detail ON detail.MaCTHD = lot_output.MaCTHD
        JOIN dbo.LO_HANG AS lot ON lot.MaLo = lot_output.MaLo
        LEFT JOIN ReturnedByLot AS returned
          ON returned.MaCTHD = lot_output.MaCTHD
         AND returned.MaLo = lot_output.MaLo
        WHERE detail.MaHD = @InvoiceId
        ORDER BY lot_output.MaCTHD, lot_output.MaLo;

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
