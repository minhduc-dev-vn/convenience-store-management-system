'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { AppError } = require('../src/utils/app-error');
const {
  errorHandler,
  errorPayload,
  normalizeError,
} = require('../src/middleware/error.middleware');

function responseDouble() {
  return {
    body: null,
    headers: {},
    statusCode: null,
    json(body) { this.body = body; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    status(statusCode) { this.statusCode = statusCode; return this; },
  };
}

test('error normalization keeps operational status/code/message and bearer challenge', () => {
  const response = responseDouble();
  errorHandler(new AppError('Token expired', {
    code: 'TOKEN_EXPIRED', statusCode: 401,
  }), {}, response, () => {});
  assert.equal(response.statusCode, 401);
  assert.equal(response.headers['WWW-Authenticate'], 'Bearer');
  assert.deepEqual(response.body, {
    success: false,
    error: { code: 'TOKEN_EXPIRED', message: 'Token expired' },
  });
});

test('unknown errors are mapped without leaking internals', () => {
  const normalized = normalizeError(new Error('SELECT secret FROM internal_table'));
  assert.equal(normalized.statusCode, 500);
  assert.deepEqual(errorPayload(normalized), {
    success: false,
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' },
  });
});

test('malformed JSON maps to the shared validation response shape', () => {
  const parseError = new SyntaxError('raw parser details');
  parseError.type = 'entity.parse.failed';
  const normalized = normalizeError(parseError);
  assert.equal(normalized.statusCode, 400);
  assert.equal(normalized.code, 'INVALID_JSON');
  assert.equal(normalized.message, 'Request body contains invalid JSON');
});
