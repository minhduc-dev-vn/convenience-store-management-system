import { apiClient } from '../api';
import {
  buildInventoryLotListPath,
  buildInventoryProductListPath,
  buildInventoryProductLotsPath,
} from './inventoryQuery';

export {
  buildInventoryLotListPath,
  buildInventoryProductListPath,
  buildInventoryProductLotsPath,
} from './inventoryQuery';

export function listInventoryProducts(filters = {}, options = {}) {
  return apiClient.get(buildInventoryProductListPath(filters), options);
}

export function listInventoryLots(filters = {}, options = {}) {
  return apiClient.get(buildInventoryLotListPath(filters), options);
}

export function listInventoryProductLots(productId, filters = {}, options = {}) {
  return apiClient.get(buildInventoryProductLotsPath(productId, filters), options);
}
