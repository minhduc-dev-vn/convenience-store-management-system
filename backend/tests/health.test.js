'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const app = require('../src/app');

async function startTestServer(testContext) {
  const server = app.listen(0);
  await once(server, 'listening');

  testContext.after(
    () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  );

  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

test('GET /api/health returns process health without a database', async (testContext) => {
  const baseUrl = await startTestServer(testContext);
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.status, 'ok');
  assert.equal(typeof body.data.timestamp, 'string');
  assert.equal(typeof body.data.uptimeSeconds, 'number');
});

test('unknown routes return the standard JSON error response', async (testContext) => {
  const baseUrl = await startTestServer(testContext);
  const response = await fetch(`${baseUrl}/api/unknown`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(body, {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route GET /api/unknown was not found',
    },
  });
});
