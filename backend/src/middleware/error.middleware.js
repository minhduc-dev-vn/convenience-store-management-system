'use strict';

const { AppError } = require('../utils/app-error');

function notFoundHandler(request, response) {
  response.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${request.method} ${request.originalUrl} was not found`,
    },
  });
}

function errorHandler(error, _request, response, _next) {
  const isOperational = error instanceof AppError && error.isOperational;

  response.status(isOperational ? error.statusCode : 500).json({
    success: false,
    error: {
      code: isOperational ? error.code : 'INTERNAL_SERVER_ERROR',
      message: isOperational ? error.message : 'An unexpected error occurred',
    },
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
