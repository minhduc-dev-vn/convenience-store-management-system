'use strict';

const { AuditRepository } = require('../repositories/audit.repository');
const { AppError } = require('../utils/app-error');
const { requireString, validationError } = require('../utils/input-validation');

const MAX_PAGE_SIZE = 100;
const SENSITIVE_KEY = /(?:password|matkhau|mật\s*khẩu|token|secret|authorization|jwt|credential|api[_-]?key)/i;

function parsePositiveInteger(value, fieldName, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  const raw = typeof value === 'number' ? String(value) : value;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw validationError(`${fieldName} must be a positive integer`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw validationError(`${fieldName} must be between 1 and ${maximum}`);
  }
  return parsed;
}

function normalizeCalendarDate(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError(`${fieldName} must use YYYY-MM-DD format`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1
      || parsed.getUTCDate() !== day) {
    throw validationError(`${fieldName} must be a valid date`);
  }
  return value;
}

function normalizeOptionalString(value, fieldName, maxLength, { uppercase = false } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = requireString(value, fieldName, { maxLength });
  return uppercase ? normalized.toUpperCase() : normalized;
}

function normalizeIpAddress(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().slice(0, 45);
}

function containsSensitiveKey(value, visited = new WeakSet()) {
  if (!value || typeof value !== 'object') return false;
  if (visited.has(value)) return false;
  visited.add(value);
  return Object.entries(value).some(([key, nested]) => (
    SENSITIVE_KEY.test(key) || containsSensitiveKey(nested, visited)
  ));
}

function serializeAuditData(value) {
  if (value === undefined || value === null) return null;
  let inspectedValue = value;
  if (typeof value === 'string') {
    try {
      inspectedValue = JSON.parse(value);
    } catch {
      inspectedValue = value;
    }
  }
  if (containsSensitiveKey(inspectedValue)) {
    throw new AppError('Sensitive authentication data cannot be written to the audit log', {
      code: 'AUDIT_SENSITIVE_DATA',
      statusCode: 500,
    });
  }
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch (error) {
    throw new AppError('Audit data could not be serialized', {
      code: 'AUDIT_SERIALIZATION_FAILED',
      statusCode: 500,
      cause: error,
    });
  }
}

function parseAuditData(value, isJson) {
  if (value === null || value === undefined) return null;
  if (!isJson) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function serializeAuditLog(row) {
  return {
    auditLogId: Number(row.MaNhatKy),
    actor: row.MaTK == null ? null : {
      accountId: Number(row.MaTK),
      displayName: row.TenChuSoHuu,
      ownerId: row.MaChuSoHuu,
      ownerType: row.LoaiChuSoHuu,
      role: row.MaVaiTro,
      roleName: row.TenVaiTro,
      username: row.TenDangNhap,
    },
    action: row.HanhDong,
    target: {
      recordId: row.MaBanGhi,
      table: row.TenBang,
    },
    changes: {
      before: parseAuditData(row.DuLieuCu, Boolean(row.DuLieuCuLaJson)),
      after: parseAuditData(row.DuLieuMoi, Boolean(row.DuLieuMoiLaJson)),
    },
    occurredAt: row.ThoiGian instanceof Date ? row.ThoiGian.toISOString() : row.ThoiGian,
    ipAddress: row.DiaChiIP,
  };
}

function assertManager(identity) {
  if (!identity || identity.role !== 'MANAGER') {
    throw new AppError('This operation requires the MANAGER role', {
      code: 'FORBIDDEN',
      statusCode: 403,
    });
  }
}

function normalizeListQuery(query = {}) {
  const page = parsePositiveInteger(query.page, 'page', 1, 2_147_483_647);
  const pageSize = parsePositiveInteger(query.pageSize, 'pageSize', 20, MAX_PAGE_SIZE);
  if ((page - 1) * pageSize > 2_147_483_647) {
    throw validationError('page is too large for the selected pageSize');
  }
  const from = normalizeCalendarDate(query.from, 'from');
  const to = normalizeCalendarDate(query.to, 'to');
  if (from && to && from > to) throw validationError('from must not be after to');
  return {
    action: normalizeOptionalString(query.action, 'action', 50, { uppercase: true }),
    from,
    page,
    pageSize,
    recordId: normalizeOptionalString(query.recordId, 'recordId', 100),
    tableName: normalizeOptionalString(query.table, 'table', 128, { uppercase: true }),
    to,
    username: normalizeOptionalString(query.username, 'username', 50),
  };
}

class AuditService {
  constructor({ auditRepository = new AuditRepository() } = {}) {
    this.auditRepository = auditRepository;
  }

  async record(entry, transaction = null) {
    const normalized = {
      action: requireString(entry.action, 'audit action', { maxLength: 50 }).toUpperCase(),
      actorAccountId: entry.actorAccountId == null
        ? null
        : parsePositiveInteger(entry.actorAccountId, 'actorAccountId', undefined, 2_147_483_647),
      ipAddress: normalizeIpAddress(entry.ipAddress),
      newData: serializeAuditData(entry.newData),
      oldData: serializeAuditData(entry.oldData),
      recordId: entry.recordId == null
        ? null
        : requireString(String(entry.recordId), 'audit recordId', { maxLength: 100 }),
      tableName: requireString(entry.tableName, 'audit tableName', { maxLength: 128 }).toUpperCase(),
    };
    return this.auditRepository.write(normalized, transaction);
  }

  async list(identity, query = {}) {
    assertManager(identity);
    const filters = normalizeListQuery(query);
    const result = await this.auditRepository.list(filters);
    return {
      items: result.items.map(serializeAuditLog),
      pagination: {
        page: filters.page,
        pageSize: filters.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / filters.pageSize),
      },
    };
  }

  async getById(identity, auditLogIdInput) {
    assertManager(identity);
    const auditLogId = parsePositiveInteger(
      auditLogIdInput,
      'auditLogId',
      undefined,
      Number.MAX_SAFE_INTEGER,
    );
    const row = await this.auditRepository.findById(auditLogId);
    if (!row) {
      throw new AppError('Audit log was not found', {
        code: 'AUDIT_LOG_NOT_FOUND',
        statusCode: 404,
      });
    }
    return serializeAuditLog(row);
  }
}

module.exports = {
  AuditService,
  assertManager,
  normalizeListQuery,
  serializeAuditData,
  serializeAuditLog,
};
