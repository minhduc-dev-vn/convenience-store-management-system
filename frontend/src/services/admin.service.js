import { apiClient } from '../api';
import { buildAdminQuery, encodeAdminId } from './adminQuery';

export { buildAdminQuery } from './adminQuery';

const EMPLOYEE_FILTER_FIELDS = ['page', 'pageSize', 'search', 'status'];
const ACCOUNT_FILTER_FIELDS = ['page', 'pageSize', 'search', 'ownerType', 'role', 'status'];

export function listEmployees(filters = {}, options = {}) {
  return apiClient.get(`/admin/employees${buildAdminQuery(filters, EMPLOYEE_FILTER_FIELDS)}`, options);
}

export function getEmployee(employeeId, options = {}) {
  return apiClient.get(`/admin/employees/${encodeAdminId(employeeId, 'employeeId')}`, options);
}

export function createEmployee(payload, options = {}) {
  return apiClient.post('/admin/employees', payload, options);
}

export function updateEmployee(employeeId, payload, options = {}) {
  return apiClient.patch(`/admin/employees/${encodeAdminId(employeeId, 'employeeId')}`, payload, options);
}

export function listAccounts(filters = {}, options = {}) {
  return apiClient.get(`/admin/accounts${buildAdminQuery(filters, ACCOUNT_FILTER_FIELDS)}`, options);
}

export function getAccount(accountId, options = {}) {
  return apiClient.get(`/admin/accounts/${encodeAdminId(accountId, 'accountId')}`, options);
}

export function createAccount(payload, options = {}) {
  return apiClient.post('/admin/accounts', payload, options);
}

export function updateAccountRole(accountId, role, options = {}) {
  return apiClient.patch(`/admin/accounts/${encodeAdminId(accountId, 'accountId')}/role`, { role }, options);
}

export function updateAccountStatus(accountId, status, options = {}) {
  return apiClient.patch(`/admin/accounts/${encodeAdminId(accountId, 'accountId')}/status`, { status }, options);
}

export function resetEmployeePassword(accountId, payload, options = {}) {
  return apiClient.post(
    `/admin/accounts/${encodeAdminId(accountId, 'accountId')}/reset-password`,
    payload,
    options,
  );
}
