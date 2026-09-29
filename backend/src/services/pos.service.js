'use strict';

const { PosRepository } = require('../repositories/pos.repository');
const { AppError } = require('../utils/app-error');
const { normalizeOptionalText, requireString, validationError } = require('../utils/input-validation');
const { getSqlErrorNumber, isUniqueConstraintError } = require('../utils/sql-error');

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_SAFE_MONEY = Number.MAX_SAFE_INTEGER / 100;

function assertCashierIdentity(identity) {
  if (!identity || identity.role !== 'CASHIER' || !identity.employeeId) {
    throw new AppError('You do not have permission to use POS', {
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

function normalizeMoney(value, fieldName) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw validationError(`${fieldName} must be a number greater than or equal to 0`);
  }
  if (value > MAX_SAFE_MONEY) {
    throw validationError(`${fieldName} is too large`);
  }
  if (Math.abs((value * 100) - Math.round(value * 100)) > Number.EPSILON * 100) {
    throw validationError(`${fieldName} must not have more than two decimal places`);
  }
  return value;
}

function escapeLike(value) {
  return value.replace(/~/g, '~~').replace(/%/g, '~%').replace(/_/g, '~_').replace(/\[/g, '~[');
}

function normalizeProductQuery(query = {}) {
  const page = parsePositiveInteger(query.page, 'page', DEFAULT_PAGE, 2_147_483_647);
  const pageSize = parsePositiveInteger(query.pageSize, 'pageSize', DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  if ((page - 1) * pageSize > 2_147_483_647) {
    throw validationError('page is too large for the selected pageSize');
  }
  const search = query.search === undefined || query.search === ''
    ? null
    : requireString(query.search, 'search', { maxLength: 150 });
  return {
    page,
    pageSize,
    search,
    searchPattern: search ? `${escapeLike(search)}%` : null,
  };
}

function dateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function serializeShift(row) {
  if (!row) return null;
  return {
    employee: {
      employeeId: row.MaNV,
      name: row.TenNhanVien ?? null,
    },
    note: row.GhiChu,
    openingCash: Number(row.TienDauCa),
    shiftId: String(row.MaCa),
    startedAt: dateTime(row.GioBatDau),
    status: row.TrangThai,
  };
}

function serializeProduct(row) {
  return {
    availableStock: Number(row.TonKhaDung),
    barcode: row.MaVach,
    category: {
      categoryId: row.MaLoai,
      name: row.TenLoai,
    },
    name: row.TenSP,
    price: Number(row.GiaBan),
    productId: row.MaSP,
    unit: row.DonViTinh,
  };
}

function mapPosError(error) {
  if (error instanceof AppError) return error;
  const errorNumber = getSqlErrorNumber(error);
  if (errorNumber === 51504 || isUniqueConstraintError(error)) {
    return new AppError('The cashier already has an OPEN shift', {
      code: 'SHIFT_ALREADY_OPEN',
      statusCode: 409,
      cause: error,
    });
  }
  if (errorNumber === 51503) {
    return new AppError('The cashier employee or account is no longer active', {
      code: 'CASHIER_UNAVAILABLE',
      statusCode: 403,
      cause: error,
    });
  }
  if ([51501, 51502].includes(errorNumber)) {
    return validationError('Shift opening data is invalid');
  }
  return error;
}

function shiftRequiredError() {
  return new AppError('An OPEN cashier shift is required to use product lookup', {
    code: 'SHIFT_REQUIRED',
    statusCode: 409,
  });
}

class PosService {
  constructor({ posRepository = new PosRepository() } = {}) {
    this.posRepository = posRepository;
  }

  async getCurrentShift(identityInput) {
    const identity = assertCashierIdentity(identityInput);
    const shift = await this.posRepository.findCurrentOpenShift(identity.employeeId);
    return { shift: serializeShift(shift) };
  }

  async openShift(identityInput, input) {
    const identity = assertCashierIdentity(identityInput);
    const shift = {
      employeeId: identity.employeeId,
      note: normalizeOptionalText(input.note, 'note', 255) ?? null,
      openingCash: normalizeMoney(input.openingCash, 'openingCash'),
    };
    try {
      const row = await this.posRepository.openShift(shift);
      return { shift: serializeShift({ ...row, TenNhanVien: identity.displayName ?? null }) };
    } catch (error) {
      throw mapPosError(error);
    }
  }

  async searchProducts(identityInput, query = {}) {
    const identity = assertCashierIdentity(identityInput);
    const filters = normalizeProductQuery(query);
    if (!await this.posRepository.findCurrentOpenShift(identity.employeeId)) {
      throw shiftRequiredError();
    }
    const result = await this.posRepository.searchSellableProducts(filters);
    return {
      items: result.items.map(serializeProduct),
      pagination: {
        page: filters.page,
        pageSize: filters.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / filters.pageSize),
      },
    };
  }

  async getProductByBarcode(identityInput, barcodeInput) {
    const identity = assertCashierIdentity(identityInput);
    const barcode = requireString(barcodeInput, 'barcode', { maxLength: 30 });
    if (!await this.posRepository.findCurrentOpenShift(identity.employeeId)) {
      throw shiftRequiredError();
    }
    const product = await this.posRepository.findSellableProductByBarcode(barcode);
    if (!product) {
      throw new AppError('No sellable product was found for the barcode', {
        code: 'PRODUCT_NOT_SELLABLE',
        statusCode: 404,
      });
    }
    return { product: serializeProduct(product) };
  }
}

module.exports = {
  PosService,
  assertCashierIdentity,
  mapPosError,
  normalizeMoney,
  normalizeProductQuery,
  serializeProduct,
  serializeShift,
};
