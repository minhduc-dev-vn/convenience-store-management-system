import { buildAdminQuery, encodeAdminId } from './adminQuery.js';

const PRODUCT_FILTERS = [
  'page',
  'pageSize',
  'search',
  'categoryId',
  'mode',
  'referenceDate',
  'nearExpiryDays',
];
const LOT_FILTERS = [
  'page',
  'pageSize',
  'search',
  'categoryId',
  'productId',
  'expiryStatus',
  'lotStatus',
  'referenceDate',
  'nearExpiryDays',
];
const PRODUCT_LOT_FILTERS = [
  'page',
  'pageSize',
  'expiryStatus',
  'lotStatus',
  'referenceDate',
  'nearExpiryDays',
];

export function buildInventoryProductListPath(filters = {}) {
  return `/inventory/products${buildAdminQuery(filters, PRODUCT_FILTERS)}`;
}

export function buildInventoryLotListPath(filters = {}) {
  return `/inventory/lots${buildAdminQuery(filters, LOT_FILTERS)}`;
}

export function buildInventoryProductLotsPath(productId, filters = {}) {
  return `/inventory/products/${encodeAdminId(productId, 'productId')}/lots${buildAdminQuery(
    filters,
    PRODUCT_LOT_FILTERS,
  )}`;
}
