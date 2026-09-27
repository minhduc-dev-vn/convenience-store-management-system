'use strict';

const { AuthService } = require('../services/auth.service');
const { AppError } = require('../utils/app-error');

const ROLES = Object.freeze(['CUSTOMER', 'CASHIER', 'WAREHOUSE', 'MANAGER']);
const authService = new AuthService();

function getBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== 'string') return null;
  const match = authorizationHeader.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

function createAuthenticate(service = authService) {
  return async function authenticate(request, _response, next) {
    const token = getBearerToken(request.headers.authorization);
    if (!token) {
      next(new AppError('A Bearer access token is required', {
        code: 'AUTHENTICATION_REQUIRED',
        statusCode: 401,
      }));
      return;
    }

    try {
      request.auth = await service.resolveIdentity(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function authorize(...allowedRoles) {
  if (allowedRoles.length === 0 || allowedRoles.some((role) => !ROLES.includes(role))) {
    throw new TypeError('authorize requires one or more supported roles');
  }

  const allowed = new Set(allowedRoles);
  return function roleAuthorization(request, _response, next) {
    if (!request.auth) {
      next(new AppError('Authentication is required before authorization', {
        code: 'AUTHENTICATION_REQUIRED',
        statusCode: 401,
      }));
      return;
    }

    if (!allowed.has(request.auth.role)) {
      next(new AppError('You do not have permission to access this resource', {
        code: 'FORBIDDEN',
        statusCode: 403,
      }));
      return;
    }

    next();
  };
}

module.exports = {
  ROLES,
  authenticate: createAuthenticate(),
  authorize,
  createAuthenticate,
  getBearerToken,
};
