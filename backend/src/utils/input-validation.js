'use strict';

const { AppError } = require('./app-error');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9]{9,15}$/;

function validationError(message) {
  return new AppError(message, {
    code: 'VALIDATION_ERROR',
    statusCode: 400,
  });
}

function requireString(value, fieldName, { maxLength, minLength = 1 } = {}) {
  if (typeof value !== 'string') {
    throw validationError(`${fieldName} must be a string`);
  }

  const normalized = value.trim();
  if (normalized.length < minLength) {
    throw validationError(`${fieldName} is required`);
  }

  if (maxLength && normalized.length > maxLength) {
    throw validationError(`${fieldName} must not exceed ${maxLength} characters`);
  }

  return normalized;
}

function normalizeFullName(value) {
  return requireString(value, 'fullName', { maxLength: 100 }).replace(/\s+/g, ' ');
}

function normalizePhone(value) {
  const phone = requireString(value, 'phone', { maxLength: 15 });
  if (!PHONE_PATTERN.test(phone)) {
    throw validationError('phone must contain 9 to 15 digits and may start with +');
  }

  return phone;
}

function normalizeEmail(value, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw validationError('email is required');
    return null;
  }

  const email = requireString(value, 'email', { maxLength: 100 }).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw validationError('email must be a valid email address');
  }

  return email;
}

function normalizeOptionalText(value, fieldName, maxLength) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return requireString(value, fieldName, { maxLength });
}

function normalizeDate(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError(`${fieldName} must use YYYY-MM-DD format`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isExactDate = parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;

  if (!isExactDate || parsed > new Date()) {
    throw validationError(`${fieldName} must be a valid date that is not in the future`);
  }

  return value;
}

function normalizePassword(value, fieldName = 'password') {
  if (typeof value !== 'string' || value.length < 6) {
    throw validationError(`${fieldName} must contain at least 6 characters`);
  }

  if (Buffer.byteLength(value, 'utf8') > 72) {
    throw validationError(`${fieldName} must not exceed 72 UTF-8 bytes`);
  }

  return value;
}

function assertPasswordsMatch(password, confirmation, confirmationField) {
  if (password !== confirmation) {
    throw validationError(`${confirmationField} does not match`);
  }
}

module.exports = {
  assertPasswordsMatch,
  normalizeDate,
  normalizeEmail,
  normalizeFullName,
  normalizeOptionalText,
  normalizePassword,
  normalizePhone,
  requireString,
  validationError,
};
