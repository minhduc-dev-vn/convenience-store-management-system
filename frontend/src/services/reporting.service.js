import { apiClient } from '../api';
import {
  buildEmployeeReportPath,
  buildInventoryReportPath,
  buildProductReportPath,
  buildReceivingReportPath,
  buildRevenueReportPath,
  buildShiftReportPath,
} from './reportingQuery';

export * from './reportingQuery';

export function getRevenueReport(period, options = {}) {
  return apiClient.get(buildRevenueReportPath(period), options);
}

export function getProductReport(filters, options = {}) {
  return apiClient.get(buildProductReportPath(filters), options);
}

export function getInventoryReport(filters, options = {}) {
  return apiClient.get(buildInventoryReportPath(filters), options);
}

export function getReceivingReport(filters, options = {}) {
  return apiClient.get(buildReceivingReportPath(filters), options);
}

export function getEmployeeReport(filters, options = {}) {
  return apiClient.get(buildEmployeeReportPath(filters), options);
}

export function getShiftReport(filters, options = {}) {
  return apiClient.get(buildShiftReportPath(filters), options);
}
