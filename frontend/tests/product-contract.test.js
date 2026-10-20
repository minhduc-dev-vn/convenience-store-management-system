import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCategoryPayload,
  buildPricePayload,
  buildProductPayload,
  isValidProductImageUrl,
  productToForm,
  validateCategoryForm,
  validatePriceForm,
  validateProductForm,
} from '../src/pages/manager/productForms.js';
import {
  buildAdminCategoryListPath,
  buildAdminProductListPath,
  buildPriceHistoryPath,
  buildPublicProductListPath,
} from '../src/services/productQuery.js';

test('C16 product paths include only backend-supported filters', () => {
  assert.equal(
    buildPublicProductListPath({ page: 2, pageSize: 12, search: 'Sữa', categoryId: 'L01', status: 'INACTIVE' }),
    '/products?page=2&pageSize=12&search=S%E1%BB%AFa&categoryId=L01',
  );
  assert.equal(
    buildAdminProductListPath({ page: 1, pageSize: 10, search: 'SP', categoryId: '', status: 'ACTIVE', internalStock: true }),
    '/admin/products?page=1&pageSize=10&search=SP&status=ACTIVE',
  );
  assert.equal(
    buildAdminCategoryListPath({ page: 1, pageSize: 100, search: '', status: 'ACTIVE', productId: 'ignored' }),
    '/admin/categories?page=1&pageSize=100&status=ACTIVE',
  );
  assert.equal(
    buildPriceHistoryPath('SP/01', { page: 3, pageSize: 8, action: 'ignored' }),
    '/admin/products/SP%2F01/price-history?page=3&pageSize=8',
  );
});

test('new product payload follows exact C16 create contract', () => {
  const form = {
    productId: ' SP01 ', name: ' Sữa tươi ', barcode: '', unit: ' Hộp ',
    price: '12500', imageUrl: '', minimumStock: '5', categoryId: 'L01', status: 'ACTIVE',
  };
  assert.deepEqual(validateProductForm(form), {});
  assert.deepEqual(buildProductPayload(form), {
    productId: 'SP01', name: 'Sữa tươi', barcode: null, unit: 'Hộp', imageUrl: null,
    price: 12500, minimumStock: 5, categoryId: 'L01', status: 'ACTIVE',
  });
});

test('product edit excludes price, status and immutable product id', () => {
  const form = {
    productId: 'SP01', name: 'Sữa tươi mới', barcode: '8930001', unit: 'Hộp',
    price: '999', imageUrl: ' https://cdn.example.com/sp01.jpg ',
    minimumStock: '7', categoryId: 'L02', status: 'INACTIVE',
  };
  assert.deepEqual(validateProductForm(form, { editing: true }), {});
  assert.deepEqual(buildProductPayload(form, { editing: true }), {
    name: 'Sữa tươi mới', barcode: '8930001', unit: 'Hộp',
    imageUrl: 'https://cdn.example.com/sp01.jpg', minimumStock: 7, categoryId: 'L02',
  });
});

test('product image URL validation only permits optional HTTP(S) URLs up to 500 characters', () => {
  assert.equal(isValidProductImageUrl(''), true);
  assert.equal(isValidProductImageUrl('https://cdn.example.com/sp01.jpg'), true);
  assert.equal(isValidProductImageUrl('http://images.example.com/sp01.png'), true);
  assert.equal(isValidProductImageUrl('javascript:alert(1)'), false);
  assert.equal(isValidProductImageUrl('data:image/png;base64,abc'), false);
  assert.equal(isValidProductImageUrl('http:example.com/sp01.jpg'), false);

  const baseForm = {
    productId: 'SP01', name: 'Sữa tươi', barcode: '', unit: 'Hộp', price: '12500',
    imageUrl: 'file:///tmp/sp01.jpg', minimumStock: '5', categoryId: 'L01', status: 'ACTIVE',
  };
  assert.ok(validateProductForm(baseForm).imageUrl);
  assert.ok(validateProductForm({
    ...baseForm,
    imageUrl: `https://example.com/${'a'.repeat(490)}`,
  }).imageUrl);
});

test('editing a product populates its image URL and preserves it in the update payload', () => {
  const form = productToForm({
    productId: 'SP01', name: 'Sữa tươi', barcode: null, unit: 'Hộp', price: 12500,
    imageUrl: 'https://cdn.example.com/sp01.jpg', minimumStock: 5,
    category: { categoryId: 'L01' }, status: 'ACTIVE',
  });
  assert.equal(form.imageUrl, 'https://cdn.example.com/sp01.jpg');
  assert.equal(
    buildProductPayload(form, { editing: true }).imageUrl,
    'https://cdn.example.com/sp01.jpg',
  );
});

test('price change requires a different positive price and audit reason', () => {
  assert.ok(validatePriceForm({ newPrice: '10000', reason: 'Điều chỉnh' }, 10000).newPrice);
  assert.ok(validatePriceForm({ newPrice: '10000', reason: '' }, 9000).reason);
  assert.ok(validatePriceForm({ newPrice: '10.123', reason: 'Điều chỉnh' }, 9000).newPrice);
  assert.deepEqual(
    buildPricePayload({ newPrice: '11500.50', reason: ' Cập nhật theo giá nhập ' }),
    { newPrice: 11500.5, reason: 'Cập nhật theo giá nhập' },
  );
});

test('category payload follows create/update fields without extra schema values', () => {
  const form = { categoryId: ' L01 ', name: ' Đồ uống ', description: '', status: 'ACTIVE' };
  assert.deepEqual(validateCategoryForm(form), {});
  assert.deepEqual(buildCategoryPayload(form), {
    categoryId: 'L01', name: 'Đồ uống', description: null, status: 'ACTIVE',
  });
  assert.deepEqual(buildCategoryPayload(form, { editing: true }), {
    name: 'Đồ uống', description: null,
  });
});
