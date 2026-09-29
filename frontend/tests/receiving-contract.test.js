import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLinePayload,
  buildReceiptPayload,
  lineToForm,
  receiptToForm,
  validateLineForm,
  validateReceiptForm,
} from '../src/pages/warehouse/receivingForms.js';
import {
  buildReceiptActionPath,
  buildReceiptLinePath,
  buildReceiptListPath,
  buildReceiptPath,
  buildReceivingLookupPath,
} from '../src/services/receivingQuery.js';

test('receiving paths use only the exact C23 routes and supported filters', () => {
  assert.equal(
    buildReceiptListPath({ page: 2, pageSize: 10, search: 'PN24', status: 'DRAFT', supplierId: 'ignored' }),
    '/warehouse/receiving/receipts?page=2&pageSize=10&search=PN24&status=DRAFT',
  );
  assert.equal(buildReceiptPath('PN/24'), '/warehouse/receiving/receipts/PN%2F24');
  assert.equal(
    buildReceiptLinePath('PN/24', '42'),
    '/warehouse/receiving/receipts/PN%2F24/lines/42',
  );
  assert.equal(
    buildReceivingLookupPath('products', { page: 1, pageSize: 100, search: 'Sữa', status: 'ACTIVE' }),
    '/warehouse/receiving/products?page=1&pageSize=100&search=S%E1%BB%AFa',
  );
  assert.equal(
    buildReceiptActionPath('PN24', 'confirm'),
    '/warehouse/receiving/receipts/PN24/confirm',
  );
  assert.throws(() => buildReceiptActionPath('PN24', 'delete'));
});

test('receipt header payload uses supplier, ISO date-time and nullable note only', () => {
  const form = {
    supplierId: 'NCC01',
    receivedAt: '2026-09-28T08:30',
    note: '  Hàng giao đủ  ',
  };
  assert.deepEqual(validateReceiptForm(form), {});
  assert.deepEqual(buildReceiptPayload(form), {
    supplierId: 'NCC01',
    receivedAt: new Date('2026-09-28T08:30').toISOString(),
    note: 'Hàng giao đủ',
  });
  assert.equal(Object.hasOwn(buildReceiptPayload(form), 'receiptId'), false);
  assert.equal(Object.hasOwn(buildReceiptPayload(form), 'employeeId'), false);
  assert.equal(Object.hasOwn(buildReceiptPayload(form), 'total'), false);
});

test('receipt line payload matches C23 and never sends calculated inventory fields', () => {
  const form = {
    productId: 'SP01',
    manufacturerLot: ' LOT-24 ',
    manufactureDate: '2026-09-01',
    expiryDate: '2027-09-01',
    quantity: '5',
    unitCost: '12500.50',
  };
  assert.deepEqual(validateLineForm(form), {});
  const payload = buildLinePayload(form);
  assert.deepEqual(payload, {
    productId: 'SP01',
    manufacturerLot: 'LOT-24',
    manufactureDate: '2026-09-01',
    expiryDate: '2027-09-01',
    quantity: 5,
    unitCost: 12500.5,
  });
  assert.equal(Object.hasOwn(payload, 'lotId'), false);
  assert.equal(Object.hasOwn(payload, 'lineTotal'), false);
  assert.equal(Object.hasOwn(payload, 'stock'), false);
});

test('receiving validation rejects invalid quantity, cost and date relation', () => {
  const errors = validateLineForm({
    productId: '',
    manufacturerLot: '',
    manufactureDate: '2027-01-02',
    expiryDate: '2027-01-01',
    quantity: '0',
    unitCost: '-1',
  });
  assert.ok(errors.productId);
  assert.ok(errors.manufacturerLot);
  assert.ok(errors.quantity);
  assert.ok(errors.unitCost);
  assert.ok(errors.expiryDate);
});

test('receipt and line form hydration follows the C23 response fields', () => {
  const receiptForm = receiptToForm({
    supplier: { supplierId: 'NCC01' },
    receivedAt: '2026-09-28T08:30:00.000Z',
    note: null,
  });
  assert.equal(receiptForm.supplierId, 'NCC01');
  assert.match(receiptForm.receivedAt, /^2026-09-28T\d{2}:30$/);
  assert.equal(receiptForm.note, '');

  assert.deepEqual(lineToForm({
    product: { productId: 'SP01' },
    manufacturerLot: 'LOT-24',
    manufactureDate: null,
    expiryDate: '2027-09-01',
    quantity: 5,
    unitCost: 12500.5,
  }), {
    productId: 'SP01',
    manufacturerLot: 'LOT-24',
    manufactureDate: '',
    expiryDate: '2027-09-01',
    quantity: '5',
    unitCost: '12500.5',
  });
});
