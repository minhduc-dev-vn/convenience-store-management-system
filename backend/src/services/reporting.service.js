'use strict';

const { ReportingRepository } = require('../repositories/reporting.repository');
const { AppError } = require('../utils/app-error');
const { validationError } = require('../utils/input-validation');
const { getSqlErrorNumber } = require('../utils/sql-error');

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_RANKING_LIMIT = 10;
const MAX_PAGE_SIZE = 100;
const MAX_RANKING_LIMIT = 100;

function assertManager(identity) {
  if (!identity || identity.role !== 'MANAGER') {
    throw new AppError('This operation requires the MANAGER role', {
      code: 'FORBIDDEN',
      statusCode: 403,
    });
  }
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

function normalizeDate(value, fieldName) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError(`${fieldName} is required and must use YYYY-MM-DD format`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1
      || parsed.getUTCDate() !== day) {
    throw validationError(`${fieldName} must be a valid calendar date`);
  }
  return value;
}

function normalizeDateRange(query = {}) {
  const from = normalizeDate(query.from, 'from');
  const to = normalizeDate(query.to, 'to');
  if (from > to) throw validationError('from must not be after to');
  return { from, to };
}

function normalizePagination(query = {}) {
  const page = parsePositiveInteger(query.page, 'page', DEFAULT_PAGE, 2_147_483_647);
  const pageSize = parsePositiveInteger(
    query.pageSize,
    'pageSize',
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
  );
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset > 2_147_483_647) {
    throw validationError('page is too large for the selected pageSize');
  }
  return { offset, page, pageSize };
}

function dateOnly(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function timestamp(value) {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function pagination(filters, totalItems) {
  return {
    page: filters.page,
    pageSize: filters.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / filters.pageSize),
  };
}

function serializeRevenue(row = {}) {
  return {
    from: dateOnly(row.TuNgay),
    to: dateOnly(row.DenNgay),
    completedInvoiceCount: Number(row.SoHoaDonHoanTat ?? 0),
    grossRevenue: Number(row.DoanhThuGop ?? 0),
    refundAmount: Number(row.TienHoanTra ?? 0),
    netRevenue: Number(row.DoanhThuThuan ?? 0),
  };
}

function serializeCategory(row) {
  return {
    categoryId: row.MaLoai,
    name: row.TenLoai,
    soldQuantity: Number(row.SoLuongBan),
    returnedQuantity: Number(row.SoLuongTra),
    netSoldQuantity: Number(row.SoLuongBanThuan),
    grossRevenue: Number(row.DoanhThuGop),
    refundAmount: Number(row.TienHoanTra),
    netRevenue: Number(row.DoanhThuThuan),
    netRevenueSharePercent: Number(row.TyTrongDoanhThuThuan),
  };
}

function serializeProduct(row) {
  return {
    rank: Number(row.XepHang),
    productId: row.MaSP,
    name: row.TenSP,
    category: { categoryId: row.MaLoai, name: row.TenLoai },
    unit: row.DonViTinh,
    status: row.TrangThaiSanPham,
    soldQuantity: Number(row.SoLuongBan),
    returnedQuantity: Number(row.SoLuongTra),
    netSoldQuantity: Number(row.SoLuongBanThuan),
    grossRevenue: Number(row.DoanhThuGop),
    refundAmount: Number(row.TienHoanTra),
    netRevenue: Number(row.DoanhThuThuan),
    currentStock: Number(row.TongTon),
  };
}

function serializeInventory(row) {
  return {
    productId: row.MaSP,
    name: row.TenSP,
    unit: row.DonViTinh,
    category: { categoryId: row.MaLoai, name: row.TenLoai },
    minimumStock: Number(row.MucTonToiThieu),
    status: row.TrangThaiSanPham,
    totalStock: Number(row.TongTon),
    sellableStock: Number(row.TonCoTheBan),
    blockedStock: Number(row.TonBiKhoa),
    expiredStock: Number(row.TonHetHan),
    inventoryCostValue: Number(row.GiaTriTonTheoGiaNhap),
    stockedLotCount: Number(row.SoLoConTon),
  };
}

function serializeReceivingSummary(row = {}) {
  return {
    from: dateOnly(row.TuNgay),
    to: dateOnly(row.DenNgay),
    confirmedReceiptCount: Number(row.SoPhieuNhap ?? 0),
    supplierCount: Number(row.SoNhaCungCap ?? 0),
    receivedQuantity: Number(row.TongSoLuongNhap ?? 0),
    receivingCost: Number(row.TongChiPhiNhap ?? 0),
  };
}

function serializeEmployee(row) {
  return {
    employeeId: row.MaNV,
    name: row.TenNhanVien,
    openedShiftCount: Number(row.SoCaDaMo),
    completedInvoiceCount: Number(row.SoHoaDonHoanTat),
    grossRevenue: Number(row.DoanhThuGop),
    refundAmount: Number(row.TienHoanTra),
    netRevenue: Number(row.DoanhThuThuan),
  };
}

function mapReportingError(error) {
  if (error instanceof AppError) return error;
  const number = getSqlErrorNumber(error);
  if ([51910, 51911, 51912].includes(number)) {
    return validationError('Report query parameters are invalid');
  }
  return error;
}

class ReportingService {
  constructor({ reportingRepository = new ReportingRepository() } = {}) {
    this.reportingRepository = reportingRepository;
  }

  async run(identity, operation) {
    assertManager(identity);
    try {
      return await operation();
    } catch (error) {
      throw mapReportingError(error);
    }
  }

  async getRevenue(identity, query = {}) {
    const filters = normalizeDateRange(query);
    return this.run(identity, async () => {
      const result = await this.reportingRepository.getRevenue(filters);
      return {
        summary: serializeRevenue(result.summary),
        trend: result.trend.map((row) => ({
          date: dateOnly(row.Ngay),
          completedInvoiceCount: Number(row.SoHoaDonHoanTat),
          grossRevenue: Number(row.DoanhThuGop),
          refundAmount: Number(row.TienHoanTra),
          netRevenue: Number(row.DoanhThuThuan),
        })),
      };
    });
  }

  async getProducts(identity, query = {}) {
    const filters = {
      ...normalizeDateRange(query),
      limit: parsePositiveInteger(query.limit, 'limit', DEFAULT_RANKING_LIMIT, MAX_RANKING_LIMIT),
    };
    return this.run(identity, async () => {
      const result = await this.reportingRepository.getProducts(filters);
      return {
        categories: result.categories.map(serializeCategory),
        bestProducts: result.bestProducts.map(serializeProduct),
        slowProducts: result.slowProducts.map(serializeProduct),
      };
    });
  }

  async getInventory(identity, query = {}) {
    const filters = normalizePagination(query);
    return this.run(identity, async () => {
      const result = await this.reportingRepository.getInventory(filters);
      const row = result.summary ?? {};
      const totalItems = Number(row.TongSoSanPham ?? 0);
      return {
        summary: {
          productCount: totalItems,
          totalStock: Number(row.TongTon ?? 0),
          sellableStock: Number(row.TongTonCoTheBan ?? 0),
          blockedStock: Number(row.TongTonBiKhoa ?? 0),
          expiredStock: Number(row.TongTonHetHan ?? 0),
          inventoryCostValue: Number(row.TongGiaTriTonTheoGiaNhap ?? 0),
          stockedLotCount: Number(row.TongSoLoConTon ?? 0),
        },
        items: result.items.map(serializeInventory),
        pagination: pagination(filters, totalItems),
      };
    });
  }

  async getReceiving(identity, query = {}) {
    const filters = { ...normalizeDateRange(query), ...normalizePagination(query) };
    return this.run(identity, async () => {
      const result = await this.reportingRepository.getReceiving(filters);
      return {
        summary: serializeReceivingSummary(result.summary),
        suppliers: {
          items: result.items.map((row) => ({
            supplierId: row.MaNCC,
            name: row.TenNCC,
            confirmedReceiptCount: Number(row.SoPhieuNhap),
            receivedQuantity: Number(row.TongSoLuongNhap),
            receivingCost: Number(row.TongChiPhiNhap),
          })),
          pagination: pagination(filters, result.totalItems),
        },
      };
    });
  }

  async getEmployees(identity, query = {}) {
    const filters = { ...normalizeDateRange(query), ...normalizePagination(query) };
    return this.run(identity, async () => {
      const result = await this.reportingRepository.getEmployees(filters);
      return {
        items: result.items.map(serializeEmployee),
        pagination: pagination(filters, result.totalItems),
      };
    });
  }

  async getShifts(identity, query = {}) {
    const filters = { ...normalizeDateRange(query), ...normalizePagination(query) };
    return this.run(identity, async () => {
      const result = await this.reportingRepository.getShifts(filters);
      return {
        items: result.items.map((row) => ({
          shiftId: Number(row.MaCa),
          employee: { employeeId: row.MaNV, name: row.TenNhanVien },
          openedAt: timestamp(row.GioBatDau),
          closedAt: timestamp(row.GioKetThuc),
          openingCash: Number(row.TienDauCa),
          closingCash: row.TienCuoiCa == null ? null : Number(row.TienCuoiCa),
          status: row.TrangThai,
          completedInvoiceCount: Number(row.SoHoaDonHoanTat),
          grossRevenue: Number(row.DoanhThuGop),
          refundAmount: Number(row.TienHoanTra),
          netRevenue: Number(row.DoanhThuThuan),
          recordedCashRevenue: Number(row.DoanhThuTienMatGhiNhan),
          cashDifference: row.ChenhLechTienMat == null ? null : Number(row.ChenhLechTienMat),
        })),
        pagination: pagination(filters, result.totalItems),
      };
    });
  }
}

module.exports = {
  ReportingService,
  assertManager,
  mapReportingError,
  normalizeDateRange,
  normalizePagination,
};
