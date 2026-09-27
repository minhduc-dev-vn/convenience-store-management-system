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
  const isMalformedJson = error instanceof SyntaxError && error.type === 'entity.parse.failed';
  const normalizedError = isMalformedJson
    ? new AppError('Request body contains invalid JSON', {
      code: 'INVALID_JSON',
      statusCode: 400,
      cause: error,
    })
    : error;
  const isOperational = normalizedError instanceof AppError && normalizedError.isOperational;

  if (isOperational && normalizedError.statusCode === 401) {
    response.set('WWW-Authenticate', 'Bearer');
  }

  response.status(isOperational ? normalizedError.statusCode : 500).json({
    success: false,
    error: {
      code: isOperational ? normalizedError.code : 'INTERNAL_SERVER_ERROR',
      message: isOperational ? normalizedError.message : 'An unexpected error occurred',
    },
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
