'use strict';

const { AppError } = require('../utils/app-error');
const { BaseRepository } = require('./base.repository');

class DatabaseRepository extends BaseRepository {
  async checkConnection() {
    try {
      const result = await this.query({
        text: 'SELECT CAST(1 AS BIT) AS IsHealthy',
      });

      return Boolean(result.recordset[0]?.IsHealthy);
    } catch (error) {
      if (error instanceof AppError) throw error;

      throw new AppError('Database connection is unavailable', {
        code: 'DATABASE_UNAVAILABLE',
        statusCode: 503,
        cause: error,
      });
    }
  }
}

module.exports = {
  DatabaseRepository,
};
