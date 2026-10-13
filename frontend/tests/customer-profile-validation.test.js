import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ApiError } from '../src/api/errors.js';
import {
  CUSTOMER_PROFILE_SUCCESS_MESSAGE,
  normalizeCustomerProfilePayload,
  submitCustomerProfileForm,
  validateCustomerProfileForm,
} from '../src/pages/customer/customerProfileForm.js';

const validForm = Object.freeze({
  address: '  10 Đường A  ',
  email: '  CUSTOMER@Example.COM  ',
  fullName: '  Nguyễn   Văn A  ',
});

const profilePageSource = readFileSync(
  new URL('../src/pages/CustomerProfilePage.jsx', import.meta.url),
  'utf8',
);
const formFieldSource = readFileSync(
  new URL('../src/components/FormField.jsx', import.meta.url),
  'utf8',
);

test('blank and whitespace-only full names are rejected before the API call', async () => {
  for (const fullName of ['', '   ']) {
    let calls = 0;
    const result = await submitCustomerProfileForm(
      { ...validForm, fullName },
      async () => { calls += 1; },
    );

    assert.equal(result.fieldErrors.fullName, 'Họ và tên không được để trống.');
    assert.equal(result.globalError, null);
    assert.equal(calls, 0);
  }
});

test('full name longer than 100 characters is rejected', () => {
  const errors = validateCustomerProfileForm({ ...validForm, fullName: 'a'.repeat(101) });
  assert.equal(errors.fullName, 'Họ và tên không được vượt quá 100 ký tự.');
});

test('malformed email variants receive the email field error', () => {
  for (const email of ['abc', 'a@']) {
    const errors = validateCustomerProfileForm({ ...validForm, email });
    assert.equal(errors.email, 'Email không đúng định dạng.');
  }
});

test('optional empty email is accepted and normalized to null', () => {
  const form = { ...validForm, email: ' ' };
  assert.deepEqual(validateCustomerProfileForm(form), {});
  assert.equal(normalizeCustomerProfilePayload(form).email, null);
});

test('overlong email and address receive their own field errors', () => {
  const errors = validateCustomerProfileForm({
    ...validForm,
    address: 'a'.repeat(256),
    email: `${'a'.repeat(89)}@example.com`,
  });
  assert.equal(errors.email, 'Email không được vượt quá 100 ký tự.');
  assert.equal(errors.address, 'Địa chỉ không được vượt quá 255 ký tự.');
});

test('valid profile payload is normalized only at submission time', () => {
  assert.deepEqual(normalizeCustomerProfilePayload(validForm), {
    address: '10 Đường A',
    email: 'customer@example.com',
    fullName: 'Nguyễn Văn A',
  });
  assert.equal(validForm.fullName, '  Nguyễn   Văn A  ');
});

test('duplicate email is attached to email and the entered form remains unchanged', async () => {
  const enteredForm = { ...validForm };
  const result = await submitCustomerProfileForm(enteredForm, async () => {
    throw new ApiError('conflict', { code: 'PROFILE_CONFLICT', status: 409 });
  });

  assert.deepEqual(result.fieldErrors, {
    email: 'Email này đã được sử dụng bởi tài khoản khác.',
  });
  assert.equal(result.globalError, null);
  assert.equal(result.profile, null);
  assert.deepEqual(enteredForm, validForm);
});

test('network error remains global without fabricated field errors', async () => {
  const result = await submitCustomerProfileForm(validForm, async () => {
    throw new ApiError('offline', { code: 'NETWORK_ERROR' });
  });

  assert.deepEqual(result.fieldErrors, {});
  assert.equal(
    result.globalError,
    'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối.',
  );
  assert.equal(result.profile, null);
});

test('successful update returns the saved profile and success notice text', async () => {
  const savedProfile = {
    customerId: 'KH001',
    fullName: 'Nguyễn Văn A',
    phone: '0900000001',
    loyaltyPoints: 25,
    membershipTier: 'BRONZE',
  };
  let receivedPayload;
  const result = await submitCustomerProfileForm(validForm, async (payload) => {
    receivedPayload = payload;
    return savedProfile;
  });

  assert.deepEqual(receivedPayload, {
    address: '10 Đường A',
    email: 'customer@example.com',
    fullName: 'Nguyễn Văn A',
  });
  assert.deepEqual(result.fieldErrors, {});
  assert.equal(result.globalError, null);
  assert.equal(result.profile, savedProfile);
  assert.equal(result.successMessage, CUSTOMER_PROFILE_SUCCESS_MESSAGE);
});

test('profile page applies successful data and associates field errors accessibly', () => {
  assert.match(profilePageSource, /applyProfile\(result\.profile\)/);
  assert.match(profilePageSource, /setSuccess\(result\.successMessage\)/);
  assert.match(profilePageSource, /<Notice tone="success">\{success\}<\/Notice>/);
  assert.match(profilePageSource, /error=\{fieldErrors\.fullName\}/);
  assert.match(profilePageSource, /error=\{fieldErrors\.email\}/);
  assert.match(profilePageSource, /error=\{fieldErrors\.address\}/);
  assert.match(profilePageSource, /aria-invalid=\{Boolean\(fieldErrors\.email\)\}/);
  assert.match(formFieldSource, /id=\{`\$\{htmlFor\}-error`\} role="alert"/);
});
