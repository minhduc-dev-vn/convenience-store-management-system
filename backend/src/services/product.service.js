'use strict';

const { ProductRepository } = require('../repositories/product.repository');
const { AppError } = require('../utils/app-error');
const { requireString, validationError } = require('../utils/input-validation');
const { isUniqueConstraintError } = require('../utils/sql-error');
const { withTransaction } = require('../utils/transaction');
const { AuditService } = require('./audit.service');

const PRODUCT_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE']);
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

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

function normalizeStatus(value, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const status = requireString(value, 'status', { maxLength: 20 }).toUpperCase();
  if (!PRODUCT_STATUSES.includes(status)) {
    throw validationError('status must be ACTIVE or INACTIVE');
  }
  return status;
}

function normalizeId(value, fieldName) {
  return requireString(value, fieldName, { maxLength: 10 });
}

function normalizeOptionalText(value, fieldName, maxLength) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return requireString(value, fieldName, { maxLength });
}

function normalizeImageUrl(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;

  const imageUrl = requireString(value, 'imageUrl', { maxLength: 500 });
  if (!/^https?:\/\//i.test(imageUrl)) {
    throw validationError('imageUrl must use the HTTP or HTTPS protocol');
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    throw validationError('imageUrl must be a valid HTTP or HTTPS URL');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw validationError('imageUrl must use the HTTP or HTTPS protocol');
  }
  return imageUrl;
}

function normalizePrice(value, fieldName = 'price') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw validationError(`${fieldName} must be a positive number`);
  }
  if (value > Number.MAX_SAFE_INTEGER / 100) {
    throw validationError(`${fieldName} is too large`);
  }
  if (Math.abs((value * 100) - Math.round(value * 100)) > Number.EPSILON * 100) {
    throw validationError(`${fieldName} must not have more than two decimal places`);
  }
  return value;
}

function normalizeMinimumStock(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) {
    throw validationError('minimumStock must be an integer between 0 and 2147483647');
  }
  return value;
}

function escapeLike(value) {
  return value.replace(/~/g, '~~').replace(/%/g, '~%').replace(/_/g, '~_').replace(/\[/g, '~[');
}

function normalizeListQuery(query = {}, { publicOnly = false } = {}) {
  const page = parsePositiveInteger(query.page, 'page', DEFAULT_PAGE, 2_147_483_647);
  const pageSize = parsePositiveInteger(query.pageSize, 'pageSize', DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  if ((page - 1) * pageSize > 2_147_483_647) {
    throw validationError('page is too large for the selected pageSize');
  }
  const search = query.search === undefined
    ? null
    : requireString(query.search, 'search', { maxLength: 150 });
  return {
    categoryId: query.categoryId === undefined
      ? null
      : normalizeId(query.categoryId, 'categoryId'),
    page,
    pageSize,
    publicOnly,
    search,
    searchPattern: search ? `${escapeLike(search)}%` : null,
    status: publicOnly ? 'ACTIVE' : normalizeStatus(query.status, { optional: true }),
  };
}

function normalizeCategoryListQuery(query = {}) {
  const page = parsePositiveInteger(query.page, 'page', DEFAULT_PAGE, 2_147_483_647);
  const pageSize = parsePositiveInteger(query.pageSize, 'pageSize', DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  if ((page - 1) * pageSize > 2_147_483_647) {
    throw validationError('page is too large for the selected pageSize');
  }
  const search = query.search === undefined
    ? null
    : requireString(query.search, 'search', { maxLength: 100 });
  return {
    page,
    pageSize,
    searchPattern: search ? `${escapeLike(search)}%` : null,
    status: normalizeStatus(query.status, { optional: true }),
  };
}

function serializePublicProduct(row) {
  return {
    category: {
      categoryId: row.MaLoai,
      name: row.TenLoai,
    },
    imageUrl: row.ImageUrl ?? null,
    name: row.TenSP,
    price: Number(row.GiaBan),
    productId: row.MaSP,
    unit: row.DonViTinh,
  };
}

function serializeProduct(row) {
  return {
    barcode: row.MaVach,
    category: {
      categoryId: row.MaLoai,
      name: row.TenLoai,
      status: row.TrangThaiLoai,
    },
    imageUrl: row.ImageUrl ?? null,
    minimumStock: row.MucTonToiThieu,
    name: row.TenSP,
    price: Number(row.GiaBan),
    productId: row.MaSP,
    status: row.TrangThai,
    unit: row.DonViTinh,
  };
}

function serializeCategory(row, { publicOnly = false } = {}) {
  const category = {
    categoryId: row.MaLoai,
    name: row.TenLoai,
  };
  if (!publicOnly) {
    category.description = row.MoTa;
    category.status = row.TrangThai;
  }
  return category;
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

function conflict(code, message) {
  return new AppError(message, { code, statusCode: 409 });
}

function parseAuditPayload(value) {
  if (typeof value !== 'string' || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function auditPrice(payload) {
  const value = payload.price ?? payload.GiaBan;
  const price = Number(value);
  return Number.isFinite(price) ? price : null;
}

function serializePriceHistory(row) {
  const oldData = parseAuditPayload(row.DuLieuCu);
  const newData = parseAuditPayload(row.DuLieuMoi);
  return {
    changedAt: row.ThoiGian instanceof Date ? row.ThoiGian.toISOString() : row.ThoiGian,
    changedBy: row.MaTK == null ? null : {
      accountId: Number(row.MaTK),
      fullName: row.TenNguoiThucHien,
      username: row.TenDangNhap,
    },
    newPrice: auditPrice(newData),
    oldPrice: auditPrice(oldData),
    reason: newData.reason ?? newData.LyDo ?? null,
  };
}

class ProductService {
  constructor({
    auditService = new AuditService(),
    productRepository = new ProductRepository(),
    transactionRunner = withTransaction,
  } = {}) {
    this.auditService = auditService;
    this.productRepository = productRepository;
    this.transactionRunner = transactionRunner;
  }

  async listPublicProducts(query = {}) {
    const filters = normalizeListQuery(query, { publicOnly: true });
    const result = await this.productRepository.listProducts(filters, { publicOnly: true });
    return paginationResult(
      result.items.map(serializePublicProduct),
      filters.page,
      filters.pageSize,
      result.totalItems,
    );
  }

  async getPublicProduct(productIdInput) {
    const productId = normalizeId(productIdInput, 'productId');
    const product = await this.productRepository.findProductById(productId, { publicOnly: true });
    if (!product) throw notFound('PRODUCT');
    return serializePublicProduct(product);
  }

  async listPublicCategories() {
    const categories = await this.productRepository.listPublicCategories();
    return categories.map((row) => serializeCategory(row, { publicOnly: true }));
  }

  async listProducts(query = {}) {
    const filters = normalizeListQuery(query);
    const result = await this.productRepository.listProducts(filters);
    return paginationResult(
      result.items.map(serializeProduct),
      filters.page,
      filters.pageSize,
      result.totalItems,
    );
  }

  async getProduct(productIdInput) {
    const productId = normalizeId(productIdInput, 'productId');
    const product = await this.productRepository.findProductById(productId);
    if (!product) throw notFound('PRODUCT');
    return serializeProduct(product);
  }

  async createProduct(input) {
    const product = {
      barcode: normalizeOptionalText(input.barcode, 'barcode', 30) ?? null,
      categoryId: normalizeId(input.categoryId, 'categoryId'),
      imageUrl: normalizeImageUrl(input.imageUrl) ?? null,
      minimumStock: normalizeMinimumStock(input.minimumStock),
      name: requireString(input.name, 'name', { maxLength: 150 }),
      price: normalizePrice(input.price),
      productId: normalizeId(input.productId, 'productId'),
      status: input.status === undefined ? 'ACTIVE' : normalizeStatus(input.status),
      unit: requireString(input.unit, 'unit', { maxLength: 20 }),
    };

    try {
      return await this.transactionRunner(async (transaction) => {
        if (await this.productRepository.findProductForUpdate(product.productId, transaction)) {
          throw conflict('PRODUCT_ID_CONFLICT', 'The product id is already in use');
        }
        await this.assertActiveCategory(product.categoryId, transaction);
        if (await this.productRepository.findBarcodeConflict(
          product.barcode,
          null,
          transaction,
        )) {
          throw conflict('PRODUCT_BARCODE_CONFLICT', 'The barcode is already in use');
        }
        await this.productRepository.createProduct(product, transaction);
        return this.getProductInTransaction(product.productId, transaction);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw conflict('PRODUCT_CONFLICT', 'The product id or barcode is already in use');
      }
      throw error;
    }
  }

  async updateProduct(productIdInput, input) {
    const productId = normalizeId(productIdInput, 'productId');
    const changes = {};
    if (Object.hasOwn(input, 'name')) {
      changes.name = requireString(input.name, 'name', { maxLength: 150 });
    }
    if (Object.hasOwn(input, 'barcode')) {
      changes.barcode = normalizeOptionalText(input.barcode, 'barcode', 30) ?? null;
    }
    if (Object.hasOwn(input, 'unit')) {
      changes.unit = requireString(input.unit, 'unit', { maxLength: 20 });
    }
    if (Object.hasOwn(input, 'minimumStock')) {
      changes.minimumStock = normalizeMinimumStock(input.minimumStock);
    }
    if (Object.hasOwn(input, 'categoryId')) {
      changes.categoryId = normalizeId(input.categoryId, 'categoryId');
    }
    if (Object.hasOwn(input, 'imageUrl')) {
      changes.imageUrl = normalizeImageUrl(input.imageUrl);
    }

    try {
      return await this.transactionRunner(async (transaction) => {
        if (!await this.productRepository.findProductForUpdate(productId, transaction)) {
          throw notFound('PRODUCT');
        }
        if (Object.hasOwn(changes, 'categoryId')) {
          await this.assertActiveCategory(changes.categoryId, transaction);
        }
        if (Object.hasOwn(changes, 'barcode') && await this.productRepository.findBarcodeConflict(
          changes.barcode,
          productId,
          transaction,
        )) {
          throw conflict('PRODUCT_BARCODE_CONFLICT', 'The barcode is already in use');
        }
        await this.productRepository.updateProduct(productId, changes, transaction);
        return this.getProductInTransaction(productId, transaction);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw conflict('PRODUCT_BARCODE_CONFLICT', 'The barcode is already in use');
      }
      throw error;
    }
  }

  async updateProductStatus(productIdInput, input) {
    const productId = normalizeId(productIdInput, 'productId');
    const status = normalizeStatus(input.status);
    return this.transactionRunner(async (transaction) => {
      if (!await this.productRepository.findProductForUpdate(productId, transaction)) {
        throw notFound('PRODUCT');
      }
      await this.productRepository.updateProductStatus(productId, status, transaction);
      return this.getProductInTransaction(productId, transaction);
    });
  }

  async updateProductPrice(identity, productIdInput, input, ipAddress = null) {
    const productId = normalizeId(productIdInput, 'productId');
    const newPrice = normalizePrice(input.newPrice, 'newPrice');
    const reason = requireString(input.reason, 'reason', { maxLength: 255 });
    return this.transactionRunner(async (transaction) => {
      const current = await this.productRepository.findProductForUpdate(productId, transaction);
      if (!current) throw notFound('PRODUCT');
      const oldPrice = Number(current.GiaBan);
      if (oldPrice === newPrice) {
        throw validationError('newPrice must be different from the current price');
      }
      await this.productRepository.updateProductPrice(productId, newPrice, transaction);
      await this.auditService.record({
        action: 'UPDATE_PRICE',
        actorAccountId: identity.accountId,
        ipAddress,
        newData: { price: newPrice, reason },
        oldData: { price: oldPrice },
        recordId: productId,
        tableName: 'SAN_PHAM',
      }, transaction);
      return {
        newPrice,
        oldPrice,
        productId,
        reason,
      };
    });
  }

  async listPriceHistory(productIdInput, query = {}) {
    const productId = normalizeId(productIdInput, 'productId');
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
    if (!await this.productRepository.findProductById(productId)) throw notFound('PRODUCT');
    const result = await this.productRepository.listPriceHistory(productId, { page, pageSize });
    return paginationResult(
      result.items.map(serializePriceHistory),
      page,
      pageSize,
      result.totalItems,
    );
  }

  async listCategories(query = {}) {
    const filters = normalizeCategoryListQuery(query);
    const result = await this.productRepository.listCategories(filters);
    return paginationResult(
      result.items.map(serializeCategory),
      filters.page,
      filters.pageSize,
      result.totalItems,
    );
  }

  async getCategory(categoryIdInput) {
    const categoryId = normalizeId(categoryIdInput, 'categoryId');
    const category = await this.productRepository.findCategoryById(categoryId);
    if (!category) throw notFound('CATEGORY');
    return serializeCategory(category);
  }

  async createCategory(input) {
    const category = {
      categoryId: normalizeId(input.categoryId, 'categoryId'),
      description: normalizeOptionalText(input.description, 'description', 255) ?? null,
      name: requireString(input.name, 'name', { maxLength: 100 }),
      status: input.status === undefined ? 'ACTIVE' : normalizeStatus(input.status),
    };
    try {
      return await this.transactionRunner(async (transaction) => {
        if (await this.productRepository.findCategoryForUpdate(
          category.categoryId,
          transaction,
        )) {
          throw conflict('CATEGORY_ID_CONFLICT', 'The category id is already in use');
        }
        if (await this.productRepository.findCategoryNameConflict(
          category.name,
          null,
          transaction,
        )) {
          throw conflict('CATEGORY_NAME_CONFLICT', 'The category name is already in use');
        }
        await this.productRepository.createCategory(category, transaction);
        return this.getCategoryInTransaction(category.categoryId, transaction);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw conflict('CATEGORY_CONFLICT', 'The category id or name is already in use');
      }
      throw error;
    }
  }

  async updateCategory(categoryIdInput, input) {
    const categoryId = normalizeId(categoryIdInput, 'categoryId');
    const changes = {};
    if (Object.hasOwn(input, 'name')) {
      changes.name = requireString(input.name, 'name', { maxLength: 100 });
    }
    if (Object.hasOwn(input, 'description')) {
      changes.description = normalizeOptionalText(input.description, 'description', 255) ?? null;
    }
    try {
      return await this.transactionRunner(async (transaction) => {
        if (!await this.productRepository.findCategoryForUpdate(categoryId, transaction)) {
          throw notFound('CATEGORY');
        }
        if (Object.hasOwn(changes, 'name') && await this.productRepository.findCategoryNameConflict(
          changes.name,
          categoryId,
          transaction,
        )) {
          throw conflict('CATEGORY_NAME_CONFLICT', 'The category name is already in use');
        }
        await this.productRepository.updateCategory(categoryId, changes, transaction);
        return this.getCategoryInTransaction(categoryId, transaction);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw conflict('CATEGORY_NAME_CONFLICT', 'The category name is already in use');
      }
      throw error;
    }
  }

  async updateCategoryStatus(categoryIdInput, input) {
    const categoryId = normalizeId(categoryIdInput, 'categoryId');
    const status = normalizeStatus(input.status);
    return this.transactionRunner(async (transaction) => {
      if (!await this.productRepository.findCategoryForUpdate(categoryId, transaction)) {
        throw notFound('CATEGORY');
      }
      await this.productRepository.updateCategoryStatus(categoryId, status, transaction);
      return this.getCategoryInTransaction(categoryId, transaction);
    });
  }

  async assertActiveCategory(categoryId, transaction) {
    const category = await this.productRepository.findCategoryForUpdate(categoryId, transaction);
    if (!category) throw notFound('CATEGORY');
    if (category.TrangThai !== 'ACTIVE') {
      throw new AppError('Products can only use an active category', {
        code: 'CATEGORY_INACTIVE',
        statusCode: 400,
      });
    }
  }

  async getProductInTransaction(productId, transaction) {
    const product = await this.productRepository.findProductById(productId, { transaction });
    if (!product) throw notFound('PRODUCT');
    return serializeProduct(product);
  }

  async getCategoryInTransaction(categoryId, transaction) {
    const category = await this.productRepository.findCategoryById(categoryId, transaction);
    if (!category) throw notFound('CATEGORY');
    return serializeCategory(category);
  }
}

module.exports = {
  ProductService,
  normalizeImageUrl,
  normalizeListQuery,
  serializePriceHistory,
  serializeProduct,
  serializePublicProduct,
};
