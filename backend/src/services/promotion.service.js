'use strict';

const { PromotionRepository } = require('../repositories/promotion.repository');
const { AppError } = require('../utils/app-error');
const { requireString, validationError } = require('../utils/input-validation');
const { isUniqueConstraintError } = require('../utils/sql-error');
const { withTransaction } = require('../utils/transaction');

const PROMOTION_TYPES = Object.freeze(['PERCENT', 'AMOUNT']);
const PROMOTION_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE']);
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_PRODUCTS = 100;

function parsePositiveInteger(value, fieldName, fallback, maximum = Number.MAX_SAFE_INTEGER) {
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

function normalizeEnum(value, fieldName, allowed, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const normalized = requireString(value, fieldName, { maxLength: 20 }).toUpperCase();
  if (!allowed.includes(normalized)) {
    throw validationError(`${fieldName} must be one of: ${allowed.join(', ')}`);
  }
  return normalized;
}

function normalizeId(value, fieldName, maxLength) {
  return requireString(value, fieldName, { maxLength });
}

function normalizeMoney(value, fieldName, { allowNull = false, minimum = 0 } = {}) {
  if (allowNull && value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw validationError(`${fieldName} must be a number greater than or equal to ${minimum}`);
  }
  if (value > Number.MAX_SAFE_INTEGER / 100) {
    throw validationError(`${fieldName} is too large`);
  }
  if (Math.abs((value * 100) - Math.round(value * 100)) > Number.EPSILON * 100) {
    throw validationError(`${fieldName} must not have more than two decimal places`);
  }
  return value;
}

function normalizePositiveMoney(value, fieldName, options = {}) {
  if (options.allowNull && value === null) return null;
  const normalized = normalizeMoney(value, fieldName, { minimum: 0 });
  if (normalized <= 0) throw validationError(`${fieldName} must be greater than 0`);
  return normalized;
}

function normalizeDateTime(value, fieldName) {
  const isoDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (typeof value !== 'string' || !isoDateTimePattern.test(value.trim())) {
    throw validationError(`${fieldName} must be an ISO 8601 date-time string`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw validationError(`${fieldName} must be a valid ISO 8601 date-time`);
  }
  return new Date(Math.floor(parsed.getTime() / 1000) * 1000);
}

function normalizeProductIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PRODUCTS) {
    throw validationError(`productIds must contain between 1 and ${MAX_PRODUCTS} products`);
  }
  const normalized = value.map((productId, index) => (
    normalizeId(productId, `productIds[${index}]`, 10)
  ));
  if (new Set(normalized).size !== normalized.length) {
    throw validationError('productIds must not contain duplicates');
  }
  return normalized;
}

function normalizeCartItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_PRODUCTS) {
    throw validationError(`items must contain between 1 and ${MAX_PRODUCTS} products`);
  }
  const normalized = items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw validationError(`items[${index}] must be an object`);
    }
    const unknownField = Object.keys(item).find((field) => !['productId', 'quantity'].includes(field));
    if (unknownField) {
      throw validationError(`Unsupported items[${index}] field: ${unknownField}`);
    }
    const productId = normalizeId(item.productId, `items[${index}].productId`, 10);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 1_000_000) {
      throw validationError(`items[${index}].quantity must be an integer between 1 and 1000000`);
    }
    return { productId, quantity: item.quantity };
  });
  if (new Set(normalized.map((item) => item.productId)).size !== normalized.length) {
    throw validationError('items must not contain duplicate productId values');
  }
  return normalized;
}

function escapeLike(value) {
  return value.replace(/~/g, '~~').replace(/%/g, '~%').replace(/_/g, '~_').replace(/\[/g, '~[');
}

function normalizeListQuery(query = {}) {
  const page = parsePositiveInteger(query.page, 'page', DEFAULT_PAGE, 2_147_483_647);
  const pageSize = parsePositiveInteger(query.pageSize, 'pageSize', DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  if ((page - 1) * pageSize > 2_147_483_647) {
    throw validationError('page is too large for the selected pageSize');
  }
  const search = query.search === undefined
    ? null
    : requireString(query.search, 'search', { maxLength: 150 });
  return {
    page,
    pageSize,
    search,
    searchPattern: search ? `${escapeLike(search)}%` : null,
    status: normalizeEnum(query.status, 'status', PROMOTION_STATUSES, { optional: true }),
    type: normalizeEnum(query.type, 'type', PROMOTION_TYPES, { optional: true }),
  };
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toIso(value) {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function serializeProduct(row, { publicOnly = false } = {}) {
  const product = { name: row.TenSP, productId: row.MaSP };
  if (!publicOnly) product.status = row.TrangThai;
  return product;
}

function serializePromotion(row, products = [], { publicOnly = false } = {}) {
  const promotion = {
    endAt: toIso(row.NgayKetThuc),
    maximumDiscount: row.MucGiamToiDa == null ? null : Number(row.MucGiamToiDa),
    minimumOrderValue: Number(row.GiaTriDonToiThieu),
    name: row.TenKM,
    products: products.map((product) => serializeProduct(product, { publicOnly })),
    promotionId: row.MaKM,
    startAt: toIso(row.NgayBatDau),
    type: row.LoaiKM,
    value: Number(row.GiaTri),
  };
  if (!publicOnly) {
    promotion.productCount = Number(row.SoSanPhamApDung ?? products.length);
    promotion.status = row.TrangThai;
  }
  return promotion;
}

function groupPublicRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.MaKM)) grouped.set(row.MaKM, { promotion: row, products: [] });
    grouped.get(row.MaKM).products.push(row);
  }
  return [...grouped.values()].map(({ promotion, products }) => (
    serializePromotion(promotion, products, { publicOnly: true })
  ));
}

function paginationResult(items, page, pageSize, totalItems) {
  return {
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    },
  };
}

function notFound(resource) {
  return new AppError(`${resource} was not found`, {
    code: `${resource}_NOT_FOUND`,
    statusCode: 404,
  });
}

function normalizePromotionInput(input, { partial = false } = {}) {
  const changes = {};
  const set = (field, normalizer) => {
    if (!partial || Object.hasOwn(input, field)) changes[field] = normalizer(input[field]);
  };
  if (!partial) changes.promotionId = normalizeId(input.promotionId, 'promotionId', 12);
  set('name', (value) => requireString(value, 'name', { maxLength: 150 }));
  set('type', (value) => normalizeEnum(value, 'type', PROMOTION_TYPES));
  set('value', (value) => normalizePositiveMoney(value, 'value'));
  if (!partial || Object.hasOwn(input, 'minimumOrderValue')) {
    changes.minimumOrderValue = input.minimumOrderValue === undefined
      ? 0
      : normalizeMoney(input.minimumOrderValue, 'minimumOrderValue');
  }
  if (!partial || Object.hasOwn(input, 'maximumDiscount')) {
    changes.maximumDiscount = input.maximumDiscount === undefined
      ? null
      : normalizePositiveMoney(input.maximumDiscount, 'maximumDiscount', { allowNull: true });
  }
  set('startAt', (value) => normalizeDateTime(value, 'startAt'));
  set('endAt', (value) => normalizeDateTime(value, 'endAt'));
  if (!partial) {
    changes.status = input.status === undefined
      ? 'ACTIVE'
      : normalizeEnum(input.status, 'status', PROMOTION_STATUSES);
  }
  if (!partial || Object.hasOwn(input, 'productIds')) {
    changes.productIds = normalizeProductIds(input.productIds);
  }
  return changes;
}

function assertPromotionRules(promotion) {
  if (promotion.endAt <= promotion.startAt) {
    throw validationError('endAt must be later than startAt');
  }
  if (promotion.type === 'PERCENT' && promotion.value > 100) {
    throw validationError('PERCENT value must not exceed 100');
  }
  if (promotion.type === 'AMOUNT' && promotion.maximumDiscount !== null) {
    throw validationError('maximumDiscount is only supported for PERCENT promotions');
  }
}

function rowToDomain(row) {
  return {
    endAt: new Date(row.NgayKetThuc),
    maximumDiscount: row.MucGiamToiDa == null ? null : Number(row.MucGiamToiDa),
    minimumOrderValue: Number(row.GiaTriDonToiThieu),
    name: row.TenKM,
    promotionId: row.MaKM,
    startAt: new Date(row.NgayBatDau),
    status: row.TrangThai,
    type: row.LoaiKM,
    value: Number(row.GiaTri),
  };
}

class PromotionService {
  constructor({
    clock = () => new Date(),
    promotionRepository = new PromotionRepository(),
    transactionRunner = withTransaction,
  } = {}) {
    this.clock = clock;
    this.promotionRepository = promotionRepository;
    this.transactionRunner = transactionRunner;
  }

  now() {
    const value = this.clock();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new TypeError('clock must return a valid Date');
    }
    return value;
  }

  async listPublicPromotions(query = {}) {
    const productId = query.productId === undefined
      ? null
      : normalizeId(query.productId, 'productId', 10);
    const rows = await this.promotionRepository.listPublicPromotions({
      asOf: this.now(),
      productId,
    });
    return groupPublicRows(rows);
  }

  async getPublicPromotion(promotionIdInput) {
    const promotionId = normalizeId(promotionIdInput, 'promotionId', 12);
    const result = await this.promotionRepository.findPromotionById(promotionId);
    if (!result) throw notFound('PROMOTION');
    const now = this.now();
    const activeProducts = result.products.filter((product) => (
      product.TrangThai === 'ACTIVE' && product.TrangThaiLoai === 'ACTIVE'
    ));
    if (
      result.promotion.TrangThai !== 'ACTIVE'
      || new Date(result.promotion.NgayBatDau) > now
      || new Date(result.promotion.NgayKetThuc) <= now
      || activeProducts.length === 0
    ) {
      throw notFound('PROMOTION');
    }
    return serializePromotion(result.promotion, activeProducts, { publicOnly: true });
  }

  async listPromotions(query = {}) {
    const filters = normalizeListQuery(query);
    const result = await this.promotionRepository.listPromotions(filters);
    return paginationResult(
      result.items.map((row) => serializePromotion(row)),
      filters.page,
      filters.pageSize,
      result.totalItems,
    );
  }

  async getPromotion(promotionIdInput) {
    const promotionId = normalizeId(promotionIdInput, 'promotionId', 12);
    const result = await this.promotionRepository.findPromotionById(promotionId);
    if (!result) throw notFound('PROMOTION');
    return serializePromotion(result.promotion, result.products);
  }

  async createPromotion(input) {
    const promotion = normalizePromotionInput(input);
    assertPromotionRules(promotion);
    try {
      return await this.transactionRunner(async (transaction) => {
        if (await this.promotionRepository.findPromotionById(
          promotion.promotionId,
          { forUpdate: true, transaction },
        )) {
          throw new AppError('The promotion id is already in use', {
            code: 'PROMOTION_ID_CONFLICT',
            statusCode: 409,
          });
        }
        await this.assertProductsExist(promotion.productIds, transaction);
        await this.promotionRepository.createPromotion(promotion, transaction);
        await this.promotionRepository.replacePromotionProducts(
          promotion.promotionId,
          promotion.productIds,
          transaction,
        );
        return this.getPromotionInTransaction(promotion.promotionId, transaction);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError('The promotion id is already in use', {
          code: 'PROMOTION_ID_CONFLICT',
          statusCode: 409,
        });
      }
      throw error;
    }
  }

  async updatePromotion(promotionIdInput, input) {
    const promotionId = normalizeId(promotionIdInput, 'promotionId', 12);
    const changes = normalizePromotionInput(input, { partial: true });
    return this.transactionRunner(async (transaction) => {
      const current = await this.promotionRepository.findPromotionById(
        promotionId,
        { forUpdate: true, transaction },
      );
      if (!current) throw notFound('PROMOTION');
      const next = { ...rowToDomain(current.promotion), ...changes };
      assertPromotionRules(next);
      if (changes.productIds) await this.assertProductsExist(changes.productIds, transaction);
      const fieldChanges = { ...changes };
      delete fieldChanges.productIds;
      if (Object.keys(fieldChanges).length > 0) {
        await this.promotionRepository.updatePromotion(promotionId, fieldChanges, transaction);
      }
      if (changes.productIds) {
        await this.promotionRepository.replacePromotionProducts(
          promotionId,
          changes.productIds,
          transaction,
        );
      }
      return this.getPromotionInTransaction(promotionId, transaction);
    });
  }

  async updatePromotionStatus(promotionIdInput, input) {
    const promotionId = normalizeId(promotionIdInput, 'promotionId', 12);
    const status = normalizeEnum(input.status, 'status', PROMOTION_STATUSES);
    return this.transactionRunner(async (transaction) => {
      if (!await this.promotionRepository.findPromotionById(
        promotionId,
        { forUpdate: true, transaction },
      )) {
        throw notFound('PROMOTION');
      }
      await this.promotionRepository.updatePromotionStatus(promotionId, status, transaction);
      return this.getPromotionInTransaction(promotionId, transaction);
    });
  }

  async evaluatePromotion(input) {
    const promotionId = normalizeId(input.promotionId, 'promotionId', 12);
    const items = normalizeCartItems(input.items);
    const productIds = items.map((item) => item.productId);
    const [promotionResult, products] = await Promise.all([
      this.promotionRepository.findPromotionById(promotionId),
      this.promotionRepository.findProductsByIds(productIds),
    ]);
    if (!promotionResult) throw notFound('PROMOTION');
    if (products.length !== productIds.length) {
      throw new AppError('One or more products were not found', {
        code: 'PRODUCT_NOT_FOUND',
        statusCode: 404,
      });
    }
    const productMap = new Map(products.map((product) => [product.MaSP, product]));
    for (const product of products) {
      if (product.TrangThai !== 'ACTIVE' || product.TrangThaiLoai !== 'ACTIVE') {
        throw new AppError('One or more products are not currently available', {
          code: 'PRODUCT_NOT_AVAILABLE',
          statusCode: 400,
        });
      }
    }
    const pricedItems = items.map((item) => {
      const product = productMap.get(item.productId);
      const unitPrice = Number(product.GiaBan);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        throw new AppError('A product has an invalid current price', {
          code: 'PRODUCT_PRICE_INVALID',
          statusCode: 500,
        });
      }
      if (unitPrice * item.quantity > Number.MAX_SAFE_INTEGER / 100) {
        throw validationError('The calculated line subtotal is too large');
      }
      return {
        ...item,
        lineSubtotal: roundMoney(unitPrice * item.quantity),
        name: product.TenSP,
        unitPrice,
      };
    });
    const orderSubtotal = roundMoney(
      pricedItems.reduce((total, item) => total + item.lineSubtotal, 0),
    );
    return this.calculateEvaluation(promotionResult, pricedItems, orderSubtotal, this.now());
  }

  calculateEvaluation({ promotion, products }, pricedItems, orderSubtotal, evaluatedAt) {
    const domain = rowToDomain(promotion);
    const mappedIds = new Set(products.map((product) => product.MaSP));
    const qualifyingItems = pricedItems.filter((item) => mappedIds.has(item.productId));
    const eligibleSubtotal = roundMoney(
      qualifyingItems.reduce((total, item) => total + item.lineSubtotal, 0),
    );
    let reason = null;
    if (domain.status !== 'ACTIVE') reason = 'PROMOTION_INACTIVE';
    else if (evaluatedAt < domain.startAt) reason = 'PROMOTION_NOT_STARTED';
    else if (evaluatedAt >= domain.endAt) reason = 'PROMOTION_EXPIRED';
    else if (orderSubtotal < domain.minimumOrderValue) reason = 'MINIMUM_ORDER_NOT_MET';
    else if (eligibleSubtotal <= 0) reason = 'NO_ELIGIBLE_PRODUCT';

    let discountAmount = 0;
    if (!reason) {
      discountAmount = domain.type === 'PERCENT'
        ? eligibleSubtotal * domain.value / 100
        : domain.value;
      if (domain.maximumDiscount !== null) {
        discountAmount = Math.min(discountAmount, domain.maximumDiscount);
      }
      discountAmount = roundMoney(Math.min(discountAmount, eligibleSubtotal, orderSubtotal));
    }
    return {
      discountAmount,
      eligible: reason === null,
      eligibleSubtotal,
      evaluatedAt: evaluatedAt.toISOString(),
      maximumDiscount: domain.maximumDiscount,
      minimumOrderValue: domain.minimumOrderValue,
      name: domain.name,
      orderSubtotal,
      promotionId: domain.promotionId,
      qualifyingItems: qualifyingItems.map((item) => ({
        lineSubtotal: item.lineSubtotal,
        name: item.name,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      reason,
      type: domain.type,
      value: domain.value,
    };
  }

  async assertProductsExist(productIds, transaction) {
    const products = await this.promotionRepository.findProductsByIds(productIds, transaction);
    if (products.length !== productIds.length) {
      throw new AppError('One or more promotion products were not found', {
        code: 'PRODUCT_NOT_FOUND',
        statusCode: 404,
      });
    }
  }

  async getPromotionInTransaction(promotionId, transaction) {
    const result = await this.promotionRepository.findPromotionById(
      promotionId,
      { transaction },
    );
    if (!result) throw notFound('PROMOTION');
    return serializePromotion(result.promotion, result.products);
  }
}

module.exports = {
  PromotionService,
  normalizeCartItems,
  normalizeListQuery,
  normalizePromotionInput,
  serializePromotion,
};
