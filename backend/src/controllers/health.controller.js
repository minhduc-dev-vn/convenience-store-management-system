'use strict';

const healthService = require('../services/health.service');

function getHealth(_request, response) {
  response.status(200).json({
    success: true,
    data: healthService.getHealth(),
  });
}

async function getDatabaseHealth(_request, response) {
  response.status(200).json({
    success: true,
    data: await healthService.getDatabaseHealth(),
  });
}

module.exports = {
  getHealth,
  getDatabaseHealth,
};
