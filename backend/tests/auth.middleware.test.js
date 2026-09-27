'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ROLES,
  authorize,
  createAuthenticate,
  getBearerToken,
} = require('../src/middleware/auth.middleware');

function runMiddleware(middleware, request) {
  return new Promise((resolve) => {
    middleware(request, {}, (error) => resolve(error ?? null));
  });
}

test('getBearerToken only accepts a non-empty Bearer token', () => {
  assert.equal(getBearerToken('Bearer token-value'), 'token-value');
  assert.equal(getBearerToken('bearer token-value'), 'token-value');
  assert.equal(getBearerToken('Basic token-value'), null);
  assert.equal(getBearerToken('Bearer '), null);
  assert.equal(getBearerToken(undefined), null);
});

test('authenticate resolves server-side identity and rejects a missing token with 401', async () => {
  const identity = { accountId: 7, role: 'MANAGER' };
  const middleware = createAuthenticate({
    async resolveIdentity(token) {
      assert.equal(token, 'signed-token');
      return identity;
    },
  });
  const request = { headers: { authorization: 'Bearer signed-token' } };

  assert.equal(await runMiddleware(middleware, request), null);
  assert.equal(request.auth, identity);

  const missingTokenError = await runMiddleware(middleware, { headers: {} });
  assert.equal(missingTokenError.statusCode, 401);
  assert.equal(missingTokenError.code, 'AUTHENTICATION_REQUIRED');
});

test('authorize enforces the four-role matrix without reading request input', async () => {
  const customerOnly = authorize('CUSTOMER');
  const expected = {
    CUSTOMER: null,
    CASHIER: 403,
    WAREHOUSE: 403,
    MANAGER: 403,
  };

  for (const role of ROLES) {
    const error = await runMiddleware(customerOnly, {
      auth: { role },
      body: { role: 'CUSTOMER' },
      query: { role: 'CUSTOMER' },
    });
    assert.equal(error?.statusCode ?? null, expected[role], role);
  }

  const allRoles = authorize(...ROLES);
  for (const role of ROLES) {
    assert.equal(await runMiddleware(allRoles, { auth: { role } }), null, role);
  }
});
