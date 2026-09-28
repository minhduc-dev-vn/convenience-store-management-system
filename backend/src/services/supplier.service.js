'use strict';

const { SupplierRepository } = require('../repositories/supplier.repository');
const { AppError } = require('../utils/app-error');
const {
  normalizeEmail,
  normalizeOptionalText,
  normalizePhone,
  requireString,
  validationError,
} = require('../utils/input-validation');
const { isUniqueConstraintError } = require('../utils/sql-error');
const { withTransaction } = require('../utils/transaction');

const SUPPLIER_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE']);
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
  if (!SUPPLIER_STATUSES.includes(status)) {
    throw validationError('status must be ACTIVE or INACTIVE');
  }
  return status;
}

function normalizeSupplierId(value) {
  return requireString(value, 'supplierId', { maxLength: 10 });
}

function normalizeTaxCode(value) {
  return normalizeOptionalText(value, 'taxCode', 20) ?? null;
}

function normalizeListQuery(query = {}) {
  const page = parsePositiveInteger(query.page, 'page', DEFAULT_PAGE, 2_147_483_647);
  const pageSize = parsePositiveInteger(query.pageSize, 'pageSize', DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  if ((page - 1) * pageSize > 2_147_483_647) {
    throw validationError('page is too large for the selected pageSize');
  }
  return {
    page,
    pageSize,
    search: query.search === undefined
      ? null
      : requireString(query.search, 'search', { maxLength: 150 }),
    status: normalizeStatus(query.status, { optional: true }),
  };
}

function serializeSupplier(row) {
  return {
    address: row.DiaChi,
    email: row.Email,
    name: row.TenNCC,
    phone: row.SDT,
    status: row.TrangThai,
    supplierId: row.MaNCC,
    taxCode: row.MaSoThue,
  };
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

function notFound() {
  return new AppError('SUPPLIER was not found', {
    code: 'SUPPLIER_NOT_FOUND',
    statusCode: 404,
  });
}

function conflict(code, message) {
  return new AppError(message, { code, statusCode: 409 });
}

class SupplierService {
  constructor({
    supplierRepository = new SupplierRepository(),
    transactionRunner = withTransaction,
  } = {}) {
    this.supplierRepository = supplierRepository;
    this.transactionRunner = transactionRunner;
  }

  async listSuppliers(query = {}) {
    const filters = normalizeListQuery(query);
    const result = await this.supplierRepository.listSuppliers(filters);
    return paginationResult(
      result.items.map(serializeSupplier),
      filters.page,
      filters.pageSize,
      result.totalItems,
    );
  }

  async getSupplier(supplierIdInput) {
    const supplierId = normalizeSupplierId(supplierIdInput);
    const supplier = await this.supplierRepository.findSupplierById(supplierId);
    if (!supplier) throw notFound();
    return serializeSupplier(supplier);
  }

  async createSupplier(input) {
    const supplier = {
      address: normalizeOptionalText(input.address, 'address', 255) ?? null,
      email: normalizeEmail(input.email),
      name: requireString(input.name, 'name', { maxLength: 150 }),
      phone: normalizePhone(input.phone),
      status: input.status === undefined ? 'ACTIVE' : normalizeStatus(input.status),
      supplierId: normalizeSupplierId(input.supplierId),
      taxCode: normalizeTaxCode(input.taxCode),
    };

    try {
      return await this.transactionRunner(async (transaction) => {
        if (await this.supplierRepository.findSupplierForUpdate(
          supplier.supplierId,
          transaction,
        )) {
          throw conflict('SUPPLIER_ID_CONFLICT', 'The supplier id is already in use');
        }
        await this.assertUniqueContacts(supplier, null, transaction);
        await this.supplierRepository.createSupplier(supplier, transaction);
        return this.getSupplierInTransaction(supplier.supplierId, transaction);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw conflict('SUPPLIER_CONFLICT', 'The supplier id, phone or tax code is already in use');
      }
      throw error;
    }
  }

  async updateSupplier(supplierIdInput, input) {
    const supplierId = normalizeSupplierId(supplierIdInput);
    const changes = {};
    if (Object.hasOwn(input, 'name')) {
      changes.name = requireString(input.name, 'name', { maxLength: 150 });
    }
    if (Object.hasOwn(input, 'phone')) changes.phone = normalizePhone(input.phone);
    if (Object.hasOwn(input, 'email')) changes.email = normalizeEmail(input.email);
    if (Object.hasOwn(input, 'address')) {
      changes.address = normalizeOptionalText(input.address, 'address', 255) ?? null;
    }
    if (Object.hasOwn(input, 'taxCode')) changes.taxCode = normalizeTaxCode(input.taxCode);

    try {
      return await this.transactionRunner(async (transaction) => {
        const current = await this.supplierRepository.findSupplierForUpdate(
          supplierId,
          transaction,
        );
        if (!current) throw notFound();
        await this.assertUniqueContacts(changes, supplierId, transaction);
        await this.supplierRepository.updateSupplier(supplierId, changes, transaction);
        return this.getSupplierInTransaction(supplierId, transaction);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw conflict('SUPPLIER_CONFLICT', 'The supplier phone or tax code is already in use');
      }
      throw error;
    }
  }

  async updateSupplierStatus(supplierIdInput, input) {
    const supplierId = normalizeSupplierId(supplierIdInput);
    const status = normalizeStatus(input.status);
    return this.transactionRunner(async (transaction) => {
      if (!await this.supplierRepository.findSupplierForUpdate(supplierId, transaction)) {
        throw notFound();
      }
      await this.supplierRepository.updateSupplierStatus(supplierId, status, transaction);
      return this.getSupplierInTransaction(supplierId, transaction);
    });
  }

  async assertUniqueContacts(values, supplierId, transaction) {
    if (Object.hasOwn(values, 'phone') && await this.supplierRepository.findPhoneConflict(
      values.phone,
      supplierId,
      transaction,
    )) {
      throw conflict('SUPPLIER_PHONE_CONFLICT', 'The supplier phone is already in use');
    }
    if (Object.hasOwn(values, 'taxCode') && await this.supplierRepository.findTaxCodeConflict(
      values.taxCode,
      supplierId,
      transaction,
    )) {
      throw conflict('SUPPLIER_TAX_CODE_CONFLICT', 'The supplier tax code is already in use');
    }
  }

  async getSupplierInTransaction(supplierId, transaction) {
    const supplier = await this.supplierRepository.findSupplierById(supplierId, transaction);
    if (!supplier) throw notFound();
    return serializeSupplier(supplier);
  }
}

module.exports = {
  SupplierService,
  normalizeListQuery,
  serializeSupplier,
};
