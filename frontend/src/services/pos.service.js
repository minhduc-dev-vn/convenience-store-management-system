import { apiClient } from '../api';
import { buildPosBarcodePath, buildPosProductSearchPath } from './posQuery';

export { buildPosBarcodePath, buildPosProductSearchPath } from './posQuery';

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

