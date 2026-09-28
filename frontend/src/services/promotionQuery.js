import { buildAdminQuery, encodeAdminId } from './adminQuery.js';

const PUBLIC_PROMOTION_FILTERS = ['productId'];
const ADMIN_PROMOTION_FILTERS = ['page', 'pageSize', 'search', 'status', 'type'];

export function buildPublicPromotionListPath(filters = {}) {
  return `/promotions${buildAdminQuery(filters, PUBLIC_PROMOTION_FILTERS)}`;
}

export function buildPublicPromotionDetailPath(promotionId) {
  return `/promotions/${encodeAdminId(promotionId, 'promotionId')}`;
}

export function buildAdminPromotionListPath(filters = {}) {
  return `/admin/promotions${buildAdminQuery(filters, ADMIN_PROMOTION_FILTERS)}`;
}

export function buildAdminPromotionDetailPath(promotionId) {
  return `/admin/promotions/${encodeAdminId(promotionId, 'promotionId')}`;
}

export function buildAdminPromotionStatusPath(promotionId) {
  return `${buildAdminPromotionDetailPath(promotionId)}/status`;
}
