'use strict';

const { AppError } = require('../utils/app-error');
const { getDatabaseSettings } = require('./database.config');
const { getSqlDriver } = require('./database.driver');

let activePool = null;
let connectionPromise = null;

function createConnectionPromise() {
  const settings = getDatabaseSettings();
  const sql = getSqlDriver(settings.driver);
  const pool = new sql.ConnectionPool(settings.config);

  pool.on('error', () => {
    if (activePool === pool) activePool = null;
    connectionPromise = null;
  });

  return pool.connect()
    .then((connectedPool) => {
      activePool = connectedPool;
      return connectedPool;
    })
    .catch(async (error) => {
      activePool = null;
      connectionPromise = null;

      try {
        await pool.close();
      } catch {
        // The connection attempt already failed; closing is best effort only.
      }

      throw new AppError('Database connection is unavailable', {
        code: 'DATABASE_UNAVAILABLE',
        statusCode: 503,
        cause: error,
      });
    });
}

async function getPool() {
  if (activePool?.connected) return activePool;

  if (!connectionPromise) {
    connectionPromise = createConnectionPromise();
  }

  return connectionPromise;
}

async function closePool() {
  const pendingConnection = connectionPromise;
  const pool = activePool;

  connectionPromise = null;
  activePool = null;

  if (pool) {
    await pool.close();
    return;
  }

  if (pendingConnection) {
    try {
      const pendingPool = await pendingConnection;
      await pendingPool.close();
    } catch {
      // A failed connection has no reusable pool to close.
    }
  }
}

module.exports = {
  getPool,
  closePool,
};
