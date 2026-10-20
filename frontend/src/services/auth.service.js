import { apiClient } from '../api';

export function login(credentials, options = {}) {
  return apiClient.post('/auth/login', credentials, {
    ...options,
    includeAuthorization: false,
  });
}

export function registerCustomer(registration, options = {}) {
  return apiClient.post('/auth/register', registration, {
    ...options,
    includeAuthorization: false,
  });
}

export function changePassword(passwords, options = {}) {
  return apiClient.patch('/auth/password', passwords, options);
}
