'use strict';

const crypto = require('node:crypto');
const { StocktakeRepository } = require('../repositories/stocktake.repository');
const { AppError } = require('../utils/app-error');
const { normalizeOptionalText, requireString, validationError } = require('../utils/input-validation');
const { getSqlErrorNumber, isUniqueConstraintError } = require('../utils/sql-error');
const { withTransaction } = require('../utils/transaction');
const { AuditService } = require('./audit.service');

const SCHEMA_STATUSES = Object.freeze(['DRAFT', 'APPROVED', 'CANCELLED']);
const WORKFLOW_STATES = Object.freeze([
  'DRAFT', 'PENDING_APPROVAL', 'RECOUNT_REQUIRED', 'APPROVED', 'CANCELLED',
]);
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function createStocktakeId() {
  return `KK${crypto.randomBytes(7).toString('hex').slice(0, 13).toUpperCase()}`;
}

function stocktakeError(code, message, statusCode) {
  return new AppError(message, { code, statusCode });
}

function assertIdentity(identity, role) {
  if (!identity || identity.role !== role || !identity.employeeId || !identity.accountId) {
    throw stocktakeError('FORBIDDEN', `You do not have permission to perform this stocktake action`, 403);
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

function normalizeEnum(value, fieldName, values) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = requireString(value, fieldName, { maxLength: 30 }).toUpperCase();
  if (!values.includes(normalized)) {
    throw validationError(`${fieldName} must be one of: ${values.join(', ')}`);
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
    searchPattern: search ? `%${escapeLike(search)}%` : null,
    status: normalizeEnum(query.status, 'status', SCHEMA_STATUSES),
    workflowState: normalizeEnum(query.workflowState, 'workflowState', WORKFLOW_STATES),
  };
}

function normalizeStocktakeId(value) {
  return requireString(value, 'stocktakeId', { maxLength: 15 });
}

function normalizeLotId(value) {
  return requireString(value, 'lotId', { maxLength: 20 });
}

function normalizeCountInput(input = {}) {
  if (!Number.isSafeInteger(input.actualQuantity)
      || input.actualQuantity < 0
      || input.actualQuantity > 2_147_483_647) {
    throw validationError('actualQuantity must be an integer between 0 and 2147483647');
  }
  return {
    actualQuantity: input.actualQuantity,
    reason: normalizeOptionalText(input.reason, 'reason', 255) ?? null,
  };
}

function normalizeComment(input = {}, { required = false } = {}) {
  if (required) return requireString(input.comment, 'comment', { maxLength: 255 });
  return normalizeOptionalText(input.comment, 'comment', 255) ?? null;
}

function dateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function parseWorkflowPayload(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function serializeWorkflow(row) {
  const payload = parseWorkflowPayload(row.DuLieuQuyTrinh);
  return {
    managerComment: payload.managerComment ?? null,
    state: row.TrangThaiQuyTrinh,
    updatedAt: dateTime(row.ThoiGianQuyTrinh),
  };
}

function serializeHeader(row) {
  return {
    createdBy: {
      employeeId: row.MaNV,
      name: row.TenNhanVien ?? null,
    },
    discrepancyCount: Number(row.SoDongChenhLech ?? 0),
    note: row.GhiChu ?? null,
    schemaStatus: row.TrangThai,
    startedAt: dateTime(row.NgayKiemKe),
    stocktakeId: row.MaKK,
    totalAbsoluteDiscrepancy: Number(row.TongChenhLechTuyetDoi ?? 0),
    totalLots: Number(row.TongSoDong ?? 0),
    workflow: serializeWorkflow(row),
  };
}

function serializeDetail(row) {
  return {
    actualQuantity: Number(row.SoLuongThucTe),
    currentQuantity: Number(row.SoLuongTonHienTai),
    discrepancy: Number(row.ChenhLech),
    lot: {
      lotId: row.MaLo,
      manufacturerLot: row.SoLo,
    },
    product: {
      name: row.TenSP,
      productId: row.MaSP,
      unit: row.DonViTinh,
    },
    reason: row.LyDo ?? null,
    snapshotChanged: Boolean(row.SnapshotDaThayDoi),
    systemQuantity: Number(row.SoLuongHeThong),
  };
}

function serializeResult(result) {
  if (!result.header) {
    throw stocktakeError('STOCKTAKE_NOT_FOUND', 'Stocktake was not found', 404);
  }
  return {
    stocktake: serializeHeader(result.header),
    lines: result.details.map(serializeDetail),
  };
}

function requireEditable(header) {
  if (header.TrangThai !== 'DRAFT') {
    throw stocktakeError('STOCKTAKE_FINALIZED', 'A finalized stocktake cannot be changed', 409);
  }
  if (header.TrangThaiQuyTrinh === 'PENDING_APPROVAL') {
    throw stocktakeError(
      'STOCKTAKE_PENDING_APPROVAL',
      'A stocktake pending manager approval cannot be changed',
      409,
    );
  }
}

function requirePendingApproval(header) {
  if (header.TrangThai !== 'DRAFT') {
    throw stocktakeError('STOCKTAKE_FINALIZED', 'The stocktake is already finalized', 409);
  }
  if (header.TrangThaiQuyTrinh !== 'PENDING_APPROVAL') {
    throw stocktakeError(
      'STOCKTAKE_NOT_PENDING_APPROVAL',
      'The stocktake is not pending manager approval',
      409,
    );
  }
}

const SQL_ERROR_MAP = new Map([
  [51701, ['VALIDATION_ERROR', 'Stocktake code is required', 400]],
  [51702, ['INVALID_TOKEN', 'The warehouse employee is inactive or unavailable', 401]],
  [51703, ['STOCKTAKE_ID_CONFLICT', 'Stocktake code already exists', 409]],
  [51704, ['STOCKTAKE_IN_PROGRESS', 'Another DRAFT stocktake is already in progress', 409]],
  [51705, ['STOCKTAKE_EMPTY_INVENTORY', 'A stocktake cannot start without inventory lots', 409]],
  [51706, ['VALIDATION_ERROR', 'Stocktake and lot codes are required', 400]],
  [51707, ['VALIDATION_ERROR', 'actualQuantity must be zero or greater', 400]],
  [51708, ['STOCKTAKE_NOT_FOUND', 'Stocktake was not found', 404]],
  [51709, ['STOCKTAKE_FINALIZED', 'A finalized stocktake cannot be changed', 409]],
  [51710, ['STOCKTAKE_LOT_NOT_FOUND', 'The lot is not part of this stocktake snapshot', 404]],
  [51711, ['STOCKTAKE_REASON_REQUIRED', 'A reason is required for a discrepancy', 400]],
  [51712, ['VALIDATION_ERROR', 'Stocktake code is required', 400]],
  [51713, ['INVALID_TOKEN', 'The approving manager is inactive or unavailable', 401]],
  [51714, ['STOCKTAKE_NOT_FOUND', 'Stocktake was not found', 404]],
  [51715, ['STOCKTAKE_FINALIZED', 'Only a DRAFT stocktake can be approved', 409]],
  [51716, ['STOCKTAKE_EMPTY', 'The stocktake has no snapshot details', 409]],
  [51717, ['STOCKTAKE_NO_DISCREPANCY', 'The stocktake has no discrepancy to approve', 409]],
  [51718, ['STOCKTAKE_REASON_REQUIRED', 'Every discrepancy requires a reason', 400]],
  [51719, ['STOCKTAKE_SNAPSHOT_STALE', 'Inventory changed after the stocktake snapshot', 409]],
]);

function mapStocktakeError(error) {
  if (error instanceof AppError) return error;
  const number = getSqlErrorNumber(error);
  const mapped = SQL_ERROR_MAP.get(number);
  if (mapped) return stocktakeError(mapped[0], mapped[1], mapped[2]);
  if (number === 51132) {
    return validationError('Audit comments cannot contain authentication secrets');
  }
  if (isUniqueConstraintError(error)) {
    return stocktakeError('STOCKTAKE_CONFLICT', 'Stocktake data conflicts with persisted data', 409);
  }
  return error;
}

class StocktakeService {
  constructor({
    auditService = new AuditService(),
    stocktakeIdGenerator = createStocktakeId,
    stocktakeRepository = new StocktakeRepository(),
    transactionRunner = withTransaction,
  } = {}) {
    this.auditService = auditService;
    this.stocktakeIdGenerator = stocktakeIdGenerator;
    this.stocktakeRepository = stocktakeRepository;
    this.transactionRunner = transactionRunner;
  }

  async listWarehouseStocktakes(identityInput, query = {}) {
    const identity = assertIdentity(identityInput, 'WAREHOUSE');
    return this.listStocktakes({ ...normalizeListQuery(query), employeeId: identity.employeeId });
  }

  async listManagerStocktakes(identityInput, query = {}) {
    assertIdentity(identityInput, 'MANAGER');
    return this.listStocktakes({ ...normalizeListQuery(query), employeeId: null });
  }

  async listStocktakes(filters) {
    try {
      const result = await this.stocktakeRepository.listStocktakes(filters);
      return {
        items: result.items.map(serializeHeader),
        pagination: {
          page: filters.page,
          pageSize: filters.pageSize,
          totalItems: result.totalItems,
          totalPages: Math.ceil(result.totalItems / filters.pageSize),
        },
      };
    } catch (error) {
      throw mapStocktakeError(error);
    }
  }

  async getWarehouseStocktake(identityInput, stocktakeIdInput) {
    const identity = assertIdentity(identityInput, 'WAREHOUSE');
    return this.getStocktake(stocktakeIdInput, identity.employeeId);
  }

  async getManagerStocktake(identityInput, stocktakeIdInput) {
    assertIdentity(identityInput, 'MANAGER');
    return this.getStocktake(stocktakeIdInput, null);
  }

  async getStocktake(stocktakeIdInput, employeeId) {
    try {
      return serializeResult(await this.stocktakeRepository.getStocktake(
        normalizeStocktakeId(stocktakeIdInput),
        { employeeId },
      ));
    } catch (error) {
      throw mapStocktakeError(error);
    }
  }

  async createStocktake(identityInput, input = {}) {
    const identity = assertIdentity(identityInput, 'WAREHOUSE');
    const note = normalizeOptionalText(input.note, 'note', 255) ?? null;
    try {
      const result = await this.stocktakeRepository.createStocktake({
        employeeId: identity.employeeId,
        note,
        stocktakeId: this.stocktakeIdGenerator(),
      });
      return serializeResult({
        header: {
          ...result.header,
          DuLieuQuyTrinh: null,
          HanhDongQuyTrinh: null,
          SoDongChenhLech: result.details.filter((line) => Number(line.ChenhLech) !== 0).length,
          TenNhanVien: result.details[0]?.TenNhanVien ?? null,
          ThoiGianQuyTrinh: null,
          TongChenhLechTuyetDoi: result.details.reduce(
            (total, line) => total + Math.abs(Number(line.ChenhLech)), 0,
          ),
          TongSoDong: result.details.length,
          TrangThaiQuyTrinh: 'DRAFT',
        },
        details: result.details,
      });
    } catch (error) {
      throw mapStocktakeError(error);
    }
  }

  async recordCount(identityInput, stocktakeIdInput, lotIdInput, input) {
    const identity = assertIdentity(identityInput, 'WAREHOUSE');
    const stocktakeId = normalizeStocktakeId(stocktakeIdInput);
    const lotId = normalizeLotId(lotIdInput);
    const count = normalizeCountInput(input);
    try {
      return await this.transactionRunner(async (transaction) => {
        const current = await this.stocktakeRepository.getStocktake(stocktakeId, {
          employeeId: identity.employeeId,
          lock: true,
          transaction,
        });
        if (!current.header) {
          throw stocktakeError('STOCKTAKE_NOT_FOUND', 'Stocktake was not found', 404);
        }
        requireEditable(current.header);
        const row = await this.stocktakeRepository.recordCount({
          ...count,
          lotId,
          stocktakeId,
        }, transaction);
        return { line: serializeDetail(row) };
      });
    } catch (error) {
      throw mapStocktakeError(error);
    }
  }

  async proposeStocktake(identityInput, stocktakeIdInput, input = {}, ipAddress = null) {
    const identity = assertIdentity(identityInput, 'WAREHOUSE');
    const stocktakeId = normalizeStocktakeId(stocktakeIdInput);
    const note = normalizeComment(input);
    try {
      return await this.transactionRunner(async (transaction) => {
        const current = await this.stocktakeRepository.getStocktake(stocktakeId, {
          employeeId: identity.employeeId,
          lock: true,
          transaction,
        });
        if (!current.header) {
          throw stocktakeError('STOCKTAKE_NOT_FOUND', 'Stocktake was not found', 404);
        }
        requireEditable(current.header);
        const discrepancies = current.details.filter((line) => Number(line.ChenhLech) !== 0);
        if (discrepancies.length === 0) {
          throw stocktakeError(
            'STOCKTAKE_NO_DISCREPANCY',
            'A stocktake must have at least one discrepancy before proposal',
            409,
          );
        }
        if (discrepancies.some((line) => !line.LyDo?.trim())) {
          throw stocktakeError(
            'STOCKTAKE_REASON_REQUIRED',
            'Every discrepancy requires a reason before proposal',
            400,
          );
        }
        const audit = await this.auditService.record({
          action: 'STOCKTAKE_PROPOSED',
          actorAccountId: identity.accountId,
          ipAddress,
          newData: {
            discrepancyCount: discrepancies.length,
            note,
            workflowState: 'PENDING_APPROVAL',
          },
          oldData: { workflowState: current.header.TrangThaiQuyTrinh },
          recordId: stocktakeId,
          tableName: 'KIEM_KE',
        }, transaction);
        return {
          stocktakeId,
          workflow: {
            managerComment: null,
            state: 'PENDING_APPROVAL',
            updatedAt: dateTime(audit?.ThoiGian),
          },
        };
      });
    } catch (error) {
      throw mapStocktakeError(error);
    }
  }

  async approveStocktake(identityInput, stocktakeIdInput, input = {}, ipAddress = null) {
    const identity = assertIdentity(identityInput, 'MANAGER');
    const stocktakeId = normalizeStocktakeId(stocktakeIdInput);
    const managerComment = normalizeComment(input);
    try {
      return await this.transactionRunner(async (transaction) => {
        const current = await this.stocktakeRepository.getStocktake(stocktakeId, {
          lock: true,
          transaction,
        });
        if (!current.header) {
          throw stocktakeError('STOCKTAKE_NOT_FOUND', 'Stocktake was not found', 404);
        }
        requirePendingApproval(current.header);
        const result = await this.stocktakeRepository.approveStocktake({
          employeeId: identity.employeeId,
          stocktakeId,
        }, transaction);
        const audit = await this.auditService.record({
          action: 'STOCKTAKE_APPROVED',
          actorAccountId: identity.accountId,
          ipAddress,
          newData: {
            discrepancyCount: current.details.filter((line) => Number(line.ChenhLech) !== 0).length,
            managerComment,
            schemaStatus: 'APPROVED',
            workflowState: 'APPROVED',
          },
          oldData: {
            schemaStatus: 'DRAFT',
            workflowState: 'PENDING_APPROVAL',
          },
          recordId: stocktakeId,
          tableName: 'KIEM_KE',
        }, transaction);
        return serializeResult({
          header: {
            ...result.header,
            DuLieuQuyTrinh: JSON.stringify({ managerComment }),
            SoDongChenhLech: result.details.filter((line) => Number(line.ChenhLech) !== 0).length,
            TenNhanVien: current.header.TenNhanVien,
            ThoiGianQuyTrinh: audit?.ThoiGian ?? null,
            TongChenhLechTuyetDoi: result.details.reduce(
              (total, line) => total + Math.abs(Number(line.ChenhLech)), 0,
            ),
            TongSoDong: result.details.length,
            TrangThaiQuyTrinh: 'APPROVED',
          },
          details: result.details,
        });
      });
    } catch (error) {
      throw mapStocktakeError(error);
    }
  }

  async rejectStocktake(identityInput, stocktakeIdInput, input, ipAddress = null) {
    const identity = assertIdentity(identityInput, 'MANAGER');
    const stocktakeId = normalizeStocktakeId(stocktakeIdInput);
    const managerComment = normalizeComment(input, { required: true });
    try {
      return await this.transactionRunner(async (transaction) => {
        const current = await this.stocktakeRepository.getStocktake(stocktakeId, {
          lock: true,
          transaction,
        });
        if (!current.header) {
          throw stocktakeError('STOCKTAKE_NOT_FOUND', 'Stocktake was not found', 404);
        }
        requirePendingApproval(current.header);
        const audit = await this.auditService.record({
          action: 'STOCKTAKE_RECOUNT_REQUESTED',
          actorAccountId: identity.accountId,
          ipAddress,
          newData: { managerComment, workflowState: 'RECOUNT_REQUIRED' },
          oldData: { workflowState: 'PENDING_APPROVAL' },
          recordId: stocktakeId,
          tableName: 'KIEM_KE',
        }, transaction);
        return {
          stocktakeId,
          workflow: {
            managerComment,
            state: 'RECOUNT_REQUIRED',
            updatedAt: dateTime(audit?.ThoiGian),
          },
        };
      });
    } catch (error) {
      throw mapStocktakeError(error);
    }
  }
}

module.exports = {
  SCHEMA_STATUSES,
  WORKFLOW_STATES,
  StocktakeService,
  assertIdentity,
  createStocktakeId,
  mapStocktakeError,
  normalizeCountInput,
  normalizeListQuery,
  serializeDetail,
  serializeHeader,
};
