import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addProductToCart,
  buildQuotePayload,
  removeCartItem,
  updateCartQuantity,
} from '../src/components/pos/cart.js';
import { buildPosBarcodePath, buildPosProductSearchPath } from '../src/services/posQuery.js';

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
