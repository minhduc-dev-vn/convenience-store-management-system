'use strict';

const { ReportingService } = require('../services/reporting.service');

const reportingService = new ReportingService();

function handler(method) {
  return async function reportHandler(request, response) {
    response.status(200).json({
      success: true,
      data: await reportingService[method](request.auth, request.query),
    });
  };
}

module.exports = {
  getEmployees: handler('getEmployees'),
  getInventory: handler('getInventory'),
  getProducts: handler('getProducts'),
  getReceiving: handler('getReceiving'),
  getRevenue: handler('getRevenue'),
  getShifts: handler('getShifts'),
};
