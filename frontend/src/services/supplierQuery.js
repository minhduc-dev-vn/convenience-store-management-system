import { buildAdminQuery, encodeAdminId } from './adminQuery.js';

const SUPPLIER_FILTERS = ['page', 'pageSize', 'search', 'status'];

export function buildSupplierListPath(filters = {}) {
  return `/admin/suppliers${buildAdminQuery(filters, SUPPLIER_FILTERS)}`;
}

export function buildSupplierDetailPath(supplierId) {
  return `/admin/suppliers/${encodeAdminId(supplierId, 'supplierId')}`;
}

export function buildSupplierStatusPath(supplierId) {
  return `${buildSupplierDetailPath(supplierId)}/status`;
}
