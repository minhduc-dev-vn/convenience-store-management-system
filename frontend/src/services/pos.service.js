import { apiClient } from '../api';
import {
  buildPosBarcodePath,
  buildPosProductSearchPath,
  buildPosReceiptPath,
} from './posQuery';

export { buildPosBarcodePath, buildPosProductSearchPath, buildPosReceiptPath } from './posQuery';

export function getCurrentPosShift(options = {}) {
  return apiClient.get('/pos/shifts/current', options);
}

export function openPosShift(input, options = {}) {
  return apiClient.post('/pos/shifts/open', input, options);
}

export function searchPosProducts(filters = {}, options = {}) {
  return apiClient.get(buildPosProductSearchPath(filters), options);
}

export function getPosProductByBarcode(barcode, options = {}) {
  return apiClient.get(buildPosBarcodePath(barcode), options);
}

export function calculatePosQuote(input, options = {}) {
  return apiClient.post('/pos/quotes', input, options);
}

export function checkoutPosOrder(input, options = {}) {
  return apiClient.post('/pos/checkouts', input, options);
}

export function getPosReceipt(invoiceId, options = {}) {
  return apiClient.get(buildPosReceiptPath(invoiceId), options);
}
