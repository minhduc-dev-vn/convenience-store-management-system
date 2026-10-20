'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const app = require('../src/app');

async function startTestServer(testContext) {
  const server = app.listen(0);
  await once(server, 'listening');
  testContext.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('auth request validation rejects client-supplied role before data access', async (testContext) => {
  const baseUrl = await startTestServer(testContext);
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Boundary Test',
      phone: '0900000000',
      password: 'sample-password',
      passwordConfirmation: 'sample-password',
      role: 'MANAGER',
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});

test('protected routes return standardized 401 and customer RBAC is not client-controlled', async (testContext) => {
  const baseUrl = await startTestServer(testContext);
  const response = await fetch(`${baseUrl}/api/customers/me?role=CUSTOMER`);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('www-authenticate'), 'Bearer');
  assert.equal(body.error.code, 'AUTHENTICATION_REQUIRED');
});

test('forgot-password route is intentionally not implemented', async (testContext) => {
  const baseUrl = await startTestServer(testContext);
  const response = await fetch(`${baseUrl}/api/auth/forgot-password`, { method: 'POST' });
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});
