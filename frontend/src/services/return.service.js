import { apiClient } from '../api';

export function createReturn(returnRequest, options = {}) {
  return apiClient.post('/returns', returnRequest, options);
}
