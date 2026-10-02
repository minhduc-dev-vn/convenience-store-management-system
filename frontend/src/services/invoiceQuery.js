import { buildAdminQuery, encodeAdminId } from './adminQuery.js';

const INVOICE_FILTER_FIELDS = [
  'page',
  'pageSize',
  'invoiceId',
  'from',
  'to',
  'cashierId',
];

export function buildInvoiceListPath(filters = {}) {
  return `/invoices${buildAdminQuery(filters, INVOICE_FILTER_FIELDS)}`;
}

export function buildInvoiceDetailPath(invoiceId) {
  return `/invoices/${encodeAdminId(invoiceId, 'invoiceId')}`;
}
