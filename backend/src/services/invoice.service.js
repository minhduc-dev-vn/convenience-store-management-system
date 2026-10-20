'use strict';

const { InvoiceRepository } = require('../repositories/invoice.repository');
const { AppError } = require('../utils/app-error');
const { requireString, validationError } = require('../utils/input-validation');

const ALLOWED_ROLES = new Set(['CASHIER', 'MANAGER']);
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function assertInvoiceViewerIdentity(identity) {
  if (!identity || !ALLOWED_ROLES.has(identity.role) || !identity.employeeId) {
    throw new AppError('You do not have permission to view invoices', {
      code: 'FORBIDDEN',
      statusCode: 403,
    });
  }
  return identity;
}

function parsePositiveInteger(value, fieldName, fallback, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw validationError(`${fieldName} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw validationError(`${fieldName} must be between 1 and ${maximum}`);
  }
  return parsed;
}

function normalizeOptionalString(value, fieldName, maxLength) {
  if (value === undefined || value === null || value === '') return null;
  return requireString(value, fieldName, { maxLength });
}

function normalizeDateOnly(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError(`${fieldName} must use YYYY-MM-DD format`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year
      || date.getUTCMonth() !== month - 1
      || date.getUTCDate() !== day) {
    throw validationError(`${fieldName} must be a valid calendar date`);
  }
  return value;
}

function normalizeInvoiceQuery(query = {}) {
  const page = parsePositiveInteger(query.page, 'page', DEFAULT_PAGE, 2_147_483_647);
  const pageSize = parsePositiveInteger(
    query.pageSize,
    'pageSize',
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
  );
  if ((page - 1) * pageSize > 2_147_483_647) {
    throw validationError('page is too large for the selected pageSize');
  }
  const from = normalizeDateOnly(query.from, 'from');
  const to = normalizeDateOnly(query.to, 'to');
  if (from && to && from > to) {
    throw validationError('from must be before or equal to to');
  }
  return {
    cashierId: normalizeOptionalString(query.cashierId, 'cashierId', 10),
    from,
    invoiceId: normalizeOptionalString(query.invoiceId, 'invoiceId', 15),
    page,
    pageSize,
    to,
  };
}

function dateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function serializeInvoiceSummary(row) {
  return {
    cashier: {
      employeeId: row.MaNV,
      name: row.TenNhanVien,
    },
    customer: row.MaKH ? {
      customerId: row.MaKH,
      name: row.TenKhachHang,
      phone: row.SDTKhachHang,
    } : null,
    invoiceId: row.MaHD,
    issuedAt: dateTime(row.NgayLap),
    shiftId: String(row.MaCa),
    status: row.TrangThai,
    totals: {
      subtotal: Number(row.TongTienHang),
      totalAmount: Number(row.TongThanhToan),
      totalDiscount: Number(row.TongGiamGia),
    },
  };
}

function serializeInvoiceDetail(result) {
  if (!result.header) return null;
  const allocationsByLine = new Map();
  for (const allocation of result.lotAllocations) {
    const lineId = String(allocation.MaCTHD);
    const allocations = allocationsByLine.get(lineId) ?? [];
    allocations.push({
      lotId: allocation.MaLo,
      manufacturerLot: allocation.SoLo,
      quantityReturned: Number(allocation.SoLuongDaTra),
      quantityReturnable: Number(allocation.SoLuongConLaiCoTheTra),
      quantitySold: Number(allocation.SoLuongXuat),
    });
    allocationsByLine.set(lineId, allocations);
  }
  return {
    ...serializeInvoiceSummary(result.header),
    items: result.items.map((item) => ({
      barcode: item.MaVach,
      discountAmount: Number(item.TienGiam),
      lineId: String(item.MaCTHD),
      lineTotal: Number(item.ThanhTien),
      lotAllocations: allocationsByLine.get(String(item.MaCTHD)) ?? [],
      name: item.TenSP,
      productId: item.MaSP,
      promotion: item.MaKM ? { name: item.TenKM, promotionId: item.MaKM } : null,
      quantity: Number(item.SoLuong),
      quantityReturned: Number(item.SoLuongDaTra),
      quantityReturnable: Number(item.SoLuongConLaiCoTheTra),
      unit: item.DonViTinh,
      unitPrice: Number(item.DonGiaBan),
    })),
    loyalty: result.header.MaKH ? {
      pointsEarned: Number(result.header.DiemTichLuy),
      pointsUsed: Number(result.header.DiemSuDung),
    } : null,
    note: result.header.GhiChu,
    payments: result.payments.map((payment) => ({
      amount: Number(payment.SoTien),
      externalTransactionId: payment.MaGiaoDichNgoai,
      method: payment.PhuongThuc,
      paidAt: dateTime(payment.ThoiGian),
      paymentId: String(payment.MaThanhToan),
      status: payment.TrangThai,
    })),
    returns: result.returns.map((returnHeader) => ({
      employee: {
        employeeId: returnHeader.MaNV,
        name: returnHeader.TenNhanVien,
      },
      reason: returnHeader.LyDo,
      refundAmount: Number(returnHeader.TongTienHoan),
      returnId: returnHeader.MaPT,
      returnedAt: dateTime(returnHeader.NgayTra),
      status: returnHeader.TrangThai,
    })),
  };
}

class InvoiceService {
  constructor({ invoiceRepository = new InvoiceRepository() } = {}) {
    this.invoiceRepository = invoiceRepository;
  }

  async listInvoices(identityInput, query = {}) {
    assertInvoiceViewerIdentity(identityInput);
    const filters = normalizeInvoiceQuery(query);
    const result = await this.invoiceRepository.listInvoices(filters);
    return {
      items: result.items.map(serializeInvoiceSummary),
      pagination: {
        page: filters.page,
        pageSize: filters.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / filters.pageSize),
      },
    };
  }

  async getInvoice(identityInput, invoiceIdInput) {
    assertInvoiceViewerIdentity(identityInput);
    const invoiceId = requireString(invoiceIdInput, 'invoiceId', { maxLength: 15 });
    const invoice = serializeInvoiceDetail(
      await this.invoiceRepository.findInvoiceDetail(invoiceId),
    );
    if (!invoice) {
      throw new AppError('The invoice was not found', {
        code: 'INVOICE_NOT_FOUND',
        statusCode: 404,
      });
    }
    return { invoice };
  }
}

module.exports = {
  InvoiceService,
  assertInvoiceViewerIdentity,
  normalizeInvoiceQuery,
  serializeInvoiceDetail,
  serializeInvoiceSummary,
};
