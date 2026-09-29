import { apiClient } from '../api';
import {
  buildReceiptActionPath,
  buildReceiptLinePath,
  buildReceiptListPath,
  buildReceiptPath,
  buildReceivingLookupPath,
} from './receivingQuery';

export {
  buildReceiptActionPath,
  buildReceiptLinePath,
  buildReceiptListPath,
  buildReceiptPath,
  buildReceivingLookupPath,
} from './receivingQuery';

export function listReceipts(filters = {}, options = {}) {
  return apiClient.get(buildReceiptListPath(filters), options);
}

export function getReceipt(receiptId, options = {}) {
  return apiClient.get(buildReceiptPath(receiptId), options);
}

export function listReceivingSuppliers(filters = {}, options = {}) {
  return apiClient.get(buildReceivingLookupPath('suppliers', filters), options);
}

export function listReceivingProducts(filters = {}, options = {}) {
  return apiClient.get(buildReceivingLookupPath('products', filters), options);
}

export function createReceiptDraft(payload, options = {}) {
  return apiClient.post(buildReceiptListPath(), payload, options);
}

export function updateReceiptDraft(receiptId, payload, options = {}) {
  return apiClient.patch(buildReceiptPath(receiptId), payload, options);
}

export function addReceiptLine(receiptId, payload, options = {}) {
  return apiClient.post(`${buildReceiptPath(receiptId)}/lines`, payload, options);
}

export function updateReceiptLine(receiptId, detailId, payload, options = {}) {
  return apiClient.patch(buildReceiptLinePath(receiptId, detailId), payload, options);
}

export function deleteReceiptLine(receiptId, detailId, options = {}) {
  return apiClient.delete(buildReceiptLinePath(receiptId, detailId), options);
}

export function cancelReceipt(receiptId, options = {}) {
  return apiClient.post(buildReceiptActionPath(receiptId, 'cancel'), undefined, options);
}

export function confirmReceipt(receiptId, options = {}) {
  return apiClient.post(buildReceiptActionPath(receiptId, 'confirm'), undefined, options);
}
