import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const location = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    return entry.isDirectory() ? listFiles(location) : [location];
  });
}

function getHeaderMap(rule) {
  return new Map(rule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
}

function parseCsp(value) {
  return new Map(value.split(';').map((part) => {
    const [name, ...sources] = part.trim().split(/\s+/);
    return [name, sources];
  }));
}

test('Vercel applies frontend security headers to every SPA and asset route', () => {
  assert.ok(Array.isArray(config.headers));
  assert.equal(config.headers.length, 1);
  assert.equal(config.headers[0].source, '/(.*)');

  const headers = getHeaderMap(config.headers[0]);
  assert.equal(headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
  assert.doesNotMatch(headers.get('strict-transport-security'), /preload/i);
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('referrer-policy'), 'no-referrer');
  assert.equal(
    headers.get('permissions-policy'),
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  );
  assert.equal(headers.get('x-permitted-cross-domain-policies'), 'none');
});

test('CSP is restrictive while allowing only required API, font and image sources', () => {
  const headers = getHeaderMap(config.headers[0]);
  const rawCsp = headers.get('content-security-policy');
  assert.ok(rawCsp);
  const csp = parseCsp(rawCsp);

  assert.deepEqual(csp.get('default-src'), ["'self'"]);
  assert.deepEqual(csp.get('base-uri'), ["'self'"]);
  assert.deepEqual(csp.get('object-src'), ["'none'"]);
  assert.deepEqual(csp.get('frame-ancestors'), ["'none'"]);
  assert.deepEqual(csp.get('form-action'), ["'self'"]);
  assert.deepEqual(csp.get('script-src'), ["'self'"]);
  assert.deepEqual(csp.get('style-src'), ["'self'", 'https://fonts.googleapis.com']);
  assert.deepEqual(csp.get('font-src'), ["'self'", 'data:', 'https://fonts.gstatic.com']);
  assert.deepEqual(csp.get('img-src'), ["'self'", 'data:', 'blob:', 'https:']);
  assert.deepEqual(csp.get('connect-src'), [
    "'self'",
    'https://convenience-store-api-5bjd.onrender.com',
  ]);

  assert.doesNotMatch(rawCsp, /(?:^|\s)\*(?:\s|;|$)/);
  assert.doesNotMatch(rawCsp, /'unsafe-eval'/);
  assert.doesNotMatch(rawCsp, /'unsafe-inline'/);
  assert.equal(csp.has('style-src-attr'), false);
});

test('SPA rewrite remains available after adding headers', () => {
  assert.deepEqual(config.rewrites, [
    { source: '/(.*)', destination: '/index.html' },
  ]);
});

test('frontend source does not require inline script or style CSP exceptions', () => {
  const sourceRoot = new URL('../src/', import.meta.url);
  const runtimeFiles = listFiles(sourceRoot)
    .filter((file) => /\.(?:js|jsx)$/.test(file.pathname));

  for (const file of runtimeFiles) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(source, /\bstyle\s*=/);
    assert.doesNotMatch(source, /\beval\s*\(|\bnew\s+Function\b/);
  }
});
