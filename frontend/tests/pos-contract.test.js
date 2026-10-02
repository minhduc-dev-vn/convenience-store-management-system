import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  addProductToCart,
  buildQuotePayload,
  removeCartItem,
  updateCartQuantity,
} from '../src/components/pos/cart.js';
import {
  buildCheckoutPayload,
  calculateCashChange,
  checkoutOptionsKey,
  createInvoiceId,
} from '../src/components/pos/checkout.js';
import {
  buildPosBarcodePath,
  buildPosProductSearchPath,
  buildPosReceiptPath,
} from '../src/services/posQuery.js';

const product = Object.freeze({
  availableStock: 3,
  barcode: '893000001',
  name: 'Sản phẩm thử',
  price: 12000,
  productId: 'SP01',
  unit: 'Chai',
});

test('POS paths match C29 search and barcode contracts', () => {
  assert.equal(
    buildPosProductSearchPath({ page: 2, pageSize: 8, search: 'Sữa tươi', status: 'ACTIVE' }),
    '/pos/products?page=2&pageSize=8&search=S%E1%BB%AFa+t%C6%B0%C6%A1i',
  );
  assert.equal(buildPosBarcodePath('893/01'), '/pos/products/barcode/893%2F01');
  assert.equal(buildPosReceiptPath('HD/01'), '/pos/invoices/HD%2F01');
  assert.throws(() => buildPosBarcodePath('  '));
});

test('cart add, quantity update and remove respect sellable stock', () => {
  let cart = addProductToCart([], product);
  assert.equal(cart[0].quantity, 1);
  cart = addProductToCart(cart, product);
  assert.equal(cart[0].quantity, 2);
  cart = updateCartQuantity(cart, 'SP01', '3');
  assert.equal(cart[0].quantity, 3);
  assert.throws(() => addProductToCart(cart, product), /tồn khả dụng/);
  assert.throws(() => updateCartQuantity(cart, 'SP01', '0'));
  assert.deepEqual(removeCartItem(cart, 'SP01'), []);
});

test('quote payload contains only server-authoritative product ids and quantities', () => {
  const cart = [{ ...product, quantity: 2, clientTotal: 1, discount: 999999 }];
  const payload = buildQuotePayload(cart);
  assert.deepEqual(payload, { items: [{ productId: 'SP01', quantity: 2 }] });
  assert.equal(Object.hasOwn(payload.items[0], 'price'), false);
  assert.equal(Object.hasOwn(payload.items[0], 'discount'), false);
  assert.equal(Object.hasOwn(payload.items[0], 'total'), false);
  assert.throws(() => buildQuotePayload([]));
});

test('quote payload adds only optional customer phone and explicit promotion id', () => {
  const payload = buildQuotePayload([{ ...product, quantity: 1 }], {
    customerPhone: ' 0901234567 ',
    promotionId: ' KM01 ',
  });
  assert.deepEqual(payload, {
    customerPhone: '0901234567',
    items: [{ productId: 'SP01', quantity: 1 }],
    promotionId: 'KM01',
  });
  assert.equal(checkoutOptionsKey({ customerPhone: ' 0901234567 ', promotionId: ' KM01 ' }), '0901234567::KM01');
});

test('checkout payload trusts quote total and never sends cash received or client price', () => {
  const cart = [{ ...product, quantity: 2, clientTotal: 1 }];
  const payload = buildCheckoutPayload({
    cart,
    cashReceived: '50000',
    customerPhone: '0901234567',
    externalTransactionId: 'ignored-for-cash',
    invoiceId: 'HDTEST001',
    method: 'CASH',
    note: ' Giao dịch thử ',
    promotionId: 'KM01',
    quote: { totals: { totalAmount: 24000 } },
  });
  assert.deepEqual(payload, {
    customerPhone: '0901234567',
    invoiceId: 'HDTEST001',
    items: [{ productId: 'SP01', quantity: 2 }],
    note: 'Giao dịch thử',
    payment: { amount: 24000, method: 'CASH' },
    promotionId: 'KM01',
  });
  assert.equal(Object.hasOwn(payload, 'cashReceived'), false);
  assert.equal(Object.hasOwn(payload.items[0], 'price'), false);
  assert.equal(calculateCashChange('50000', 24000), 26000);
});

test('checkout validation preserves input and rejects insufficient cash before submission', () => {
  const cart = [{ ...product, quantity: 1 }];
  const snapshot = structuredClone(cart);
  assert.throws(() => buildCheckoutPayload({
    cart,
    cashReceived: '9999',
    invoiceId: 'HDTEST002',
    method: 'CASH',
    quote: { totals: { totalAmount: 10000 } },
  }), /chưa đủ/);
  assert.deepEqual(cart, snapshot);

  const transfer = buildCheckoutPayload({
    cart,
    externalTransactionId: 'SIM-01',
    invoiceId: 'HDTEST003',
    method: 'TRANSFER',
    quote: { totals: { totalAmount: 10000 } },
  });
  assert.deepEqual(transfer.payment, {
    amount: 10000,
    externalTransactionId: 'SIM-01',
    method: 'TRANSFER',
  });
});

test('generated invoice id is deterministic, non-empty and within schema length', () => {
  const invoiceId = createInvoiceId(1_795_000_000_000, 0.5);
  assert.match(invoiceId, /^HD[A-Z0-9]+$/);
  assert.ok(invoiceId.length <= 15);
  assert.equal(createInvoiceId(1_795_000_000_000, 0.5), invoiceId);
});

test('receipt stylesheet provides a dedicated print-only layout', () => {
  const css = readFileSync(new URL('../src/assets/app.css', import.meta.url), 'utf8');
  assert.match(css, /@media print/);
  assert.match(css, /\.receipt-print-area/);
  assert.match(css, /\.no-print/);
  assert.match(css, /visibility:\s*visible/);
});
