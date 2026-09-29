import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInventoryLotListPath,
  buildInventoryProductListPath,
  buildInventoryProductLotsPath,
} from '../src/services/inventoryQuery.js';
import {
  getExpiryPresentation,
  getInitialExpiryFilter,
  getProductAlerts,
} from '../src/components/inventoryPresentation.js';

test('inventory product query matches the C26 read contract', () => {
  assert.equal(
    buildInventoryProductListPath({
      page: 2,
      pageSize: 10,
      search: 'sữa hộp',
      categoryId: 'LSP01',
      mode: 'LOW_STOCK',
      nearExpiryDays: 30,
      ignored: 'value',
    }),
    '/inventory/products?page=2&pageSize=10&search=s%E1%BB%AFa+h%E1%BB%99p&categoryId=LSP01&mode=LOW_STOCK&nearExpiryDays=30',
  );
});

test('inventory lot queries preserve supported filters and encode the product id', () => {
  assert.equal(
    buildInventoryLotListPath({ page: 1, productId: 'SP 01', expiryStatus: 'EXPIRED' }),
    '/inventory/lots?page=1&productId=SP+01&expiryStatus=EXPIRED',
  );
  assert.equal(
    buildInventoryProductLotsPath('SP/01', {
      page: 3,
      pageSize: 10,
      expiryStatus: 'NEAR_EXPIRY',
      lotStatus: 'ACTIVE',
      nearExpiryDays: 30,
      search: 'must-not-leak',
    }),
    '/inventory/products/SP%2F01/lots?page=3&pageSize=10&expiryStatus=NEAR_EXPIRY&lotStatus=ACTIVE&nearExpiryDays=30',
  );
});

test('inventory presentation maps report alert colors and filter drill-down', () => {
  assert.deepEqual(
    getProductAlerts({ alerts: { expired: true, lowStock: true, nearExpiry: false } }),
    [
      { key: 'low-stock', label: 'Tồn thấp' },
      { key: 'expired', label: 'Có lô hết hạn' },
    ],
  );
  assert.equal(getExpiryPresentation('EXPIRED').rowClassName, 'inventory-lot-row--expired');
  assert.equal(getExpiryPresentation('NEAR_EXPIRY').tone, 'near-expiry');
  assert.equal(getExpiryPresentation('VALID').tone, 'valid');
  assert.equal(getInitialExpiryFilter('LOW_STOCK'), 'ALL');
  assert.equal(getInitialExpiryFilter('NEAR_EXPIRY'), 'NEAR_EXPIRY');
});
