import { apiClient } from '../api';
import {
  buildAdminPromotionDetailPath,
  buildAdminPromotionListPath,
  buildAdminPromotionStatusPath,
  buildPublicPromotionDetailPath,
  buildPublicPromotionListPath,
} from './promotionQuery';

export {
  buildAdminPromotionDetailPath,
  buildAdminPromotionListPath,
  buildAdminPromotionStatusPath,
  buildPublicPromotionDetailPath,
  buildPublicPromotionListPath,
} from './promotionQuery';

export function listPublicPromotions(filters = {}, options = {}) {
  return apiClient.get(buildPublicPromotionListPath(filters), {
    ...options,
    includeAuthorization: false,
  });
}

export function getPublicPromotion(promotionId, options = {}) {
  return apiClient.get(buildPublicPromotionDetailPath(promotionId), {
    ...options,
    includeAuthorization: false,
  });
}

export function listPromotions(filters = {}, options = {}) {
  return apiClient.get(buildAdminPromotionListPath(filters), options);
}

export function getPromotion(promotionId, options = {}) {
  return apiClient.get(buildAdminPromotionDetailPath(promotionId), options);
}

export function createPromotion(payload, options = {}) {
  return apiClient.post('/admin/promotions', payload, options);
}

export function updatePromotion(promotionId, payload, options = {}) {
  return apiClient.patch(buildAdminPromotionDetailPath(promotionId), payload, options);
}

export function updatePromotionStatus(promotionId, status, options = {}) {
  return apiClient.patch(buildAdminPromotionStatusPath(promotionId), { status }, options);
}
