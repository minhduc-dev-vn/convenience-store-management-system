import { apiClient } from '../api';
import { buildAuditDetailPath, buildAuditListPath } from './auditQuery';

export { buildAuditDetailPath, buildAuditListPath } from './auditQuery';

export function listAuditLogs(filters = {}, options = {}) {
  return apiClient.get(buildAuditListPath(filters), options);
}

export function getAuditLog(auditLogId, options = {}) {
  return apiClient.get(buildAuditDetailPath(auditLogId), options);
}
