'use strict';

const { DatabaseRepository } = require('../repositories/database.repository');

const databaseRepository = new DatabaseRepository();

function getHealth() {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

async function getDatabaseHealth() {
  const isHealthy = await databaseRepository.checkConnection();

  return {
    status: isHealthy ? 'ok' : 'unavailable',
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  getHealth,
  getDatabaseHealth,
};
