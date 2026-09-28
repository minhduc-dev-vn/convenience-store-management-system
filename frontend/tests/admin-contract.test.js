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
import {
  buildAdminQuery,
  buildCustomerAccountStatusPath,
  buildCustomerDetailPath,
  buildCustomerInvoiceDetailPath,
  buildCustomerInvoicesPath,
  buildCustomerListPath,
  encodeAdminId,
} from '../src/services/adminQuery.js';
import {
  getCustomerAccountTransition,
  MEMBERSHIP_TIER_LABELS,
  validateHistoryDateRange,
} from '../src/pages/manager/customerMember.js';

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

test('customer member paths follow the C13 API and ignore unsupported filters', () => {
  assert.equal(
    buildCustomerListPath({
      page: 2,
      pageSize: 10,
      search: 'An 090',
      membershipTier: 'GOLD',
      status: 'ACTIVE',
      loyaltyPoints: 999999,
    }),
    '/admin/customers?page=2&pageSize=10&search=An+090&membershipTier=GOLD&status=ACTIVE',
  );
  assert.equal(buildCustomerDetailPath(' KH 01 '), '/admin/customers/KH%2001');
  assert.equal(
    buildCustomerInvoicesPath('KH01', { page: 1, pageSize: 5, from: '2026-09-01', to: '' }),
    '/admin/customers/KH01/invoices?page=1&pageSize=5&from=2026-09-01',
  );
  assert.equal(
    buildCustomerInvoiceDetailPath('KH01', 'HD/01'),
    '/admin/customers/KH01/invoices/HD%2F01',
  );
  assert.equal(buildCustomerAccountStatusPath('KH01'), '/admin/customers/KH01/account/status');
});

test('MH-21 member labels and account transitions use actual schema values', () => {
  assert.equal(MEMBERSHIP_TIER_LABELS.BRONZE, 'Đồng');
  assert.equal(MEMBERSHIP_TIER_LABELS.DIAMOND, 'Kim cương');
  assert.deepEqual(
    getCustomerAccountTransition({ account: { status: 'ACTIVE' } }),
    { label: 'Khóa tài khoản', nextStatus: 'LOCKED' },
  );
  assert.deepEqual(
    getCustomerAccountTransition({ account: { status: 'LOCKED' } }),
    { label: 'Mở khóa', nextStatus: 'ACTIVE' },
  );
  assert.equal(getCustomerAccountTransition({ account: null }), null);
  assert.equal(validateHistoryDateRange({ from: '2026-09-30', to: '2026-09-01' }).length > 0, true);
  assert.equal(validateHistoryDateRange({ from: '2026-09-01', to: '2026-09-30' }), '');
});
