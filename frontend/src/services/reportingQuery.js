const PERIOD_FIELDS = ['from', 'to'];
const PAGINATION_FIELDS = ['page', 'pageSize'];

function buildQuery(fields, values = {}) {
  const query = new URLSearchParams();
  for (const field of fields) {
    const value = values[field];
    if (value !== undefined && value !== null && value !== '') {
      query.set(field, String(value));
    }
  }
  return query.size > 0 ? `?${query.toString()}` : '';
}

export function buildRevenueReportPath(period = {}) {
  return `/admin/reports/revenue${buildQuery(PERIOD_FIELDS, period)}`;
}

export function buildProductReportPath(filters = {}) {
  return `/admin/reports/products${buildQuery([...PERIOD_FIELDS, 'limit'], filters)}`;
}

export function buildInventoryReportPath(filters = {}) {
  return `/admin/reports/inventory${buildQuery(PAGINATION_FIELDS, filters)}`;
}

export function buildReceivingReportPath(filters = {}) {
  return `/admin/reports/receiving${buildQuery([...PERIOD_FIELDS, ...PAGINATION_FIELDS], filters)}`;
}

export function buildEmployeeReportPath(filters = {}) {
  return `/admin/reports/employees${buildQuery([...PERIOD_FIELDS, ...PAGINATION_FIELDS], filters)}`;
}

export function buildShiftReportPath(filters = {}) {
  return `/admin/reports/shifts${buildQuery([...PERIOD_FIELDS, ...PAGINATION_FIELDS], filters)}`;
}
