import { apiClient } from '../api';
import {
  buildSupplierDetailPath,
  buildSupplierListPath,
  buildSupplierStatusPath,
} from './supplierQuery';

export {
  buildSupplierDetailPath,
  buildSupplierListPath,
  buildSupplierStatusPath,
} from './supplierQuery';

export function listSuppliers(filters = {}, options = {}) {
  return apiClient.get(buildSupplierListPath(filters), options);
}

export function getSupplier(supplierId, options = {}) {
  return apiClient.get(buildSupplierDetailPath(supplierId), options);
}

export function createSupplier(payload, options = {}) {
  return apiClient.post('/admin/suppliers', payload, options);
}

export function updateSupplier(supplierId, payload, options = {}) {
  return apiClient.patch(buildSupplierDetailPath(supplierId), payload, options);
}

export function updateSupplierStatus(supplierId, status, options = {}) {
  return apiClient.patch(buildSupplierStatusPath(supplierId), { status }, options);
}
