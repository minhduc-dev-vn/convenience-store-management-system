import { apiClient } from '../api';

export function getCustomerProfile(options = {}) {
  return apiClient.get('/customers/me', options);
}

export function updateCustomerProfile(profile, options = {}) {
  return apiClient.patch('/customers/me', profile, options);
}

export function getCustomerLoyalty(options = {}) {
  return apiClient.get('/customers/me/loyalty', options);
}

export function getCustomerInvoices(filters = {}, options = {}) {
  const query = new URLSearchParams();
  for (const field of ['page', 'pageSize', 'from', 'to']) {
    const value = filters[field];
    if (value !== undefined && value !== null && value !== '') query.set(field, String(value));
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return apiClient.get(`/customers/me/invoices${suffix}`, options);
}

export function getCustomerInvoiceDetail(invoiceId, options = {}) {
  if (typeof invoiceId !== 'string' || !invoiceId.trim()) {
    throw new TypeError('invoiceId must be a non-empty string');
  }

  return apiClient.get(`/customers/me/invoices/${encodeURIComponent(invoiceId)}`, options);
}
