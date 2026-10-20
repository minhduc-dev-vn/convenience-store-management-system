export function buildAdminQuery(filters = {}, allowedFields = []) {
  const query = new URLSearchParams();
  for (const field of allowedFields) {
    const value = filters[field];
    if (value !== undefined && value !== null && value !== '') {
      query.set(field, String(value));
    }
  }
  return query.size > 0 ? `?${query.toString()}` : '';
}

export function encodeAdminId(value, fieldName) {
  const normalized = typeof value === 'number' && Number.isSafeInteger(value)
    ? String(value)
    : value;
  if (typeof normalized !== 'string' || !normalized.trim()) {
    throw new TypeError(`${fieldName} must be a non-empty string or integer`);
  }
  return encodeURIComponent(normalized.trim());
}

const CUSTOMER_FILTER_FIELDS = ['page', 'pageSize', 'search', 'membershipTier', 'status'];
const CUSTOMER_INVOICE_FILTER_FIELDS = ['page', 'pageSize', 'from', 'to'];

export function buildCustomerListPath(filters = {}) {
  return `/admin/customers${buildAdminQuery(filters, CUSTOMER_FILTER_FIELDS)}`;
}

export function buildCustomerDetailPath(customerId) {
  return `/admin/customers/${encodeAdminId(customerId, 'customerId')}`;
}

export function buildCustomerInvoicesPath(customerId, filters = {}) {
  return `${buildCustomerDetailPath(customerId)}/invoices${buildAdminQuery(
    filters,
    CUSTOMER_INVOICE_FILTER_FIELDS,
  )}`;
}

export function buildCustomerInvoiceDetailPath(customerId, invoiceId) {
  return `${buildCustomerDetailPath(customerId)}/invoices/${encodeAdminId(
    invoiceId,
    'invoiceId',
  )}`;
}

export function buildCustomerAccountStatusPath(customerId) {
  return `${buildCustomerDetailPath(customerId)}/account/status`;
}
