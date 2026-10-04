'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const { EXAMPLE_JWT_SECRET, getAuthSettings } = require('../src/config/auth.config');
const { getSecuritySettings } = require('../src/config/security.config');
const { createApp } = require('../src/app');

async function startTestServer(testContext, securitySettings) {
  const app = createApp({ securitySettings });
  const server = app.listen(0);
  await once(server, 'listening');
  testContext.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

const SETTINGS = Object.freeze({
  allowedOrigins: Object.freeze(['https://portal.example.test']),
  bodyLimit: '256b',
  enableHsts: true,
  trustProxy: false,
});

test('security headers, request id and allowlisted CORS are applied', async (testContext) => {
  const baseUrl = await startTestServer(testContext, SETTINGS);
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'https://portal.example.test' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://portal.example.test');
  assert.match(response.headers.get('vary'), /Origin/);
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=15552000; includeSubDomains');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('x-request-id'), /^[0-9a-f-]{36}$/i);
  assert.equal(response.headers.has('x-powered-by'), false);
});

test('CORS preflight succeeds only for an exact allowlisted origin', async (testContext) => {
  const baseUrl = await startTestServer(testContext, SETTINGS);
  let response = await fetch(`${baseUrl}/api/health`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://portal.example.test' },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET,HEAD,POST,PATCH,DELETE,OPTIONS');
  assert.equal(response.headers.get('access-control-allow-headers'), 'Authorization,Content-Type');

  response = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'https://attacker.example.test' },
  });
  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.deepEqual(payload, {
    success: false,
    error: {
      code: 'ORIGIN_NOT_ALLOWED',
      message: 'The request origin is not allowed',
    },
  });
  assert.equal(response.headers.has('access-control-allow-origin'), false);
});

test('request body limit and not-found response do not reflect sensitive input', async (testContext) => {
  const baseUrl = await startTestServer(testContext, SETTINGS);
  let response = await fetch(`${baseUrl}/api/auth/login`, {
    body: JSON.stringify({ identifier: 'user', password: 'x'.repeat(400) }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  assert.equal(response.status, 413);
  let payload = await response.json();
  assert.equal(payload.error.code, 'PAYLOAD_TOO_LARGE');
  assert.doesNotMatch(JSON.stringify(payload), /xxxx/);

  response = await fetch(`${baseUrl}/api/not-found?token=query-secret`);
  assert.equal(response.status, 404);
  payload = await response.json();
  assert.equal(payload.error.message, 'Route GET /api/not-found was not found');
  assert.doesNotMatch(JSON.stringify(payload), /query-secret/);
});

test('security environment parser validates exact origins and body limits', () => {
  const previous = {
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
    REQUEST_BODY_LIMIT: process.env.REQUEST_BODY_LIMIT,
    TRUST_PROXY: process.env.TRUST_PROXY,
  };

  try {
    process.env.CORS_ALLOWED_ORIGINS = 'https://one.example.test,https://two.example.test';
    process.env.REQUEST_BODY_LIMIT = '512kb';
    process.env.TRUST_PROXY = 'true';
    const settings = getSecuritySettings();
    assert.deepEqual(settings.allowedOrigins, [
      'https://one.example.test',
      'https://two.example.test',
    ]);
    assert.equal(settings.bodyLimit, '512kb');
    assert.equal(settings.trustProxy, true);

    process.env.CORS_ALLOWED_ORIGINS = 'https://one.example.test/path';
    assert.throws(getSecuritySettings, /HTTP\(S\) origins/);
    process.env.CORS_ALLOWED_ORIGINS = '';
    process.env.REQUEST_BODY_LIMIT = 'unlimited';
    assert.throws(getSecuritySettings, /byte-size value/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('development example JWT is rejected for production startup', () => {
  const previous = {
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  };
  try {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = EXAMPLE_JWT_SECRET;
    assert.throws(getAuthSettings, /replaced before production startup/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
