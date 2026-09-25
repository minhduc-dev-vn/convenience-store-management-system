'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { getPool } = require('../config/database.pool');
const { AppError } = require('./app-error');

async function withTransaction(work, options = {}) {
  if (typeof work !== 'function') {
    throw new TypeError('Transaction work must be a function');
  }

  const poolProvider = options.poolProvider || getPool;
  const pool = await poolProvider();
  let sql = options.sqlDriver;

  if (!sql) {
    const driverName = options.driverName || getDatabaseSettings().driver;
    sql = getSqlDriver(driverName);
  }
  const transactionFactory = options.transactionFactory || ((connectionPool) => new sql.Transaction(connectionPool));
  const isolationLevel = options.isolationLevel || sql.ISOLATION_LEVEL.READ_COMMITTED;
  const transaction = transactionFactory(pool);
  let hasBegun = false;

  try {
    await transaction.begin(isolationLevel);
    hasBegun = true;

    const result = await work(transaction);
    await transaction.commit();
    hasBegun = false;
    return result;
  } catch (error) {
    if (hasBegun) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        throw new AppError('Transaction failed and could not be rolled back', {
          code: 'TRANSACTION_ROLLBACK_FAILED',
          statusCode: 500,
          cause: new AggregateError([error, rollbackError]),
        });
      }
    }

    throw error;
  }
}

module.exports = {
  withTransaction,
};
