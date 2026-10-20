'use strict';

const crypto = require('node:crypto');
const { ReturnRepository } = require('../repositories/return.repository');
const { AppError } = require('../utils/app-error');
const { requireString, validationError } = require('../utils/input-validation');
const { getSqlErrorNumber, isUniqueConstraintError } = require('../utils/sql-error');
const { withTransaction } = require('../utils/transaction');
const { AuditService } = require('./audit.service');

const RETURN_CONDITIONS = Object.freeze(['RESALABLE', 'DAMAGED']);
const MAX_BIGINT = 9_223_372_036_854_775_807n;
const REQUEST_FIELDS = new Set(['invoiceId', 'reason', 'items']);
const ITEM_FIELDS = new Set(['lineId', 'lotId', 'quantity', 'condition']);

function createReturnId() {
  return `PT${crypto.randomBytes(7).toString('hex').slice(0, 13).toUpperCase()}`;
}

function returnError(code, message, statusCode) {
  return new AppError(message, { code, statusCode });
}

function assertCashierIdentity(identity) {
  if (!identity || identity.role !== 'CASHIER' || !identity.employeeId || !identity.accountId) {
    throw returnError('FORBIDDEN', 'You do not have permission to process returns', 403);
  }
  return identity;
}

function assertObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError(`${fieldName} must be a JSON object`);
  }
}

function assertExactFields(value, allowedFields, requiredFields, fieldName) {
  assertObject(value, fieldName);
  const unknownField = Object.keys(value).find((field) => !allowedFields.has(field));
  if (unknownField) {
    throw validationError(`Unsupported ${fieldName} field: ${unknownField}`);
  }
  const missingField = requiredFields.find((field) => !Object.hasOwn(value, field));
  if (missingField) {
    throw validationError(`${fieldName}.${missingField} is required`);
  }
}

function normalizeLineId(value) {
  let text;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw validationError('items[].lineId must be a positive BIGINT value');
    }
    text = String(value);
  } else if (typeof value === 'string') {
    text = value.trim();
  } else {
    throw validationError('items[].lineId must be a positive BIGINT value');
  }

  if (!/^\d+$/.test(text)) {
    throw validationError('items[].lineId must be a positive BIGINT value');
  }
  const normalized = BigInt(text);
  if (normalized < 1n || normalized > MAX_BIGINT) {
    throw validationError('items[].lineId must be a positive BIGINT value');
  }
  return normalized.toString();
}

function normalizeQuantity(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    throw validationError('items[].quantity must be an integer between 1 and 2147483647');
  }
  return value;
}

function normalizeCondition(value) {
  const condition = requireString(value, 'items[].condition', { maxLength: 20 }).toUpperCase();
  if (!RETURN_CONDITIONS.includes(condition)) {
    throw validationError(`items[].condition must be one of: ${RETURN_CONDITIONS.join(', ')}`);
  }
  return condition;
}

function normalizeReturnInput(input) {
  assertExactFields(input, REQUEST_FIELDS, ['invoiceId', 'reason', 'items'], 'request');
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw validationError('items must be a non-empty array');
  }

  const items = input.items.map((item) => {
    assertExactFields(
      item,
      ITEM_FIELDS,
      ['lineId', 'lotId', 'quantity', 'condition'],
      'items[]',
    );
    return {
      condition: normalizeCondition(item.condition),
      lineId: normalizeLineId(item.lineId),
      lotId: requireString(item.lotId, 'items[].lotId', { maxLength: 20 }),
      quantity: normalizeQuantity(item.quantity),
    };
  });

  const allocations = new Set();
  for (const item of items) {
    const key = `${item.lineId}\u0000${item.lotId}`;
    if (allocations.has(key)) {
      throw validationError('The same invoice-line lot can appear only once');
    }
    allocations.add(key);
  }

  return {
    invoiceId: requireString(input.invoiceId, 'invoiceId', { maxLength: 15 }),
    items,
    reason: requireString(input.reason, 'reason', { maxLength: 255 }),
  };
}

function dateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function serializeReturn(result) {
  const header = result.header;
  if (!header) {
    throw new AppError('Return transaction did not provide a persisted result');
  }
  return {
    employeeId: header.MaNV,
    invoiceId: header.MaHD,
    invoiceStatus: header.TrangThaiHoaDon,
    items: result.items.map((item) => ({
      condition: item.TinhTrangHang,
      lineId: String(item.MaCTHD),
      lot: {
        lotId: item.MaLo,
        manufacturerLot: item.SoLo,
      },
      product: {
        name: item.TenSP,
        productId: item.MaSP,
        unit: item.DonViTinh,
      },
      quantity: Number(item.SoLuongTra),
      refundAmount: Number(item.TienHoan),
    })),
    loyaltyPointsAdjusted: Number(header.DiemDaDieuChinh ?? 0),
    reason: header.LyDo,
    refundAmount: Number(header.TongTienHoan),
    returnId: header.MaPT,
    returnedAt: dateTime(header.NgayTra),
    status: header.TrangThai,
  };
}

const SQL_ERROR_MAP = new Map([
  [51601, ['VALIDATION_ERROR', 'Return code is required', 400]],
  [51602, ['VALIDATION_ERROR', 'invoiceId is required', 400]],
  [51603, ['VALIDATION_ERROR', 'Authenticated employee is required', 400]],
  [51604, ['VALIDATION_ERROR', 'reason is required', 400]],
  [51605, ['VALIDATION_ERROR', 'items must be a JSON array', 400]],
  [51606, ['VALIDATION_ERROR', 'Every return item must identify a sold lot, quantity and condition', 400]],
  [51607, ['VALIDATION_ERROR', 'The same invoice-line lot can appear only once', 400]],
  [51608, ['RETURN_ID_CONFLICT', 'Return code already exists', 409]],
  [51609, ['INVALID_TOKEN', 'The authenticated employee no longer exists or is inactive', 401]],
  [51610, ['INVOICE_NOT_FOUND', 'INVOICE was not found', 404]],
  [51611, ['INVOICE_NOT_RETURNABLE', 'Only a PAID invoice can receive a return', 409]],
  [51612, ['LOYALTY_RETURN_POLICY_UNRESOLVED', 'Returns are unavailable for invoices that redeemed loyalty points', 409]],
  [51613, ['RETURN_ITEM_NOT_SOLD', 'A return item does not match the original invoice lot allocation', 400]],
  [51614, ['RETURN_QUANTITY_EXCEEDED', 'Return quantity exceeds the remaining returnable quantity', 409]],
  [51615, ['REFUND_CONFLICT', 'Calculated refund exceeds the paid invoice value', 409]],
  [51616, ['LOT_INVENTORY_OVERFLOW', 'Restoring the returned quantity would overflow inventory', 409]],
  [51617, ['LOYALTY_BALANCE_CONFLICT', 'Customer loyalty balance is insufficient for this return', 409]],
]);

function mapReturnError(error) {
  if (error instanceof AppError) return error;
  const mapping = SQL_ERROR_MAP.get(getSqlErrorNumber(error));
  if (mapping) return returnError(mapping[0], mapping[1], mapping[2]);
  if (isUniqueConstraintError(error)) {
    return returnError('RETURN_CONFLICT', 'Return data conflicts with persisted data', 409);
  }
  return error;
}

class ReturnService {
  constructor({
    auditService = new AuditService(),
    returnIdGenerator = createReturnId,
    returnRepository = new ReturnRepository(),
    transactionRunner = withTransaction,
  } = {}) {
    this.auditService = auditService;
    this.returnIdGenerator = returnIdGenerator;
    this.returnRepository = returnRepository;
    this.transactionRunner = transactionRunner;
  }

  async createReturn(identityInput, input, ipAddress = null) {
    const identity = assertCashierIdentity(identityInput);
    const returnInput = normalizeReturnInput(input);
    const returnId = this.returnIdGenerator();

    try {
      return await this.transactionRunner(async (transaction) => {
        const result = await this.returnRepository.completeReturn({
          employeeId: identity.employeeId,
          invoiceId: returnInput.invoiceId,
          itemsJson: JSON.stringify(returnInput.items.map((item) => ({
            MaCTHD: item.lineId,
            MaLo: item.lotId,
            SoLuongTra: item.quantity,
            TinhTrangHang: item.condition,
          }))),
          reason: returnInput.reason,
          returnId,
        }, transaction);
        const persistedReturn = serializeReturn(result);
        await this.auditService.record({
          action: 'RETURN_COMPLETED',
          actorAccountId: identity.accountId,
          ipAddress,
          newData: {
            invoiceId: persistedReturn.invoiceId,
            invoiceStatus: persistedReturn.invoiceStatus,
            itemCount: persistedReturn.items.length,
            loyaltyPointsAdjusted: persistedReturn.loyaltyPointsAdjusted,
            refundAmount: persistedReturn.refundAmount,
            status: persistedReturn.status,
          },
          oldData: null,
          recordId: persistedReturn.returnId,
          tableName: 'PHIEU_TRA',
        }, transaction);
        return { return: persistedReturn };
      });
    } catch (error) {
      throw mapReturnError(error);
    }
  }
}

module.exports = {
  RETURN_CONDITIONS,
  ReturnService,
  assertCashierIdentity,
  createReturnId,
  mapReturnError,
  normalizeReturnInput,
  serializeReturn,
};
