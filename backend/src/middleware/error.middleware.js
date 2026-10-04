'use strict';

const { AppError } = require('../utils/app-error');

function normalizeError(error) {
  if (error instanceof SyntaxError && error.type === 'entity.parse.failed') {
    return new AppError('Request body contains invalid JSON', {
      code: 'INVALID_JSON',
      statusCode: 400,
      cause: error,
    });
  }
  if (error?.type === 'entity.too.large') {
    return new AppError('Request body exceeds the configured size limit', {
      code: 'PAYLOAD_TOO_LARGE',
      statusCode: 413,
      cause: error,
    });
  }
  if (error instanceof AppError && error.isOperational) return error;
  return new AppError('An unexpected error occurred', {
    code: 'INTERNAL_SERVER_ERROR',
    statusCode: 500,
    cause: error,
  });
}

function errorPayload(error) {
  return {
    success: false,
    error: {
      code: error.code,
      message: error.message,
    },
  };
}

function notFoundHandler(request, response) {
  const error = new AppError(`Route ${request.method} ${request.path} was not found`, {
    code: 'NOT_FOUND',
    statusCode: 404,
  });
  response.status(error.statusCode).json(errorPayload(error));
}

function logUnexpectedError(error, request, logger = console) {
  if (
    (error instanceof AppError && error.isOperational)
    || (error instanceof SyntaxError && error.type === 'entity.parse.failed')
    || error?.type === 'entity.too.large'
  ) return;
  logger.error(JSON.stringify({
    event: 'UNEXPECTED_REQUEST_ERROR',
    method: request.method,
    path: request.path,
    requestId: request.requestId,
  }));
}

function errorHandler(error, request, response, _next) {
  logUnexpectedError(error, request);
  const normalizedError = normalizeError(error);
  if (normalizedError.statusCode === 401) {
    response.set('WWW-Authenticate', 'Bearer');
  }
  response.status(normalizedError.statusCode).json(errorPayload(normalizedError));
}

module.exports = {
  notFoundHandler,
  errorHandler,
  errorPayload,
  logUnexpectedError,
  normalizeError,
};
