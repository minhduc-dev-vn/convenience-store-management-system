import { apiClient } from '../api';
import {
  buildManagerStocktakeDecisionPath,
  buildManagerStocktakeListPath,
  buildManagerStocktakePath,
  buildWarehouseStocktakeListPath,
  buildWarehouseStocktakeLotPath,
  buildWarehouseStocktakePath,
  buildWarehouseStocktakeProposalPath,
} from './stocktakeQuery';

export {
  buildManagerStocktakeDecisionPath,
  buildManagerStocktakeListPath,
  buildManagerStocktakePath,
  buildWarehouseStocktakeListPath,
  buildWarehouseStocktakeLotPath,
  buildWarehouseStocktakePath,
  buildWarehouseStocktakeProposalPath,
} from './stocktakeQuery';

export function listWarehouseStocktakes(filters = {}, options = {}) {
  return apiClient.get(buildWarehouseStocktakeListPath(filters), options);
}

export function createStocktake(payload, options = {}) {
  return apiClient.post(buildWarehouseStocktakeListPath(), payload, options);
}

export function getWarehouseStocktake(stocktakeId, options = {}) {
  return apiClient.get(buildWarehouseStocktakePath(stocktakeId), options);
}

export function recordStocktakeCount(stocktakeId, lotId, payload, options = {}) {
  return apiClient.patch(buildWarehouseStocktakeLotPath(stocktakeId, lotId), payload, options);
}

export function proposeStocktake(stocktakeId, payload, options = {}) {
  return apiClient.post(buildWarehouseStocktakeProposalPath(stocktakeId), payload, options);
}

export function listManagerStocktakes(filters = {}, options = {}) {
  return apiClient.get(buildManagerStocktakeListPath(filters), options);
}

export function getManagerStocktake(stocktakeId, options = {}) {
  return apiClient.get(buildManagerStocktakePath(stocktakeId), options);
}

export function approveStocktake(stocktakeId, payload, options = {}) {
  return apiClient.post(buildManagerStocktakeDecisionPath(stocktakeId, 'approve'), payload, options);
}

export function rejectStocktake(stocktakeId, payload, options = {}) {
  return apiClient.post(buildManagerStocktakeDecisionPath(stocktakeId, 'reject'), payload, options);
}
