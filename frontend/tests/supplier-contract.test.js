import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSupplierPayload,
  supplierToForm,
  validateSupplierForm,
} from '../src/pages/manager/supplierForms.js';
import {
  buildSupplierDetailPath,
  buildSupplierListPath,
  buildSupplierStatusPath,
} from '../src/services/supplierQuery.js';

const validForm = Object.freeze({
  supplierId: ' NCC01 ',
  name: ' Nhà cung cấp An Tâm ',
  phone: ' 0909000000 ',
  email: ' contact@example.com ',
  address: ' 10 Đường A ',
  taxCode: ' MST-001 ',
  status: 'ACTIVE',
});

test('supplier paths include only fields accepted by C20 routes', () => {
  assert.equal(
    buildSupplierListPath({
      page: 2, pageSize: 10, search: 'An Tâm', status: 'ACTIVE', owner: 'ignored',
    }),
    '/admin/suppliers?page=2&pageSize=10&search=An+T%C3%A2m&status=ACTIVE',
  );
  assert.equal(buildSupplierDetailPath('NCC/01'), '/admin/suppliers/NCC%2F01');
  assert.equal(buildSupplierStatusPath('NCC/01'), '/admin/suppliers/NCC%2F01/status');
});

test('supplier create payload matches the exact C20 contract', () => {
  assert.deepEqual(validateSupplierForm(validForm), {});
  assert.deepEqual(buildSupplierPayload(validForm), {
    supplierId: 'NCC01',
    name: 'Nhà cung cấp An Tâm',
    phone: '0909000000',
    email: 'contact@example.com',
    address: '10 Đường A',
    taxCode: 'MST-001',
    status: 'ACTIVE',
  });
});

test('supplier edit excludes immutable id and status and clears nullable fields', () => {
  const payload = buildSupplierPayload({
    ...validForm, email: '', address: ' ', taxCode: '', status: 'INACTIVE',
  }, { editing: true });
  assert.deepEqual(payload, {
    name: 'Nhà cung cấp An Tâm',
    phone: '0909000000',
    email: null,
    address: null,
    taxCode: null,
  });
  assert.equal(Object.hasOwn(payload, 'supplierId'), false);
  assert.equal(Object.hasOwn(payload, 'status'), false);
});

test('supplier validation follows schema lengths and contact formats', () => {
  const errors = validateSupplierForm({
    ...validForm,
    supplierId: 'TOO-LONG-ID',
    name: '',
    phone: 'invalid',
    email: 'invalid-email',
    address: 'a'.repeat(256),
    taxCode: 'x'.repeat(21),
    status: 'DELETED',
  });
  assert.ok(errors.supplierId);
  assert.ok(errors.name);
  assert.ok(errors.phone);
  assert.ok(errors.email);
  assert.ok(errors.address);
  assert.ok(errors.taxCode);
  assert.ok(errors.status);
});

test('supplier form is hydrated from the exact C20 detail response', () => {
  assert.deepEqual(supplierToForm({
    supplierId: 'NCC01',
    name: 'Nhà cung cấp An Tâm',
    phone: '0909000000',
    email: null,
    address: null,
    taxCode: null,
    status: 'INACTIVE',
  }), {
    supplierId: 'NCC01',
    name: 'Nhà cung cấp An Tâm',
    phone: '0909000000',
    email: '',
    address: '',
    taxCode: '',
    status: 'INACTIVE',
  });
});
