'use strict';

class AppError extends Error {
  constructor(message, { code = 'INTERNAL_SERVER_ERROR', statusCode = 500, cause } = {}) {
    super(message, { cause });
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

module.exports = {
  AppError,
};
