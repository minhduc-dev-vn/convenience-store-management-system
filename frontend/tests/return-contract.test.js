import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ApiError, getErrorMessage } from '../src/api/errors.js';
import {
  buildReturnRequest,
  countSelectedUnits,
  createReturnRows,
  updateReturnRow,
} from '../src/pages/cashier/returnForm.js';

const invoice = {
  invoiceId: 'C38INV001',
  status: 'PAID',
  items: [{
    lineId: '3801',
    name: 'C38 Product',
    productId: 'C38P001',
    unit: 'Cái',
    lotAllocations: [
      {
        lotId: 'C38LOT001',
        manufacturerLot: 'C38-BATCH-1',
        quantityReturned: 1,
        quantityReturnable: 1,
        quantitySold: 2,
      },
      {
        lotId: 'C38LOT002',
        manufacturerLot: 'C38-BATCH-2',
        quantityReturned: 0,
        quantityReturnable: 0,
        quantitySold: 1,
      },
    ],
  }],
};

test('return rows expose persisted sold, returned and returnable quantities by exact lot', () => {
  const rows = createReturnRows(invoice);
  assert.deepEqual(rows, [{
    condition: 'RESALABLE',
    key: '3801:C38LOT001',
    lineId: '3801',
    lotId: 'C38LOT001',
    manufacturerLot: 'C38-BATCH-1',
    productId: 'C38P001',
    productName: 'C38 Product',
    quantity: '',
    quantityReturnable: 1,
    quantityReturned: 1,
    quantitySold: 2,
    unit: 'Cái',
  }]);
});

test('return request sends only the exact C37 contract and no client refund data', () => {
  let rows = createReturnRows(invoice);
  rows = updateReturnRow(rows, rows[0].key, { quantity: '1', condition: 'DAMAGED' });
  const request = buildReturnRequest(invoice.invoiceId, ' Hàng bị móp ', rows);

  assert.deepEqual(request, {
    invoiceId: 'C38INV001',
    reason: 'Hàng bị móp',
    items: [{
      condition: 'DAMAGED',
      lineId: '3801',
      lotId: 'C38LOT001',
      quantity: 1,
    }],
  });
  assert.equal(countSelectedUnits(rows), 1);
  assert.equal(Object.hasOwn(request, 'refundAmount'), false);
  assert.equal(Object.hasOwn(request, 'refundMethod'), false);
});

test('return form rejects empty selection, missing reason and over-return', () => {
  const rows = createReturnRows(invoice);
  assert.throws(
    () => buildReturnRequest(invoice.invoiceId, '', rows),
    /nhập lý do/i,
  );
  assert.throws(
    () => buildReturnRequest(invoice.invoiceId, 'Khách trả hàng', rows),
    /ít nhất một sản phẩm/i,
  );
  assert.throws(
    () => buildReturnRequest(invoice.invoiceId, 'Khách trả hàng', [{ ...rows[0], quantity: '2' }]),
    /không được vượt quá/i,
  );
});

test('return API errors have cashier-facing messages', () => {
  assert.equal(
    getErrorMessage(new ApiError('raw', { code: 'RETURN_QUANTITY_EXCEEDED', status: 409 })),
    'Số lượng trả vượt quá số lượng còn được phép trả.',
  );
  assert.equal(
    getErrorMessage(new ApiError('raw', { code: 'LOYALTY_RETURN_POLICY_UNRESOLVED', status: 409 })),
    'Chưa thể trả hóa đơn đã sử dụng điểm tích lũy.',
  );
});

test('C38 cashier route, menu, C35 handoff and server-authoritative result are wired', () => {
  const routes = readFileSync(new URL('../src/routes/AppRoutes.jsx', import.meta.url), 'utf8');
  const cashierLayout = readFileSync(new URL('../src/layouts/CashierLayout.jsx', import.meta.url), 'utf8');
  const invoiceWorkspace = readFileSync(new URL('../src/components/InvoiceLookupWorkspace.jsx', import.meta.url), 'utf8');
  const returnPage = readFileSync(new URL('../src/pages/cashier/CashierReturnPage.jsx', import.meta.url), 'utf8');
  const returnService = readFileSync(new URL('../src/services/return.service.js', import.meta.url), 'utf8');

  assert.match(routes, /path="returns" element={<CashierReturnPage \/>}/);
  assert.match(routes, /path="returns\/:invoiceId" element={<CashierReturnPage \/>}/);
  assert.match(cashierLayout, /\/cashier\/returns/);
  assert.match(invoiceWorkspace, /navigate\(`\/cashier\/returns\/\$\{encodeURIComponent\(invoice\.invoiceId\)}`\)/);
  assert.match(returnService, /apiClient\.post\('\/returns', returnRequest/);
  assert.match(returnPage, /Máy chủ xác nhận/);
  assert.match(returnPage, /result\.refundAmount/);
  assert.doesNotMatch(returnPage, /refundMethod|clientRefund|estimatedRefund/);
});
