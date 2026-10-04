'use strict';

require('./env');

const BODY_LIMIT_PATTERN = /^\d+(?:\.\d+)?(?:b|kb|mb|gb)$/i;

function readBoolean(name, fallback) {
  const rawValue = process.env[name]?.trim().toLowerCase();
  if (!rawValue) return fallback;
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  throw new Error(`${name} must be either true or false`);
}

function readAllowedOrigins() {
  const value = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (!value) return [];

  const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean);
  for (const origin of origins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('CORS_ALLOWED_ORIGINS must contain valid absolute origins');
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error('CORS_ALLOWED_ORIGINS must contain comma-separated HTTP(S) origins');
    }
  }

  return [...new Set(origins)];
}

function readBodyLimit() {
  const value = process.env.REQUEST_BODY_LIMIT?.trim() || '1mb';
  if (!BODY_LIMIT_PATTERN.test(value)) {
    throw new Error('REQUEST_BODY_LIMIT must be a byte-size value such as 256kb or 1mb');
  }
  return value.toLowerCase();
}

function getSecuritySettings() {
  return Object.freeze({
    allowedOrigins: Object.freeze(readAllowedOrigins()),
    bodyLimit: readBodyLimit(),
    enableHsts: (process.env.NODE_ENV || 'development') === 'production',
    trustProxy: readBoolean('TRUST_PROXY', false),
  });
}

module.exports = {
  getSecuritySettings,
};
