'use strict';

const { AuditService } = require('../services/audit.service');

const auditService = new AuditService();

async function listAuditLogs(request, response) {
  response.status(200).json({
    success: true,
    data: await auditService.list(request.auth, request.query),
  });
}

async function getAuditLog(request, response) {
  response.status(200).json({
    success: true,
    data: await auditService.getById(request.auth, request.params.auditLogId),
  });
}

module.exports = {
  getAuditLog,
  listAuditLogs,
};
