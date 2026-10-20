const AUDIT_FILTER_FIELDS = [
  'page',
  'pageSize',
  'from',
  'to',
  'username',
  'action',
  'table',
  'recordId',
];

export function buildAuditListPath(filters = {}) {
  const query = new URLSearchParams();
  for (const field of AUDIT_FILTER_FIELDS) {
    const value = filters[field];
    if (value !== undefined && value !== null && value !== '') {
      query.set(field, String(value));
    }
  }
  return `/admin/audit-logs${query.size > 0 ? `?${query.toString()}` : ''}`;
}

export function buildAuditDetailPath(auditLogId) {
  const normalized = typeof auditLogId === 'number' && Number.isSafeInteger(auditLogId)
    ? String(auditLogId)
    : auditLogId;
  if (typeof normalized !== 'string' || !/^\d+$/.test(normalized.trim())) {
    throw new TypeError('auditLogId must be a positive integer');
  }
  const numericId = Number(normalized.trim());
  if (!Number.isSafeInteger(numericId) || numericId < 1) {
    throw new TypeError('auditLogId must be a positive integer');
  }
  return `/admin/audit-logs/${numericId}`;
}
