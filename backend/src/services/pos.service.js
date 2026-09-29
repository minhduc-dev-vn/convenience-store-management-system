'use strict';

const { PosRepository } = require('../repositories/pos.repository');
const { PromotionService, normalizeCartItems } = require('./promotion.service');
const { AppError } = require('../utils/app-error');
const {
  normalizeOptionalText,
  normalizePhone,
  requireString,
  validationError,
} = require('../utils/input-validation');
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
  return new AppError('An OPEN cashier shift is required to use POS', {
    code: 'SHIFT_REQUIRED',
    statusCode: 409,
  });
}

function normalizeQuoteInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('Quote input must be an object');
  }
  const allowedFields = new Set(['customerPhone', 'items', 'promotionId']);
  const unknownField = Object.keys(input).find((field) => !allowedFields.has(field));
  if (unknownField) throw validationError(`Unsupported quote field: ${unknownField}`);
  return {
    customerPhone: input.customerPhone === undefined
      || input.customerPhone === null
      || input.customerPhone === ''
      ? null
      : normalizePhone(input.customerPhone),
    items: normalizeCartItems(input.items),
    promotionId: input.promotionId === undefined
      || input.promotionId === null
      || input.promotionId === ''
      ? null
      : requireString(input.promotionId, 'promotionId', { maxLength: 12 }),
  };
}

function moneyToCents(value, fieldName, { internal = false } = {}) {
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  if (
    !Number.isFinite(amount)
    || amount < 0
    || !Number.isSafeInteger(cents)
    || Math.abs(amount * 100 - cents) > Number.EPSILON * 100
  ) {
    if (internal) {
      throw new AppError(`The server returned an invalid ${fieldName}`, {
        code: 'QUOTE_DATA_INVALID',
        statusCode: 500,
      });
    }
    throw validationError(`${fieldName} must be a valid money amount`);
  }
  return cents;
}

function centsToMoney(cents) {
  return cents / 100;
}

function quoteChangedError() {
  return new AppError('Product or promotion data changed while the quote was calculated; retry', {
    code: 'QUOTE_CHANGED_RETRY',
    statusCode: 409,
  });
}

function buildPricedItems(items, rows) {
  const rowMap = new Map(rows.map((row) => [row.MaSP, row]));
  if (rowMap.size !== items.length) {
    throw new AppError('One or more products were not found', {
      code: 'PRODUCT_NOT_FOUND',
      statusCode: 404,
    });
  }
  let subtotalCents = 0;
  const pricedItems = items.map((item) => {
    const row = rowMap.get(item.productId);
    if (!row) {
      throw new AppError('One or more products were not found', {
        code: 'PRODUCT_NOT_FOUND',
        statusCode: 404,
      });
    }
    if (row.TrangThaiSanPham !== 'ACTIVE' || row.TrangThaiLoai !== 'ACTIVE') {
      throw new AppError(`${item.productId} is not currently available for sale`, {
        code: 'PRODUCT_NOT_AVAILABLE',
        statusCode: 400,
      });
    }
    const availableStock = Number(row.TonKhaDung);
    if (!Number.isSafeInteger(availableStock) || availableStock < 0) {
      throw new AppError('The server returned invalid available stock', {
        code: 'QUOTE_DATA_INVALID',
        statusCode: 500,
      });
    }
    if (item.quantity > availableStock) {
      throw new AppError(`Insufficient sellable stock for ${item.productId}`, {
        code: 'INSUFFICIENT_STOCK',
        statusCode: 409,
      });
    }
    const unitPriceCents = moneyToCents(row.GiaBan, 'product price', { internal: true });
    if (unitPriceCents <= 0) {
      throw new AppError('A product has an invalid current price', {
        code: 'PRODUCT_PRICE_INVALID',
        statusCode: 500,
      });
    }
    const lineSubtotalCents = unitPriceCents * item.quantity;
    if (!Number.isSafeInteger(lineSubtotalCents)) {
      throw validationError('The calculated line subtotal is too large');
    }
    subtotalCents += lineSubtotalCents;
    if (!Number.isSafeInteger(subtotalCents)) {
      throw validationError('The calculated quote subtotal is too large');
    }
    return {
      availableStock,
      barcode: row.MaVach,
      lineSubtotalCents,
      name: row.TenSP,
      productId: row.MaSP,
      quantity: item.quantity,
      unit: row.DonViTinh,
      unitPriceCents,
    };
  });
  return { pricedItems, subtotalCents };
}

function allocatePromotionDiscount(pricedItems, evaluation, subtotalCents) {
  const allocations = new Map(pricedItems.map((item) => [item.productId, 0]));
  if (!evaluation || !evaluation.eligible) return allocations;
  const discountCents = moneyToCents(
    evaluation.discountAmount,
    'promotion discount',
    { internal: true },
  );
  const evaluatedSubtotalCents = moneyToCents(
    evaluation.orderSubtotal,
    'promotion order subtotal',
    { internal: true },
  );
  if (evaluatedSubtotalCents !== subtotalCents || discountCents > subtotalCents) {
    throw quoteChangedError();
  }
  if (discountCents === 0) return allocations;

  const qualifyingIds = new Set(evaluation.qualifyingItems.map((item) => item.productId));
  const qualifying = pricedItems.filter((item) => qualifyingIds.has(item.productId));
  const eligibleSubtotalCents = qualifying.reduce(
    (total, item) => total + item.lineSubtotalCents,
    0,
  );
  const evaluatedEligibleCents = moneyToCents(
    evaluation.eligibleSubtotal,
    'promotion eligible subtotal',
    { internal: true },
  );
  if (eligibleSubtotalCents <= 0 || eligibleSubtotalCents !== evaluatedEligibleCents) {
    throw quoteChangedError();
  }

  let allocatedCents = 0;
  const shares = qualifying.map((item) => {
    const numerator = BigInt(discountCents) * BigInt(item.lineSubtotalCents);
    const denominator = BigInt(eligibleSubtotalCents);
    const baseCents = Number(numerator / denominator);
    allocatedCents += baseCents;
    return {
      baseCents,
      productId: item.productId,
      remainder: numerator % denominator,
    };
  });
  shares.sort((left, right) => {
    if (left.remainder > right.remainder) return -1;
    if (left.remainder < right.remainder) return 1;
    return left.productId.localeCompare(right.productId);
  });
  let remainingCents = discountCents - allocatedCents;
  for (const share of shares) {
    const extraCent = remainingCents > 0 ? 1 : 0;
    allocations.set(share.productId, share.baseCents + extraCent);
    remainingCents -= extraCent;
  }
  if (remainingCents !== 0) throw quoteChangedError();
  return allocations;
}

function serializeCustomer(row) {
  if (!row) return { customer: null, loyalty: null };
  return {
    customer: {
      customerId: row.MaKH,
      name: row.HoTen,
      phone: row.SDT,
    },
    loyalty: {
      currentPoints: Number(row.DiemTichLuy),
      membershipTier: row.HangThanhVien,
    },
  };
}

function serializePromotionPreview(evaluation) {
  if (!evaluation) return null;
  return {
    discountAmount: evaluation.eligible ? Number(evaluation.discountAmount) : 0,
    eligible: evaluation.eligible,
    eligibleSubtotal: Number(evaluation.eligibleSubtotal),
    evaluatedAt: evaluation.evaluatedAt,
    maximumDiscount: evaluation.maximumDiscount,
    minimumOrderValue: evaluation.minimumOrderValue,
    name: evaluation.name,
    promotionId: evaluation.promotionId,
    reason: evaluation.reason,
    type: evaluation.type,
    value: evaluation.value,
  };
}

class PosService {
  constructor({
    posRepository = new PosRepository(),
    promotionService = new PromotionService(),
  } = {}) {
    this.posRepository = posRepository;
    this.promotionService = promotionService;
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

  async calculateQuote(identityInput, input) {
    const identity = assertCashierIdentity(identityInput);
    const quoteInput = normalizeQuoteInput(input);
    const shift = await this.posRepository.findCurrentOpenShift(identity.employeeId);
    if (!shift) throw shiftRequiredError();

    const productIds = quoteInput.items.map((item) => item.productId);
    const [productRows, customerRow] = await Promise.all([
      this.posRepository.findQuoteProducts(productIds),
      quoteInput.customerPhone
        ? this.posRepository.findActiveCustomerByPhone(quoteInput.customerPhone)
        : Promise.resolve(null),
    ]);
    if (quoteInput.customerPhone && !customerRow) {
      throw new AppError('The active customer member was not found', {
        code: 'CUSTOMER_MEMBER_NOT_FOUND',
        statusCode: 404,
      });
    }

    const { pricedItems, subtotalCents } = buildPricedItems(quoteInput.items, productRows);
    const evaluation = quoteInput.promotionId
      ? await this.promotionService.evaluatePromotion({
        items: quoteInput.items,
        promotionId: quoteInput.promotionId,
      })
      : null;
    const allocations = allocatePromotionDiscount(pricedItems, evaluation, subtotalCents);
    const promotionDiscountCents = [...allocations.values()].reduce(
      (total, value) => total + value,
      0,
    );
    const totalCents = subtotalCents - promotionDiscountCents;
    const customerData = serializeCustomer(customerRow);
    if (customerData.loyalty) {
      customerData.loyalty.pointsEarnedPreview = Math.floor(centsToMoney(totalCents) / 10000);
    }

    return {
      ...customerData,
      items: pricedItems.map((item) => {
        const discountCents = allocations.get(item.productId) ?? 0;
        return {
          availableStock: item.availableStock,
          barcode: item.barcode,
          discountAmount: centsToMoney(discountCents),
          lineSubtotal: centsToMoney(item.lineSubtotalCents),
          lineTotal: centsToMoney(item.lineSubtotalCents - discountCents),
          name: item.name,
          productId: item.productId,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: centsToMoney(item.unitPriceCents),
        };
      }),
      promotion: serializePromotionPreview(evaluation),
      shift: {
        shiftId: String(shift.MaCa),
        status: shift.TrangThai,
      },
      totals: {
        promotionDiscount: centsToMoney(promotionDiscountCents),
        subtotal: centsToMoney(subtotalCents),
        totalAmount: centsToMoney(totalCents),
        totalDiscount: centsToMoney(promotionDiscountCents),
      },
    };
  }
}

module.exports = {
  PosService,
  assertCashierIdentity,
  allocatePromotionDiscount,
  buildPricedItems,
  mapPosError,
  normalizeMoney,
  normalizeProductQuery,
  normalizeQuoteInput,
  serializeProduct,
  serializeShift,
};
