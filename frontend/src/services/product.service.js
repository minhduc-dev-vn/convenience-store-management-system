import { apiClient } from '../api';
import { encodeAdminId } from './adminQuery';
import {
  buildAdminCategoryListPath,
  buildAdminProductListPath,
  buildPriceHistoryPath,
  buildPublicProductListPath,
} from './productQuery';

export {
  buildAdminCategoryListPath,
  buildAdminProductListPath,
  buildPriceHistoryPath,
  buildPublicProductListPath,
} from './productQuery';

export function listPublicProducts(filters = {}, options = {}) {
  return apiClient.get(buildPublicProductListPath(filters), {
    ...options,
    includeAuthorization: false,
  });
}

export function getPublicProduct(productId, options = {}) {
  return apiClient.get(`/products/${encodeAdminId(productId, 'productId')}`, {
    ...options,
    includeAuthorization: false,
  });
}

export function listPublicCategories(options = {}) {
  return apiClient.get('/products/categories', {
    ...options,
    includeAuthorization: false,
  });
}

export function listProducts(filters = {}, options = {}) {
  return apiClient.get(buildAdminProductListPath(filters), options);
}

export function getProduct(productId, options = {}) {
  return apiClient.get(`/admin/products/${encodeAdminId(productId, 'productId')}`, options);
}

export function createProduct(payload, options = {}) {
  return apiClient.post('/admin/products', payload, options);
}

export function updateProduct(productId, payload, options = {}) {
  return apiClient.patch(`/admin/products/${encodeAdminId(productId, 'productId')}`, payload, options);
}

export function updateProductStatus(productId, status, options = {}) {
  return apiClient.patch(
    `/admin/products/${encodeAdminId(productId, 'productId')}/status`,
    { status },
    options,
  );
}

export function updateProductPrice(productId, payload, options = {}) {
  return apiClient.patch(
    `/admin/products/${encodeAdminId(productId, 'productId')}/price`,
    payload,
    options,
  );
}

export function listPriceHistory(productId, filters = {}, options = {}) {
  return apiClient.get(buildPriceHistoryPath(productId, filters), options);
}

export function listCategories(filters = {}, options = {}) {
  return apiClient.get(buildAdminCategoryListPath(filters), options);
}

export function getCategory(categoryId, options = {}) {
  return apiClient.get(`/admin/categories/${encodeAdminId(categoryId, 'categoryId')}`, options);
}

export function createCategory(payload, options = {}) {
  return apiClient.post('/admin/categories', payload, options);
}

export function updateCategory(categoryId, payload, options = {}) {
  return apiClient.patch(`/admin/categories/${encodeAdminId(categoryId, 'categoryId')}`, payload, options);
}

export function updateCategoryStatus(categoryId, status, options = {}) {
  return apiClient.patch(
    `/admin/categories/${encodeAdminId(categoryId, 'categoryId')}/status`,
    { status },
    options,
  );
}
