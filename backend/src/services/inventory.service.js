'use strict';

const { InventoryRepository } = require('../repositories/inventory.repository');
const { AppError } = require('../utils/app-error');
const { requireString, validationError } = require('../utils/input-validation');
const { getSqlErrorNumber } = require('../utils/sql-error');

const ALLOWED_ROLES = new Set(['WAREHOUSE', 'MANAGER']);
const INVENTORY_MODES = Object.freeze(['ALL', 'LOW_STOCK', 'NEAR_EXPIRY', 'EXPIRED']);
const EXPIRY_STATUSES = Object.freeze(['ALL', 'VALID', 'NEAR_EXPIRY', 'EXPIRED']);
const LOT_STATUSES = Object.freeze(['ACTIVE', 'BLOCKED', 'EXPIRED']);
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_NEAR_EXPIRY_DAYS = 30;
const MAX_PAGE_SIZE = 100;
const MAX_NEAR_EXPIRY_DAYS = 3650;

function assertInventoryIdentity(identity) {
  if (!identity || !ALLOWED_ROLES.has(identity.role)) {
    throw new AppError('You do not have permission to view inventory', {
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

function parseNonNegativeInteger(value, fieldName, fallback, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw validationError(`${fieldName} must be a non-negative integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
    throw validationError(`${fieldName} must be between 0 and ${maximum}`);
  }
  return parsed;
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

function normalizeOptionalString(value, fieldName, maxLength) {
  if (value === undefined || value === null || value === '') return null;
  return requireString(value, fieldName, { maxLength });
}

function normalizeEnum(value, fieldName, allowedValues, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = requireString(value, fieldName, { maxLength: 20 }).toUpperCase();
  if (!allowedValues.includes(normalized)) {
    throw validationError(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
  }
  return normalized;
}

function normalizePagination(query) {
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
  return { page, pageSize };
}

function normalizeSharedFilters(query) {
  return {
    ...normalizePagination(query),
    categoryId: normalizeOptionalString(query.categoryId, 'categoryId', 10),
    nearExpiryDays: parseNonNegativeInteger(
      query.nearExpiryDays,
      'nearExpiryDays',
      DEFAULT_NEAR_EXPIRY_DAYS,
      MAX_NEAR_EXPIRY_DAYS,
    ),
    referenceDate: normalizeDateOnly(query.referenceDate, 'referenceDate'),
    search: normalizeOptionalString(query.search, 'search', 150),
  };
}

function normalizeProductQuery(query = {}) {
  return {
    ...normalizeSharedFilters(query),
    mode: normalizeEnum(query.mode, 'mode', INVENTORY_MODES, 'ALL'),
  };
}

function normalizeLotQuery(query = {}) {
  return {
    ...normalizeSharedFilters(query),
    expiryStatus: normalizeEnum(
      query.expiryStatus,
      'expiryStatus',
      EXPIRY_STATUSES,
      'ALL',
    ),
    lotStatus: normalizeEnum(query.lotStatus, 'lotStatus', LOT_STATUSES),
    productId: normalizeOptionalString(query.productId, 'productId', 10),
  };
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function serializeProduct(row) {
  const lowStock = Boolean(row.CanhBaoTonThap);
  const nearExpiry = Number(row.SoLoCanHan) > 0;
  const expired = Number(row.SoLoHetHan) > 0;
  return {
    alerts: { expired, lowStock, nearExpiry },
    availableStock: Number(row.TongTonKhaDung),
    blockedStock: Number(row.TongTonBiKhoa),
    category: {
      categoryId: row.MaLoai,
      name: row.TenLoai,
    },
    expiredLotCount: Number(row.SoLoHetHan),
    expiredStock: Number(row.TongTonHetHan),
    lotCount: Number(row.SoLoConTon),
    minimumStock: Number(row.MucTonToiThieu),
    name: row.TenSP,
    nearExpiryLotCount: Number(row.SoLoCanHan),
    nearExpiryStock: Number(row.TongTonCanHan),
    productId: row.MaSP,
    status: row.TrangThaiSanPham,
    totalStock: Number(row.TongTon),
    unit: row.DonViTinh,
  };
}

function serializeLot(row) {
  return {
    daysUntilExpiry: row.SoNgayConLai === null ? null : Number(row.SoNgayConLai),
    expiryDate: dateOnly(row.HanSuDung),
    expiryStatus: row.TinhTrangHanDung,
    lotId: row.MaLo,
    lotStatus: row.TrangThaiLo,
    manufactureDate: dateOnly(row.NgaySanXuat),
    manufacturerLot: row.SoLo,
    product: {
      category: {
        categoryId: row.MaLoai,
        name: row.TenLoai,
      },
      name: row.TenSP,
      productId: row.MaSP,
      unit: row.DonViTinh,
    },
    quantity: Number(row.SoLuongTon),
  };
}

function paginationResult(items, filters, totalItems) {
  return {
    items,
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / filters.pageSize),
    },
  };
}

function mapInventoryError(error) {
  if (error instanceof AppError) return error;
  const errorNumber = getSqlErrorNumber(error);
  if ([51414, 51426].includes(errorNumber)) {
    return new AppError('Inventory category was not found', {
      code: 'CATEGORY_NOT_FOUND',
      statusCode: 404,
      cause: error,
    });
  }
  if (errorNumber === 51425) {
    return new AppError('Inventory product was not found', {
      code: 'PRODUCT_NOT_FOUND',
      statusCode: 404,
      cause: error,
    });
  }
  if (Number.isInteger(errorNumber) && errorNumber >= 51410 && errorNumber <= 51427) {
    return validationError('Inventory query parameters are invalid');
  }
  return error;
}

class InventoryService {
  constructor({ inventoryRepository = new InventoryRepository() } = {}) {
    this.inventoryRepository = inventoryRepository;
  }

  async listProducts(identity, query = {}) {
    assertInventoryIdentity(identity);
    const filters = normalizeProductQuery(query);
    try {
      const result = await this.inventoryRepository.listProducts(filters);
      return paginationResult(
        result.items.map(serializeProduct),
        filters,
        result.totalItems,
      );
    } catch (error) {
      throw mapInventoryError(error);
    }
  }

  async listLots(identity, query = {}) {
    assertInventoryIdentity(identity);
    const filters = normalizeLotQuery(query);
    try {
      const result = await this.inventoryRepository.listLots(filters);
      return paginationResult(
        result.items.map(serializeLot),
        filters,
        result.totalItems,
      );
    } catch (error) {
      throw mapInventoryError(error);
    }
  }
}

module.exports = {
  InventoryService,
  assertInventoryIdentity,
  mapInventoryError,
  normalizeLotQuery,
  normalizeProductQuery,
  serializeLot,
  serializeProduct,
};
