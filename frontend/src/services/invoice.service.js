import { apiClient } from '../api';
import { buildInvoiceDetailPath, buildInvoiceListPath } from './invoiceQuery';

export { buildInvoiceDetailPath, buildInvoiceListPath } from './invoiceQuery';

export function listInvoices(filters = {}, options = {}) {
  return apiClient.get(buildInvoiceListPath(filters), options);
}

export function getInvoice(invoiceId, options = {}) {
  return apiClient.get(buildInvoiceDetailPath(invoiceId), options);
}
