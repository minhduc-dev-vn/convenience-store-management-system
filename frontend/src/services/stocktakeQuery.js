import { buildAdminQuery, encodeAdminId } from './adminQuery.js';

const STOCKTAKE_FILTERS = ['page', 'pageSize', 'search', 'status', 'workflowState'];

function buildStocktakePath(basePath, stocktakeId) {
  return `${basePath}/${encodeAdminId(stocktakeId, 'stocktakeId')}`;
}

export function buildWarehouseStocktakeListPath(filters = {}) {
  return `/warehouse/stocktakes${buildAdminQuery(filters, STOCKTAKE_FILTERS)}`;
}

export function buildWarehouseStocktakePath(stocktakeId) {
  return buildStocktakePath('/warehouse/stocktakes', stocktakeId);
}

export function buildWarehouseStocktakeLotPath(stocktakeId, lotId) {
  return `${buildWarehouseStocktakePath(stocktakeId)}/lots/${encodeAdminId(lotId, 'lotId')}`;
}

export function buildWarehouseStocktakeProposalPath(stocktakeId) {
  return `${buildWarehouseStocktakePath(stocktakeId)}/propose`;
}

export function buildManagerStocktakeListPath(filters = {}) {
  return `/admin/stocktakes${buildAdminQuery(filters, STOCKTAKE_FILTERS)}`;
}

export function buildManagerStocktakePath(stocktakeId) {
  return buildStocktakePath('/admin/stocktakes', stocktakeId);
}

export function buildManagerStocktakeDecisionPath(stocktakeId, decision) {
  if (!['approve', 'reject'].includes(decision)) {
    throw new TypeError('decision must be approve or reject');
  }
  return `${buildManagerStocktakePath(stocktakeId)}/${decision}`;
}
