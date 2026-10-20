import { buildAdminQuery, encodeAdminId } from './adminQuery.js';

const PUBLIC_PRODUCT_FILTERS = ['page', 'pageSize', 'search', 'categoryId'];
const PRODUCT_FILTERS = [...PUBLIC_PRODUCT_FILTERS, 'status'];
const CATEGORY_FILTERS = ['page', 'pageSize', 'search', 'status'];
const HISTORY_FILTERS = ['page', 'pageSize'];

export function buildPublicProductListPath(filters = {}) {
  return `/products${buildAdminQuery(filters, PUBLIC_PRODUCT_FILTERS)}`;
}

export function buildAdminProductListPath(filters = {}) {
  return `/admin/products${buildAdminQuery(filters, PRODUCT_FILTERS)}`;
}

export function buildAdminCategoryListPath(filters = {}) {
  return `/admin/categories${buildAdminQuery(filters, CATEGORY_FILTERS)}`;
}

export function buildPriceHistoryPath(productId, filters = {}) {
  return `/admin/products/${encodeAdminId(productId, 'productId')}/price-history${buildAdminQuery(filters, HISTORY_FILTERS)}`;
}
