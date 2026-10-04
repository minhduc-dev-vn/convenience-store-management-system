import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  canStartInvoiceReturn,
  calculateShiftDifference,
  countReturnableUnits,
  invoiceStatusLabel,
} from '../src/components/invoicePresentation.js';
import {
  buildInvoiceDetailPath,
  buildInvoiceListPath,
} from '../src/services/invoiceQuery.js';
import {
  buildCloseShiftPath,
  buildShiftReconciliationPath,
} from '../src/services/posQuery.js';

test('invoice paths match the C34 search and detail contracts', () => {
  assert.equal(
    buildInvoiceListPath({
      cashierId: 'NV 01',
      from: '2026-10-01',
      invoiceId: 'HD/01',
      page: 2,
      pageSize: 10,
      status: 'PAID',
      to: '2026-10-02',
    }),
    '/invoices?page=2&pageSize=10&invoiceId=HD%2F01&from=2026-10-01&to=2026-10-02&cashierId=NV+01',
  );
  assert.equal(buildInvoiceDetailPath('HD/01'), '/invoices/HD%2F01');
  assert.throws(() => buildInvoiceDetailPath('  '));
});

test('shift reconciliation and close paths encode the server-owned shift id', () => {
  assert.equal(buildShiftReconciliationPath('12/3'), '/pos/shifts/12%2F3/reconciliation');
  assert.equal(buildCloseShiftPath(12), '/pos/shifts/12/close');
  assert.throws(() => buildCloseShiftPath(''));
});

test('return entry is available only for finalized invoices with returnable quantity', () => {
  const invoice = {
    status: 'PAID',
    items: [
      { quantityReturnable: 2 },
      { quantityReturnable: 1 },
    ],
  };
  assert.equal(countReturnableUnits(invoice), 3);
  assert.equal(canStartInvoiceReturn(invoice), true);
  assert.equal(canStartInvoiceReturn({ ...invoice, status: 'DRAFT' }), false);
  assert.equal(canStartInvoiceReturn({ ...invoice, status: 'REFUNDED' }), false);
  assert.equal(canStartInvoiceReturn({ status: 'REFUNDED', items: [{ quantityReturnable: 0 }] }), false);
  assert.equal(invoiceStatusLabel('PAID'), 'Đã thanh toán');
});

test('cash difference is calculated from server expected cash', () => {
  assert.equal(calculateShiftDifference('1250000', 1200000), 50000);
  assert.equal(calculateShiftDifference('1199999.99', 1200000), -0.01);
  assert.equal(calculateShiftDifference('-1', 1200000), null);
  assert.equal(calculateShiftDifference('abc', 1200000), null);
});

test('C35 routes, role menus and print regions are wired without invoice mutation', () => {
  const routes = readFileSync(new URL('../src/routes/AppRoutes.jsx', import.meta.url), 'utf8');
  const navigation = readFileSync(new URL('../src/layouts/navigation.js', import.meta.url), 'utf8');
  const workspace = readFileSync(new URL('../src/components/InvoiceLookupWorkspace.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/assets/app.css', import.meta.url), 'utf8');

  assert.match(routes, /path="invoices" element={<ManagerInvoiceLookupPage \/>}/);
  assert.match(routes, /path="invoices" element={<CashierInvoiceLookupPage \/>}/);
  assert.match(navigation, /\/cashier\/invoices/);
  assert.match(navigation, /\/manager\/invoices/);
  assert.match(workspace, /Chọn để xử lý đổi\/trả/);
  assert.doesNotMatch(workspace, /apiClient\.(post|patch|put|delete)/);
  assert.match(css, /\.invoice-print-area/);
  assert.match(css, /\.shift-handoff-print-area/);
});
