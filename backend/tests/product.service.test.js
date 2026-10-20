'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeImageUrl, ProductService } = require('../src/services/product.service');

const transaction = { id: 'c16-transaction' };
const transactionRunner = async (work) => work(transaction);
const manager = { accountId: 16, role: 'MANAGER' };

function productRow(overrides = {}) {
  return {
    MaSP: 'SPC160001',
    TenSP: 'C16 Product',
    MaVach: 'C16-BARCODE',
    DonViTinh: 'Box',
    GiaBan: 25000,
    ImageUrl: 'https://cdn.example.com/c16-product.jpg',
    MucTonToiThieu: 4,
    MaLoai: 'LSPC1601',
    TenLoai: 'C16 Category',
    TrangThaiLoai: 'ACTIVE',
    TrangThai: 'ACTIVE',
    ...overrides,
  };
}

function categoryRow(overrides = {}) {
  return {
    MaLoai: 'LSPC1601',
    TenLoai: 'C16 Category',
    MoTa: 'Category description',
    TrangThai: 'ACTIVE',
    ...overrides,
  };
}

test('public catalog forces active records and omits internal product fields', async () => {
  let receivedFilters;
  let receivedOptions;
  const service = new ProductService({
    productRepository: {
      async listProducts(filters, options) {
        receivedFilters = filters;
        receivedOptions = options;
        return { items: [productRow()], totalItems: 1 };
      },
    },
  });

  const result = await service.listPublicProducts({
    categoryId: 'LSPC1601', page: '2', pageSize: '5', search: 'C16%_',
  });

  assert.equal(receivedFilters.status, 'ACTIVE');
  assert.equal(receivedFilters.searchPattern, 'C16~%~_%');
  assert.equal(receivedOptions.publicOnly, true);
  assert.deepEqual(result.pagination, { page: 2, pageSize: 5, totalItems: 1, totalPages: 1 });
  assert.deepEqual(result.items[0], {
    category: { categoryId: 'LSPC1601', name: 'C16 Category' },
    imageUrl: 'https://cdn.example.com/c16-product.jpg',
    name: 'C16 Product',
    price: 25000,
    productId: 'SPC160001',
    unit: 'Box',
  });
  assert.equal(Object.hasOwn(result.items[0], 'barcode'), false);
  assert.equal(Object.hasOwn(result.items[0], 'minimumStock'), false);
  assert.equal(Object.hasOwn(result.items[0], 'status'), false);
});

test('product image URL normalization accepts HTTP(S), clears blanks and rejects unsafe schemes', () => {
  assert.equal(normalizeImageUrl(undefined), undefined);
  assert.equal(normalizeImageUrl(null), null);
  assert.equal(normalizeImageUrl('   '), null);
  assert.equal(
    normalizeImageUrl('  https://cdn.example.com/product image.jpg  '),
    'https://cdn.example.com/product image.jpg',
  );
  assert.throws(() => normalizeImageUrl('javascript:alert(1)'), /HTTP or HTTPS/);
  assert.throws(() => normalizeImageUrl('data:image/png;base64,abc'), /HTTP or HTTPS/);
  assert.throws(() => normalizeImageUrl('file:///tmp/product.jpg'), /HTTP or HTTPS/);
  assert.throws(() => normalizeImageUrl('http:example.com/product.jpg'), /HTTP or HTTPS/);
  assert.throws(() => normalizeImageUrl('not-a-url'), /HTTP or HTTPS/);
  assert.throws(() => normalizeImageUrl(`https://example.com/${'a'.repeat(490)}`), /500/);
});

test('public detail returns 404 when repository excludes a non-public product', async () => {
  const service = new ProductService({
    productRepository: {
      async findProductById(_productId, options) {
        assert.equal(options.publicOnly, true);
        return null;
      },
    },
  });

  await assert.rejects(
    service.getPublicProduct('SPC160001'),
    (error) => error.code === 'PRODUCT_NOT_FOUND' && error.statusCode === 404,
  );
});

test('product creation rejects a duplicate barcode before insert', async () => {
  let inserted = false;
  const service = new ProductService({
    productRepository: {
      async findProductForUpdate() { return null; },
      async findCategoryForUpdate() { return categoryRow(); },
      async findBarcodeConflict() { return { MaSP: 'OTHER001' }; },
      async createProduct() { inserted = true; },
    },
    transactionRunner,
  });

  await assert.rejects(
    service.createProduct({
      barcode: 'C16-BARCODE',
      categoryId: 'LSPC1601',
      minimumStock: 0,
      name: 'C16 Product',
      price: 25000,
      productId: 'SPC160001',
      unit: 'Box',
    }),
    (error) => error.code === 'PRODUCT_BARCODE_CONFLICT' && error.statusCode === 409,
  );
  assert.equal(inserted, false);
});

test('product create and update persist normalized nullable image URLs', async () => {
  const writes = [];
  const repository = {
    async findProductForUpdate() { return productRow(); },
    async findCategoryForUpdate() { return categoryRow(); },
    async findBarcodeConflict() { return null; },
    async findProductById() { return productRow({ ImageUrl: writes.at(-1)?.imageUrl ?? null }); },
    async createProduct(product) { writes.push(product); },
    async updateProduct(_productId, changes) { writes.push(changes); },
  };
  const service = new ProductService({ productRepository: repository, transactionRunner });

  repository.findProductForUpdate = async () => null;
  const created = await service.createProduct({
    categoryId: 'LSPC1601', imageUrl: ' https://cdn.example.com/product.jpg ',
    minimumStock: 0, name: 'C16 Product', price: 25000,
    productId: 'SPC160001', unit: 'Box',
  });
  assert.equal(writes[0].imageUrl, 'https://cdn.example.com/product.jpg');
  assert.equal(created.imageUrl, 'https://cdn.example.com/product.jpg');

  repository.findProductForUpdate = async () => productRow();
  const updated = await service.updateProduct('SPC160001', { imageUrl: '' });
  assert.deepEqual(writes[1], { imageUrl: null });
  assert.equal(updated.imageUrl, null);
});

test('general product update cannot bypass validation with price or status fields', async () => {
  const service = new ProductService({ productRepository: {} });

  await assert.rejects(
    service.createProduct({
      categoryId: 'LSPC1601', minimumStock: 0, name: 'C16',
      price: 0, productId: 'SPC160001', unit: 'Box',
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  await assert.rejects(
    service.createProduct({
      categoryId: 'LSPC1601', minimumStock: -1, name: 'C16',
      price: 1, productId: 'SPC160001', unit: 'Box',
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('price update and audit share one transaction and contain old/new price plus reason', async () => {
  const calls = [];
  const service = new ProductService({
    auditService: {
      async record(audit, receivedTransaction) {
        calls.push(['audit', audit, receivedTransaction]);
      },
    },
    productRepository: {
      async findProductForUpdate(productId, receivedTransaction) {
        calls.push(['find', productId, receivedTransaction]);
        return productRow({ GiaBan: 25000 });
      },
      async updateProductPrice(productId, price, receivedTransaction) {
        calls.push(['update', productId, price, receivedTransaction]);
      },
    },
    transactionRunner,
  });

  const result = await service.updateProductPrice(
    manager,
    'SPC160001',
    { newPrice: 27500, reason: 'Market adjustment' },
    '127.0.0.1',
  );

  assert.deepEqual(result, {
    newPrice: 27500,
    oldPrice: 25000,
    productId: 'SPC160001',
    reason: 'Market adjustment',
  });
  assert.deepEqual(calls.map((call) => call[0]), ['find', 'update', 'audit']);
  assert.equal(calls[1][3], transaction);
  assert.equal(calls[2][2], transaction);
  assert.equal(calls[2][1].action, 'UPDATE_PRICE');
  assert.equal(calls[2][1].actorAccountId, 16);
  assert.deepEqual(calls[2][1].oldData, { price: 25000 });
  assert.deepEqual(calls[2][1].newData, {
    price: 27500,
    reason: 'Market adjustment',
  });
});

test('price update rejects an unchanged value without update or audit', async () => {
  let mutated = false;
  const service = new ProductService({
    productRepository: {
      async findProductForUpdate() { return productRow({ GiaBan: 25000 }); },
      async updateProductPrice() { mutated = true; },
      async writeAudit() { mutated = true; },
    },
    transactionRunner,
  });

  await assert.rejects(
    service.updateProductPrice(manager, 'SPC160001', {
      newPrice: 25000,
      reason: 'No effective change',
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.equal(mutated, false);
});

test('price history maps audit JSON without exposing raw audit payload', async () => {
  const service = new ProductService({
    productRepository: {
      async findProductById() { return productRow(); },
      async listPriceHistory() {
        return {
          items: [{
            DuLieuCu: '{"price":25000}',
            DuLieuMoi: '{"price":27500,"reason":"Market adjustment"}',
            MaTK: 16,
            TenDangNhap: 'c16.manager',
            TenNguoiThucHien: 'C16 Manager',
            ThoiGian: new Date('2026-09-28T10:00:00.000Z'),
          }],
          totalItems: 1,
        };
      },
    },
  });

  const result = await service.listPriceHistory('SPC160001', { page: '1', pageSize: '10' });

  assert.deepEqual(result.items[0], {
    changedAt: '2026-09-28T10:00:00.000Z',
    changedBy: { accountId: 16, fullName: 'C16 Manager', username: 'c16.manager' },
    newPrice: 27500,
    oldPrice: 25000,
    reason: 'Market adjustment',
  });
  assert.equal(Object.hasOwn(result.items[0], 'DuLieuCu'), false);
});

test('category create uses schema fields and rejects inactive category for new products', async () => {
  const repository = {
    async findCategoryForUpdate(categoryId) {
      return categoryId === 'INACTIVE1'
        ? categoryRow({ MaLoai: categoryId, TrangThai: 'INACTIVE' })
        : null;
    },
    async findCategoryNameConflict() { return null; },
    async createCategory() {},
    async findCategoryById() { return categoryRow(); },
    async findProductForUpdate() { return null; },
  };
  const service = new ProductService({ productRepository: repository, transactionRunner });

  const category = await service.createCategory({
    categoryId: 'LSPC1601',
    description: 'Category description',
    name: 'C16 Category',
  });
  assert.equal(category.categoryId, 'LSPC1601');

  await assert.rejects(
    service.createProduct({
      categoryId: 'INACTIVE1', minimumStock: 0, name: 'C16 Product',
      price: 25000, productId: 'SPC160001', unit: 'Box',
    }),
    (error) => error.code === 'CATEGORY_INACTIVE' && error.statusCode === 400,
  );
});
