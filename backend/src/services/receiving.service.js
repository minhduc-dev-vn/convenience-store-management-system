'use strict';

const crypto = require('node:crypto');
const { ReceivingRepository } = require('../repositories/receiving.repository');
const { AppError } = require('../utils/app-error');
const { normalizeOptionalText, requireString, validationError } = require('../utils/input-validation');
const { getSqlErrorNumber, isUniqueConstraintError } = require('../utils/sql-error');
const { withTransaction } = require('../utils/transaction');

const RECEIPT_STATUSES = Object.freeze(['DRAFT', 'CONFIRMED', 'CANCELLED']);
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_ID_ATTEMPTS = 5;

function createReceiptId() {
  return `PN${crypto.randomBytes(7).toString('hex').slice(0, 13).toUpperCase()}`;
}

function createLotId() {
  return `LO${crypto.randomBytes(9).toString('hex').toUpperCase()}`;
}

function assertWarehouseIdentity(identity) {
  if (!identity || identity.role !== 'WAREHOUSE' || !identity.employeeId) {
    throw new AppError('You do not have permission to manage receiving', {
      code: 'FORBIDDEN',
      statusCode: 403,
    });
  }
  return identity;
}

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

function escapeLike(value) {
  return value.replace(/~/g, '~~').replace(/%/g, '~%').replace(/_/g, '~_').replace(/\[/g, '~[');
}

function normalizeListQuery(query = {}, { receiptStatus = false } = {}) {
  const page = parsePositiveInteger(query.page, 'page', DEFAULT_PAGE, 2_147_483_647);
  const pageSize = parsePositiveInteger(query.pageSize, 'pageSize', DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  if ((page - 1) * pageSize > 2_147_483_647) {
    throw validationError('page is too large for the selected pageSize');
  }
  const search = query.search === undefined
    ? null
    : requireString(query.search, 'search', { maxLength: 150 });
  const result = { page, pageSize, search };
  if (receiptStatus) {
    const status = query.status === undefined
      ? 'DRAFT'
      : requireString(query.status, 'status', { maxLength: 20 }).toUpperCase();
    if (!RECEIPT_STATUSES.includes(status)) {
      throw validationError(`status must be one of: ${RECEIPT_STATUSES.join(', ')}`);
    }
    result.searchPattern = search ? `${escapeLike(search)}%` : null;
    result.status = status;
  }
  return result;
}

function normalizeDateTime(value, fieldName, { optional = false } = {}) {
  if (optional && value === undefined) return undefined;
  const pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (typeof value !== 'string' || !pattern.test(value.trim())) {
    throw validationError(`${fieldName} must be an ISO 8601 date-time string`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw validationError(`${fieldName} must be a valid ISO 8601 date-time`);
  }
  return new Date(Math.floor(parsed.getTime() / 1000) * 1000);
}

function normalizeDateOnly(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError(`${fieldName} must use YYYY-MM-DD format`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year
      || parsed.getUTCMonth() !== month - 1
      || parsed.getUTCDate() !== day) {
    throw validationError(`${fieldName} must be a valid calendar date`);
  }
  return value;
}

function normalizeQuantity(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    throw validationError('quantity must be an integer between 1 and 2147483647');
  }
  return value;
}

function normalizeUnitCost(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw validationError('unitCost must be a number greater than or equal to 0');
  }
  if (value > Number.MAX_SAFE_INTEGER / 100) {
    throw validationError('unitCost is too large');
  }
  if (Math.abs((value * 100) - Math.round(value * 100)) > Number.EPSILON * 100) {
    throw validationError('unitCost must not have more than two decimal places');
  }
  return value;
}

function normalizeReceiptId(value) {
  return requireString(value, 'receiptId', { maxLength: 15 });
}

function normalizeDetailId(value) {
  const normalized = requireString(value, 'detailId', { maxLength: 19 });
  if (!/^\d+$/.test(normalized)
      || BigInt(normalized) < 1n
      || BigInt(normalized) > 9_223_372_036_854_775_807n) {
    throw validationError('detailId must be a positive BIGINT value');
  }
  return normalized;
}

function normalizeLine(input) {
  const line = {
    expiryDate: normalizeDateOnly(input.expiryDate, 'expiryDate'),
    manufactureDate: normalizeDateOnly(input.manufactureDate, 'manufactureDate'),
    manufacturerLot: requireString(input.manufacturerLot, 'manufacturerLot', { maxLength: 50 }),
    productId: requireString(input.productId, 'productId', { maxLength: 10 }),
    quantity: normalizeQuantity(input.quantity),
    unitCost: normalizeUnitCost(input.unitCost),
  };
  if (line.expiryDate && line.manufactureDate && line.expiryDate <= line.manufactureDate) {
    throw validationError('expiryDate must be later than manufactureDate');
  }
  return line;
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function dateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function serializeLine(row) {
  return {
    detailId: String(row.MaCTPN),
    expiryDate: dateOnly(row.HanSuDung),
    lineTotal: Number(row.ThanhTien),
    lotId: row.MaLo,
    manufactureDate: dateOnly(row.NgaySanXuat),
    manufacturerLot: row.SoLo,
    product: {
      name: row.TenSP,
      productId: row.MaSP,
    },
    quantity: Number(row.SoLuong),
    unitCost: Number(row.DonGiaNhap),
  };
}

function serializeReceipt(row, lines) {
  const receipt = {
    confirmedAt: dateTime(row.NgayXacNhan),
    employee: {
      employeeId: row.MaNV,
      name: row.TenNhanVien,
    },
    lineCount: Number(row.SoDong ?? lines?.length ?? 0),
    note: row.GhiChu,
    receiptId: row.MaPN,
    receivedAt: dateTime(row.NgayNhap),
    status: row.TrangThai,
    supplier: {
      name: row.TenNCC,
      supplierId: row.MaNCC,
    },
    total: Number(row.TongTien),
  };
  if (lines) receipt.lines = lines.map(serializeLine);
  return receipt;
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

function receivingError(code, message, statusCode) {
  return new AppError(message, { code, statusCode });
}

const SQL_ERROR_MAP = new Map([
  [51301, ['VALIDATION_ERROR', 'Receipt code is required', 400]],
  [51302, ['INVALID_TOKEN', 'The authenticated employee no longer exists', 401]],
  [51303, ['SUPPLIER_NOT_FOUND', 'SUPPLIER was not found', 404]],
  [51304, ['RECEIPT_NOT_DRAFT', 'Only a DRAFT receipt can be updated', 409]],
  [51308, ['VALIDATION_ERROR', 'Receipt line identifiers are required', 400]],
  [51309, ['VALIDATION_ERROR', 'quantity must be greater than zero', 400]],
  [51310, ['VALIDATION_ERROR', 'unitCost must be greater than or equal to zero', 400]],
  [51311, ['VALIDATION_ERROR', 'expiryDate must be later than manufactureDate', 400]],
  [51312, ['RECEIPT_NOT_FOUND', 'RECEIPT was not found', 404]],
  [51313, ['RECEIPT_NOT_DRAFT', 'Receipt lines can only change while DRAFT', 409]],
  [51314, ['PRODUCT_NOT_FOUND', 'PRODUCT was not found', 404]],
  [51315, ['LOT_CONFLICT', 'The internal lot code conflicts with an existing lot', 409]],
  [51316, ['LOT_CONFLICT', 'Lot manufacture or expiry dates conflict with existing data', 409]],
  [51317, ['LOT_CONFLICT', 'The product and manufacturer lot pair already exists', 409]],
  [51322, ['RECEIPT_NOT_FOUND', 'RECEIPT was not found', 404]],
  [51323, ['RECEIPT_NOT_DRAFT', 'Receipt lines can only change while DRAFT', 409]],
  [51324, ['RECEIPT_LINE_NOT_FOUND', 'RECEIPT_LINE was not found', 404]],
  [51327, ['RECEIPT_NOT_FOUND', 'RECEIPT was not found', 404]],
  [51328, ['RECEIPT_NOT_DRAFT', 'Only a DRAFT receipt can be cancelled', 409]],
  [51330, ['VALIDATION_ERROR', 'Receipt code is required', 400]],
  [51331, ['RECEIPT_NOT_FOUND', 'RECEIPT was not found', 404]],
  [51332, ['RECEIPT_ALREADY_CONFIRMED', 'Receipt has already been confirmed', 409]],
  [51333, ['RECEIPT_NOT_DRAFT', 'Only a DRAFT receipt can be confirmed', 409]],
  [51334, ['RECEIPT_IMPORT_CONFLICT', 'Receipt already has an import transaction', 409]],
  [51335, ['RECEIPT_EMPTY', 'Receipt must contain at least one line', 400]],
  [51336, ['RECEIPT_INVALID_LINE', 'Receipt contains an invalid line', 400]],
  [51337, ['LOT_INVENTORY_OVERFLOW', 'Confirming the receipt would overflow inventory', 409]],
]);

function mapReceivingError(error) {
  if (error instanceof AppError) return error;
  const mapping = SQL_ERROR_MAP.get(getSqlErrorNumber(error));
  if (mapping) return receivingError(mapping[0], mapping[1], mapping[2]);
  if (isUniqueConstraintError(error)) {
    return receivingError('RECEIVING_CONFLICT', 'Receipt or lot data conflicts with existing data', 409);
  }
  return error;
}

function assertDraft(row) {
  if (!row) throw receivingError('RECEIPT_NOT_FOUND', 'RECEIPT was not found', 404);
  if (row.TrangThai !== 'DRAFT') {
    throw receivingError('RECEIPT_NOT_DRAFT', 'Receipt can only be changed while DRAFT', 409);
  }
}

class ReceivingService {
  constructor({
    lotIdGenerator = createLotId,
    receiptIdGenerator = createReceiptId,
    receivingRepository = new ReceivingRepository(),
    transactionRunner = withTransaction,
  } = {}) {
    this.lotIdGenerator = lotIdGenerator;
    this.receiptIdGenerator = receiptIdGenerator;
    this.receivingRepository = receivingRepository;
    this.transactionRunner = transactionRunner;
  }

  async listReceipts(identity, query = {}) {
    assertWarehouseIdentity(identity);
    const filters = normalizeListQuery(query, { receiptStatus: true });
    const result = await this.receivingRepository.listReceipts(filters);
    return paginationResult(
      result.items.map((row) => serializeReceipt(row)),
      filters.page,
      filters.pageSize,
      result.totalItems,
    );
  }

  async getReceipt(identity, receiptIdInput) {
    assertWarehouseIdentity(identity);
    return this.getReceiptById(normalizeReceiptId(receiptIdInput));
  }

  async createDraft(identityInput, input) {
    const identity = assertWarehouseIdentity(identityInput);
    const draft = {
      employeeId: identity.employeeId,
      note: normalizeOptionalText(input.note, 'note', 255) ?? null,
      receivedAt: input.receivedAt === undefined
        ? null
        : normalizeDateTime(input.receivedAt, 'receivedAt'),
      supplierId: requireString(input.supplierId, 'supplierId', { maxLength: 10 }),
    };
    try {
      return await this.transactionRunner(async (transaction) => {
        const receiptId = await this.allocateReceiptId(transaction);
        await this.receivingRepository.saveDraft({ ...draft, receiptId }, transaction);
        return this.getReceiptById(receiptId, transaction);
      });
    } catch (error) {
      throw mapReceivingError(error);
    }
  }

  async updateDraft(identityInput, receiptIdInput, input) {
    assertWarehouseIdentity(identityInput);
    const receiptId = normalizeReceiptId(receiptIdInput);
    try {
      return await this.transactionRunner(async (transaction) => {
        const current = await this.receivingRepository.findReceiptForUpdate(receiptId, transaction);
        assertDraft(current);
        const draft = {
          employeeId: current.MaNV,
          note: Object.hasOwn(input, 'note')
            ? (normalizeOptionalText(input.note, 'note', 255) ?? null)
            : current.GhiChu,
          receiptId,
          receivedAt: Object.hasOwn(input, 'receivedAt')
            ? normalizeDateTime(input.receivedAt, 'receivedAt')
            : current.NgayNhap,
          supplierId: Object.hasOwn(input, 'supplierId')
            ? requireString(input.supplierId, 'supplierId', { maxLength: 10 })
            : current.MaNCC,
        };
        await this.receivingRepository.saveDraft(draft, transaction);
        return this.getReceiptById(receiptId, transaction);
      });
    } catch (error) {
      throw mapReceivingError(error);
    }
  }

  async addLine(identityInput, receiptIdInput, input) {
    assertWarehouseIdentity(identityInput);
    const receiptId = normalizeReceiptId(receiptIdInput);
    const line = normalizeLine(input);
    try {
      return await this.transactionRunner(async (transaction) => {
        assertDraft(await this.receivingRepository.findReceiptForUpdate(receiptId, transaction));
        if (!await this.receivingRepository.findProductForReceiving(line.productId, transaction)) {
          throw receivingError('PRODUCT_NOT_FOUND', 'PRODUCT was not found', 404);
        }
        const existingLot = await this.receivingRepository.findLotByProductAndNumber(
          line.productId,
          line.manufacturerLot,
          transaction,
        );
        const lotId = existingLot?.MaLo ?? await this.allocateLotId(transaction);
        if (await this.receivingRepository.findLineByLot(receiptId, lotId, transaction)) {
          throw receivingError(
            'RECEIPT_LINE_CONFLICT',
            'This lot is already present on the receipt',
            409,
          );
        }
        await this.receivingRepository.saveLine(receiptId, lotId, line, transaction);
        return this.getReceiptById(receiptId, transaction);
      });
    } catch (error) {
      throw mapReceivingError(error);
    }
  }

  async updateLine(identityInput, receiptIdInput, detailIdInput, input) {
    assertWarehouseIdentity(identityInput);
    const receiptId = normalizeReceiptId(receiptIdInput);
    const detailId = normalizeDetailId(detailIdInput);
    try {
      return await this.transactionRunner(async (transaction) => {
        assertDraft(await this.receivingRepository.findReceiptForUpdate(receiptId, transaction));
        const current = await this.receivingRepository.findLineForUpdate(
          receiptId,
          detailId,
          transaction,
        );
        if (!current) {
          throw receivingError('RECEIPT_LINE_NOT_FOUND', 'RECEIPT_LINE was not found', 404);
        }
        const line = normalizeLine({
          expiryDate: Object.hasOwn(input, 'expiryDate') ? input.expiryDate : dateOnly(current.HanSuDung),
          manufactureDate: Object.hasOwn(input, 'manufactureDate')
            ? input.manufactureDate
            : dateOnly(current.NgaySanXuat),
          manufacturerLot: Object.hasOwn(input, 'manufacturerLot')
            ? input.manufacturerLot
            : current.SoLo,
          productId: Object.hasOwn(input, 'productId') ? input.productId : current.MaSP,
          quantity: Object.hasOwn(input, 'quantity') ? input.quantity : Number(current.SoLuong),
          unitCost: Object.hasOwn(input, 'unitCost') ? input.unitCost : Number(current.DonGiaNhap),
        });
        if (!await this.receivingRepository.findProductForReceiving(line.productId, transaction)) {
          throw receivingError('PRODUCT_NOT_FOUND', 'PRODUCT was not found', 404);
        }
        const matchingLot = await this.receivingRepository.findLotByProductAndNumber(
          line.productId,
          line.manufacturerLot,
          transaction,
        );
        let targetLotId = matchingLot?.MaLo ?? null;
        const sameCurrentLot = targetLotId === current.MaLo;
        const datesChanged = dateOnly(current.NgaySanXuat) !== line.manufactureDate
          || dateOnly(current.HanSuDung) !== line.expiryDate;

        if (sameCurrentLot && datesChanged) {
          const updated = await this.receivingRepository.updateDraftLotDefinition(
            current.MaLo,
            detailId,
            line,
            transaction,
          );
          if (!updated) {
            throw receivingError('LOT_DEFINITION_LOCKED', 'The existing lot definition cannot be changed', 409);
          }
        } else if (!targetLotId) {
          const reusedCurrentLot = await this.receivingRepository.updateDraftLotDefinition(
            current.MaLo,
            detailId,
            line,
            transaction,
          );
          targetLotId = reusedCurrentLot ? current.MaLo : await this.allocateLotId(transaction);
        }

        if (targetLotId !== current.MaLo) {
          const duplicate = await this.receivingRepository.findLineByLot(
            receiptId,
            targetLotId,
            transaction,
          );
          if (duplicate && String(duplicate.MaCTPN) !== detailId) {
            throw receivingError(
              'RECEIPT_LINE_CONFLICT',
              'This lot is already present on the receipt',
              409,
            );
          }
          await this.receivingRepository.deleteLine(receiptId, detailId, transaction);
        }
        await this.receivingRepository.saveLine(receiptId, targetLotId, line, transaction);
        return this.getReceiptById(receiptId, transaction);
      });
    } catch (error) {
      throw mapReceivingError(error);
    }
  }

  async deleteLine(identityInput, receiptIdInput, detailIdInput) {
    assertWarehouseIdentity(identityInput);
    const receiptId = normalizeReceiptId(receiptIdInput);
    const detailId = normalizeDetailId(detailIdInput);
    try {
      return await this.transactionRunner(async (transaction) => {
        assertDraft(await this.receivingRepository.findReceiptForUpdate(receiptId, transaction));
        await this.receivingRepository.deleteLine(receiptId, detailId, transaction);
        return this.getReceiptById(receiptId, transaction);
      });
    } catch (error) {
      throw mapReceivingError(error);
    }
  }

  async cancelReceipt(identityInput, receiptIdInput) {
    assertWarehouseIdentity(identityInput);
    const receiptId = normalizeReceiptId(receiptIdInput);
    try {
      return await this.transactionRunner(async (transaction) => {
        await this.receivingRepository.cancelReceipt(receiptId, transaction);
        return this.getReceiptById(receiptId, transaction);
      });
    } catch (error) {
      throw mapReceivingError(error);
    }
  }

  async confirmReceipt(identityInput, receiptIdInput, ipAddress = null) {
    const identity = assertWarehouseIdentity(identityInput);
    const receiptId = normalizeReceiptId(receiptIdInput);
    try {
      return await this.transactionRunner(async (transaction) => {
        const confirmation = await this.receivingRepository.confirmReceipt(receiptId, transaction);
        await this.receivingRepository.writeConfirmAudit({
          actorAccountId: identity.accountId,
          ipAddress,
          newData: JSON.stringify({
            confirmedAt: dateTime(confirmation.NgayXacNhan),
            status: confirmation.TrangThai,
            stockTransactionCount: Number(confirmation.SoGiaoDichNhap),
            total: Number(confirmation.TongTien),
          }),
          receiptId,
        }, transaction);
        return this.getReceiptById(receiptId, transaction);
      });
    } catch (error) {
      throw mapReceivingError(error);
    }
  }

  async listSupplierOptions(identity, query = {}) {
    assertWarehouseIdentity(identity);
    const filters = normalizeListQuery(query);
    const result = await this.receivingRepository.listActiveSuppliers(filters);
    return paginationResult(result.items.map((row) => ({
      name: row.TenNCC,
      phone: row.SDT,
      supplierId: row.MaNCC,
    })), filters.page, filters.pageSize, result.totalItems);
  }

  async listProductOptions(identity, query = {}) {
    assertWarehouseIdentity(identity);
    const filters = normalizeListQuery(query);
    const result = await this.receivingRepository.listActiveProducts(filters);
    return paginationResult(result.items.map((row) => ({
      barcode: row.MaVach,
      name: row.TenSP,
      productId: row.MaSP,
      unit: row.DonViTinh,
    })), filters.page, filters.pageSize, result.totalItems);
  }

  async getReceiptById(receiptId, transaction = null) {
    const receipt = await this.receivingRepository.findReceiptById(receiptId, transaction);
    if (!receipt) throw receivingError('RECEIPT_NOT_FOUND', 'RECEIPT was not found', 404);
    const lines = await this.receivingRepository.listReceiptLines(receiptId, transaction);
    return serializeReceipt(receipt, lines);
  }

  async allocateReceiptId(transaction) {
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
      const receiptId = this.receiptIdGenerator();
      if (!await this.receivingRepository.findReceiptForUpdate(receiptId, transaction)) {
        return receiptId;
      }
    }
    throw receivingError('RECEIPT_ID_UNAVAILABLE', 'Could not allocate a unique receipt id', 503);
  }

  async allocateLotId(transaction) {
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
      const lotId = this.lotIdGenerator();
      if (!await this.receivingRepository.findLotByIdForUpdate(lotId, transaction)) {
        return lotId;
      }
    }
    throw receivingError('LOT_ID_UNAVAILABLE', 'Could not allocate a unique lot id', 503);
  }
}

module.exports = {
  ReceivingService,
  createLotId,
  createReceiptId,
  mapReceivingError,
  normalizeLine,
  normalizeListQuery,
  serializeLine,
  serializeReceipt,
};
