'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  InventoryService,
  mapInventoryError,
  normalizeLotQuery,
  normalizeProductQuery,
} = require('../src/services/inventory.service');

function productRow(overrides = {}) {
  return {
    MaSP: 'C26P001',
    TenSP: 'C26 Alpha',
    DonViTinh: 'Chai',
    MucTonToiThieu: 10,
    MaLoai: 'C26CAT',
    TenLoai: 'C26 Category',
    TrangThaiSanPham: 'ACTIVE',
    TongTon: 6,
    TongTonKhaDung: 3,
    TongTonCanHan: 3,
    TongTonHetHan: 1,
    TongTonBiKhoa: 2,
    SoLoConTon: 3,
    SoLoCanHan: 1,
    SoLoHetHan: 1,
    CanhBaoTonThap: true,
    ...overrides,
  };
}

function lotRow(overrides = {}) {
  return {
    MaLo: 'C26LOT001',
    MaSP: 'C26P001',
    TenSP: 'C26 Alpha',
    DonViTinh: 'Chai',
    MaLoai: 'C26CAT',
    TenLoai: 'C26 Category',
    SoLo: 'C26-BATCH-1',
    NgaySanXuat: new Date('2026-08-01T00:00:00.000Z'),
    HanSuDung: new Date('2026-10-10T00:00:00.000Z'),
    GiaNhap: 15000,
    SoLuongTon: 3,
    TrangThaiLo: 'ACTIVE',
    SoNgayConLai: 11,
    TinhTrangHanDung: 'NEAR_EXPIRY',
    ...overrides,
  };
}

test('inventory product list normalizes filters and exposes MH-13 stock alerts', async () => {
  let received;
  const service = new InventoryService({
    inventoryRepository: {
      async listProducts(filters) {
        received = filters;
        return { items: [productRow()], totalItems: 21 };
      },
    },
  });

  const result = await service.listProducts({ role: 'MANAGER' }, {
    page: '2',
    pageSize: '10',
    search: 'C26',
    categoryId: 'C26CAT',
    mode: 'low_stock',
    referenceDate: '2026-09-29',
    nearExpiryDays: '15',
  });

  assert.deepEqual(received, {
    page: 2,
    pageSize: 10,
    categoryId: 'C26CAT',
    nearExpiryDays: 15,
    referenceDate: '2026-09-29',
    search: 'C26',
    mode: 'LOW_STOCK',
  });
  assert.deepEqual(result.pagination, {
    page: 2, pageSize: 10, totalItems: 21, totalPages: 3,
  });
  assert.deepEqual(result.items[0], {
    alerts: { expired: true, lowStock: true, nearExpiry: true },
    availableStock: 3,
    blockedStock: 2,
    category: { categoryId: 'C26CAT', name: 'C26 Category' },
    expiredLotCount: 1,
    expiredStock: 1,
    lotCount: 3,
    minimumStock: 10,
    name: 'C26 Alpha',
    nearExpiryLotCount: 1,
    nearExpiryStock: 3,
    productId: 'C26P001',
    status: 'ACTIVE',
    totalStock: 6,
    unit: 'Chai',
  });
});

test('inventory lot list supports WAREHOUSE drill-down and omits import cost', async () => {
  let received;
  const service = new InventoryService({
    inventoryRepository: {
      async listLots(filters) {
        received = filters;
        return { items: [lotRow()], totalItems: 1 };
      },
    },
  });

  const result = await service.listLots({ role: 'WAREHOUSE' }, {
    productId: 'C26P001',
    expiryStatus: 'near_expiry',
    lotStatus: 'active',
  });

  assert.deepEqual(received, {
    page: 1,
    pageSize: 20,
    categoryId: null,
    nearExpiryDays: 30,
    referenceDate: null,
    search: null,
    expiryStatus: 'NEAR_EXPIRY',
    lotStatus: 'ACTIVE',
    productId: 'C26P001',
  });
  assert.equal(result.items[0].expiryStatus, 'NEAR_EXPIRY');
  assert.equal(result.items[0].quantity, 3);
  assert.equal(result.items[0].product.productId, 'C26P001');
  assert.equal(Object.hasOwn(result.items[0], 'unitCost'), false);
  assert.equal(Object.hasOwn(result.items[0], 'GiaNhap'), false);
});

test('inventory service rejects roles outside the C26 boundary', async () => {
  const service = new InventoryService({ inventoryRepository: {} });
  for (const role of ['CUSTOMER', 'CASHIER']) {
    await assert.rejects(
      service.listProducts({ role }),
      (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
    );
  }
});

test('inventory filters reject invalid pagination, dates, thresholds and enums', () => {
  assert.throws(
    () => normalizeProductQuery({ page: '0' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.throws(
    () => normalizeProductQuery({ pageSize: '101' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.throws(
    () => normalizeProductQuery({ mode: 'UNSUPPORTED' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.throws(
    () => normalizeLotQuery({ expiryStatus: 'SOON' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.throws(
    () => normalizeLotQuery({ lotStatus: 'INACTIVE' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.throws(
    () => normalizeLotQuery({ referenceDate: '2026-02-30' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.throws(
    () => normalizeLotQuery({ nearExpiryDays: '3651' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('inventory SQL errors map to stable validation and not-found responses', () => {
  let error = mapInventoryError({ number: 51425 });
  assert.equal(error.code, 'PRODUCT_NOT_FOUND');
  assert.equal(error.statusCode, 404);

  error = mapInventoryError({ number: 51426 });
  assert.equal(error.code, 'CATEGORY_NOT_FOUND');
  assert.equal(error.statusCode, 404);

  error = mapInventoryError({ number: 51420 });
  assert.equal(error.code, 'VALIDATION_ERROR');
  assert.equal(error.statusCode, 400);
});
