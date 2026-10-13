'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { getPool } = require('../config/database.pool');
const { AppError } = require('./app-error');

const INACTIVE_TRANSACTION_ERROR_CODES = new Set(['EABORT', 'ENOTBEGUN']);

function isInactiveTransactionError(error) {
  return INACTIVE_TRANSACTION_ERROR_CODES.has(error?.code);
}

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
  let rollbackObserved = false;
  const observeRollback = () => {
    rollbackObserved = true;
    hasBegun = false;
  };

  transaction.on?.('rollback', observeRollback);

  try {
    await transaction.begin(isolationLevel);
    hasBegun = true;

    const result = await work(transaction);
    await transaction.commit();
    hasBegun = false;
    return result;
  } catch (error) {
    if (hasBegun && !rollbackObserved) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        // node-mssql emits rollback(true) when XACT_ABORT or a stored procedure
        // has already rolled back the server-side transaction. Depending on the
        // event/request timing, a follow-up rollback can also report EABORT or
        // ENOTBEGUN. In both cases there is no active transaction left to clean
        // up, so keep the original SQL/application error available for mapping.
        if (rollbackObserved || isInactiveTransactionError(rollbackError)) {
          throw error;
        }
        throw new AppError('Transaction failed and could not be rolled back', {
          code: 'TRANSACTION_ROLLBACK_FAILED',
          statusCode: 500,
          cause: new AggregateError([error, rollbackError]),
        });
      }
    }

    throw error;
  } finally {
    transaction.removeListener?.('rollback', observeRollback);
  }
}

module.exports = {
  isInactiveTransactionError,
  withTransaction,
};
