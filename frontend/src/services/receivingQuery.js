import { buildAdminQuery, encodeAdminId } from './adminQuery.js';

const RECEIPT_FILTERS = ['page', 'pageSize', 'search', 'status'];
const LOOKUP_FILTERS = ['page', 'pageSize', 'search'];
const RECEIVING_BASE = '/warehouse/receiving';

export function buildReceiptListPath(filters = {}) {
  return `${RECEIVING_BASE}/receipts${buildAdminQuery(filters, RECEIPT_FILTERS)}`;
}

export function buildReceiptPath(receiptId) {
  return `${RECEIVING_BASE}/receipts/${encodeAdminId(receiptId, 'receiptId')}`;
}

export function buildReceiptLinePath(receiptId, detailId) {
  return `${buildReceiptPath(receiptId)}/lines/${encodeAdminId(detailId, 'detailId')}`;
}

export function buildReceivingLookupPath(type, filters = {}) {
  if (!['products', 'suppliers'].includes(type)) {
    throw new TypeError('Receiving lookup type must be products or suppliers');
  }
  return `${RECEIVING_BASE}/${type}${buildAdminQuery(filters, LOOKUP_FILTERS)}`;
}

export function buildReceiptActionPath(receiptId, action) {
  if (!['cancel', 'confirm'].includes(action)) {
    throw new TypeError('Receipt action must be cancel or confirm');
  }
  return `${buildReceiptPath(receiptId)}/${action}`;
}
