'use strict';

const crypto = require('node:crypto');
const { AppError } = require('../utils/app-error');

const CORS_METHODS = 'GET,HEAD,POST,PATCH,DELETE,OPTIONS';
const CORS_HEADERS = 'Authorization,Content-Type';

function requestContext(request, response, next) {
  const requestId = crypto.randomUUID();
  request.requestId = requestId;
  response.set('X-Request-Id', requestId);
  next();
}

function createSecurityHeaders({ enableHsts = false } = {}) {
  return function securityHeaders(_request, response, next) {
    response.set({
      'Cross-Origin-Resource-Policy': 'same-site',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-Permitted-Cross-Domain-Policies': 'none',
    });
    if (enableHsts) {
      response.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
  };
}

function createCors({ allowedOrigins = [] } = {}) {
  const allowlist = new Set(allowedOrigins);

  return function cors(request, response, next) {
    const origin = request.get('Origin');
    if (!origin) {
      next();
      return;
    }

    response.vary('Origin');
    if (!allowlist.has(origin)) {
      next(new AppError('The request origin is not allowed', {
        code: 'ORIGIN_NOT_ALLOWED',
        statusCode: 403,
      }));
      return;
    }

    response.set({
      'Access-Control-Allow-Headers': CORS_HEADERS,
      'Access-Control-Allow-Methods': CORS_METHODS,
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Max-Age': '600',
    });

    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }
    next();
  };
}

module.exports = {
  createCors,
  createSecurityHeaders,
  requestContext,
};
