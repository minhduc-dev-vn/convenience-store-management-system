'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PosService,
  mapPosError,
  normalizeMoney,
  normalizeProductQuery,
} = require('../src/services/pos.service');

const cashierIdentity = {
  displayName: 'C29 Cashier',
  employeeId: 'C29CASH',
  role: 'CASHIER',
};

function shiftRow(overrides = {}) {
  return {
    MaCa: 29,
    MaNV: 'C29CASH',
    TenNhanVien: 'C29 Cashier',
    GioBatDau: new Date('2026-09-29T08:00:00.000Z'),
    TienDauCa: 500000,
    TrangThai: 'OPEN',
    GhiChu: 'Ca sang',
    ...overrides,
  };
}

function productRow(overrides = {}) {
  return {
    MaSP: 'C29P001',
    TenSP: 'C29 Alpha',
    MaVach: 'C2900001',
    DonViTinh: 'Chai',
    GiaBan: 20000,
    MaLoai: 'C29CAT',
    TenLoai: 'C29 Category',
    TonKhaDung: 8,
    ...overrides,
  };
}

test('current shift is derived from the authenticated cashier and may be null', async () => {
  const employeeIds = [];
  let row = null;
  const service = new PosService({
    posRepository: {
      async findCurrentOpenShift(employeeId) {
        employeeIds.push(employeeId);
        return row;
      },
    },
  });

  assert.deepEqual(await service.getCurrentShift(cashierIdentity), { shift: null });
  row = shiftRow();
  const result = await service.getCurrentShift(cashierIdentity);

  assert.deepEqual(employeeIds, ['C29CASH', 'C29CASH']);
  assert.deepEqual(result.shift, {
    employee: { employeeId: 'C29CASH', name: 'C29 Cashier' },
    note: 'Ca sang',
    openingCash: 500000,
    shiftId: '29',
    startedAt: '2026-09-29T08:00:00.000Z',
    status: 'OPEN',
  });
});

test('opening a shift binds the JWT employee and normalizes client input', async () => {
  let received;
  const service = new PosService({
    posRepository: {
      async openShift(input) {
        received = input;
        return shiftRow({ TenNhanVien: undefined });
      },
    },
  });

  const result = await service.openShift(cashierIdentity, {
    employeeId: 'SPOOFED',
    note: '  Ca sang  ',
    openingCash: 125000.5,
  });

  assert.deepEqual(received, {
    employeeId: 'C29CASH',
    note: 'Ca sang',
    openingCash: 125000.5,
  });
  assert.equal(result.shift.employee.employeeId, 'C29CASH');
  assert.equal(result.shift.employee.name, 'C29 Cashier');
});

test('product search requires an OPEN shift and returns sellable stock snapshots', async () => {
  let hasOpenShift = false;
  let received;
  const service = new PosService({
    posRepository: {
      async findCurrentOpenShift(employeeId) {
        assert.equal(employeeId, 'C29CASH');
        return hasOpenShift ? shiftRow() : null;
      },
      async searchSellableProducts(filters) {
        received = filters;
        return { items: [productRow()], totalItems: 21 };
      },
    },
  });

  await assert.rejects(
    service.searchProducts(cashierIdentity, { search: 'C29' }),
    (error) => error.code === 'SHIFT_REQUIRED' && error.statusCode === 409,
  );

  hasOpenShift = true;
  const result = await service.searchProducts(cashierIdentity, {
    page: '2', pageSize: '10', search: ' C29%_~[ ',
  });

  assert.deepEqual(received, {
    page: 2,
    pageSize: 10,
    search: 'C29%_~[',
    searchPattern: 'C29~%~_~~~[%',
  });
  assert.deepEqual(result.pagination, {
    page: 2, pageSize: 10, totalItems: 21, totalPages: 3,
  });
  assert.deepEqual(result.items[0], {
    availableStock: 8,
    barcode: 'C2900001',
    category: { categoryId: 'C29CAT', name: 'C29 Category' },
    name: 'C29 Alpha',
    price: 20000,
    productId: 'C29P001',
    unit: 'Chai',
  });
});

test('barcode lookup requires an OPEN shift and rejects a non-sellable product', async () => {
  let product = productRow();
  const service = new PosService({
    posRepository: {
      async findCurrentOpenShift() {
        return shiftRow();
      },
      async findSellableProductByBarcode(barcode) {
        assert.equal(barcode, 'C2900001');
        return product;
      },
    },
  });

  let result = await service.getProductByBarcode(cashierIdentity, ' C2900001 ');
  assert.equal(result.product.productId, 'C29P001');

  product = null;
  await assert.rejects(
    service.getProductByBarcode(cashierIdentity, 'C2900001'),
    (error) => error.code === 'PRODUCT_NOT_SELLABLE' && error.statusCode === 404,
  );
});

test('POS service rejects identities outside the CASHIER boundary', async () => {
  const service = new PosService({ posRepository: {} });
  for (const identity of [
    { role: 'CUSTOMER', customerId: 'C29CUST' },
    { role: 'WAREHOUSE', employeeId: 'C29WARE' },
    { role: 'MANAGER', employeeId: 'C29MGR' },
    { role: 'CASHIER' },
  ]) {
    await assert.rejects(
      service.getCurrentShift(identity),
      (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
    );
  }
});

test('POS validation rejects unsafe shift money and invalid pagination', () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '1000', 1.001]) {
    assert.throws(
      () => normalizeMoney(value, 'openingCash'),
      (error) => error.code === 'VALIDATION_ERROR',
    );
  }
  assert.throws(
    () => normalizeProductQuery({ page: '0' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.throws(
    () => normalizeProductQuery({ pageSize: '101' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.throws(
    () => normalizeProductQuery({ search: 'x'.repeat(151) }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('shift procedure errors map to stable API errors', () => {
  let error = mapPosError({ number: 51504 });
  assert.equal(error.code, 'SHIFT_ALREADY_OPEN');
  assert.equal(error.statusCode, 409);

  error = mapPosError({ number: 51503 });
  assert.equal(error.code, 'CASHIER_UNAVAILABLE');
  assert.equal(error.statusCode, 403);

  error = mapPosError({ number: 51502 });
  assert.equal(error.code, 'VALIDATION_ERROR');
  assert.equal(error.statusCode, 400);
});
