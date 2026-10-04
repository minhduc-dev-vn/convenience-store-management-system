export const AUDIT_ACTION_SUGGESTIONS = [
  'ACCOUNT_CREATED',
  'ACCOUNT_LOCKED',
  'ACCOUNT_ROLE_CHANGED',
  'ACCOUNT_UNLOCKED',
  'EMPLOYEE_CREATED',
  'EMPLOYEE_PASSWORD_RESET',
  'EMPLOYEE_UPDATED',
  'PASSWORD_CHANGED',
  'RECEIPT_CONFIRMED',
  'RETURN_COMPLETED',
  'STOCKTAKE_APPROVED',
  'STOCKTAKE_PROPOSED',
  'STOCKTAKE_RECOUNT_REQUESTED',
  'UPDATE_PRICE',
];

const REDACTED = '[DỮ LIỆU NHẠY CẢM ĐÃ ẨN]';
const SENSITIVE_MARKER = /(?:password|matkhau|mật\s*khẩu|token|secret|authorization|jwt|credential|api[_\s-]?key)/i;

export function validateAuditDateRange({ from, to }) {
  if (from && to && from > to) {
    return 'Ngày bắt đầu không được sau ngày kết thúc.';
  }
  return '';
}

export function sanitizeAuditValue(value, visited = new WeakSet()) {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}'))
      || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return sanitizeAuditValue(JSON.parse(trimmed), visited);
      } catch {
        // Keep non-JSON text readable unless it contains an authentication marker.
      }
    }
    return SENSITIVE_MARKER.test(value) ? REDACTED : value;
  }

  if (typeof value !== 'object') return value;
  if (visited.has(value)) return '[THAM CHIẾU LẶP ĐÃ ẨN]';
  visited.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item, visited));
  }

  return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [
    key,
    SENSITIVE_MARKER.test(key) ? REDACTED : sanitizeAuditValue(nestedValue, visited),
  ]));
}

export function formatAuditValue(value) {
  if (value === null || value === undefined || value === '') return 'Không có dữ liệu';
  const sanitized = sanitizeAuditValue(value);
  return typeof sanitized === 'object'
    ? JSON.stringify(sanitized, null, 2)
    : String(sanitized);
}
