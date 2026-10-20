import { apiClient } from '../api';

export function getProcessHealth(options = {}) {
  return apiClient.get('/health', {
    ...options,
    includeAuthorization: false,
  });
}

export function getDatabaseHealth(options = {}) {
  return apiClient.get('/health/db', {
    ...options,
    includeAuthorization: false,
  });
}

export async function getApplicationHealth(options = {}) {
  const [process, database] = await Promise.all([
    getProcessHealth(options),
    getDatabaseHealth(options),
  ]);

  return { process, database };
}
