import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAccountPayload,
  buildEmployeePayload,
  EMPLOYEE_ROLES,
  validateAccountForm,
  validateEmployeeForm,
  validateResetPasswordForm,
} from '../src/pages/manager/adminForms.js';
import { buildAdminQuery, encodeAdminId } from '../src/services/adminQuery.js';

test('admin query only includes allowed non-empty filters', () => {
  const query = buildAdminQuery(
    { page: 2, pageSize: 10, search: 'Nguyễn An', status: '', secret: 'ignored' },
    ['page', 'pageSize', 'search', 'status'],
  );
  assert.equal(query, '?page=2&pageSize=10&search=Nguy%E1%BB%85n+An');
});

test('admin account identifiers accept integer API values', () => {
  assert.equal(encodeAdminId(42, 'accountId'), '42');
  assert.equal(encodeAdminId(' NV 01 ', 'employeeId'), 'NV%2001');
  assert.throws(() => encodeAdminId('', 'accountId'), /non-empty/);
});

test('employee payload follows the C11 contract without inventing fields', () => {
  const form = {
    fullName: ' Nguyễn An ', gender: 'MALE', dateOfBirth: '1995-01-10',
    phone: ' 0909000000 ', email: '', address: '', startDate: '2026-01-01',
    baseSalary: '8000000', status: 'ACTIVE',
  };
  assert.deepEqual(validateEmployeeForm(form), {});
  assert.deepEqual(buildEmployeePayload(form), {
    fullName: 'Nguyễn An', dateOfBirth: '1995-01-10', gender: 'MALE',
    phone: '0909000000', email: null, address: null, startDate: '2026-01-01',
    baseSalary: 8000000, status: 'ACTIVE',
  });
});

test('account owner and role combinations follow project role codes', () => {
  assert.deepEqual(EMPLOYEE_ROLES, ['CASHIER', 'WAREHOUSE', 'MANAGER']);
  assert.equal(EMPLOYEE_ROLES.includes('INVENTORY'), false);

  const invalidCustomer = {
    ownerType: 'CUSTOMER', ownerId: 'KH001', username: 'customer1', role: 'WAREHOUSE',
    password: 'secret12', passwordConfirmation: 'secret12',
  };
  assert.equal(validateAccountForm(invalidCustomer).role, 'Tài khoản khách hàng chỉ dùng role CUSTOMER.');

  const validEmployee = { ...invalidCustomer, ownerType: 'EMPLOYEE', ownerId: 'NV001' };
  assert.deepEqual(validateAccountForm(validEmployee), {});
  assert.deepEqual(Object.keys(buildAccountPayload(validEmployee)).sort(), [
    'ownerId', 'ownerType', 'password', 'passwordConfirmation', 'role', 'username',
  ]);
});

test('reset password requires confirmation and does not add a force-change flag', () => {
  const payload = { newPassword: 'temporary12', newPasswordConfirmation: 'temporary12' };
  assert.deepEqual(validateResetPasswordForm(payload), {});
  assert.equal(Object.hasOwn(payload, 'mustChangePassword'), false);
  assert.ok(validateResetPasswordForm({ ...payload, newPasswordConfirmation: 'different' }).newPasswordConfirmation);
});
