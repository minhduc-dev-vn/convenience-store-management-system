import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createRevenueCsv,
  getDefaultReportPeriod,
  validateReportPeriod,
} from '../src/pages/manager/reports/reportingPresentation.js';
import {
  buildEmployeeReportPath,
  buildInventoryReportPath,
  buildProductReportPath,
  buildReceivingReportPath,
  buildRevenueReportPath,
  buildShiftReportPath,
} from '../src/services/reportingQuery.js';

test('report service paths match all six C46 manager endpoints', () => {
  const period = { from: '2026-10-01', to: '2026-10-31' };
  assert.equal(buildRevenueReportPath(period), '/admin/reports/revenue?from=2026-10-01&to=2026-10-31');
  assert.equal(buildProductReportPath({ ...period, limit: 10 }), '/admin/reports/products?from=2026-10-01&to=2026-10-31&limit=10');
  assert.equal(buildInventoryReportPath({ page: 2, pageSize: 10 }), '/admin/reports/inventory?page=2&pageSize=10');
  assert.equal(buildReceivingReportPath({ ...period, page: 1, pageSize: 10 }), '/admin/reports/receiving?from=2026-10-01&to=2026-10-31&page=1&pageSize=10');
  assert.equal(buildEmployeeReportPath({ ...period, page: 1, pageSize: 10 }), '/admin/reports/employees?from=2026-10-01&to=2026-10-31&page=1&pageSize=10');
  assert.equal(buildShiftReportPath({ ...period, page: 1, pageSize: 10 }), '/admin/reports/shifts?from=2026-10-01&to=2026-10-31&page=1&pageSize=10');
});

test('report period defaults to current month and validates an inclusive range', () => {
  assert.deepEqual(getDefaultReportPeriod(new Date(2026, 9, 4, 12)), {
    from: '2026-10-01',
    to: '2026-10-04',
  });
  assert.equal(validateReportPeriod({ from: '2026-10-04', to: '2026-10-04' }), '');
  assert.match(validateReportPeriod({ from: '', to: '2026-10-04' }), /đầy đủ/);
  assert.match(validateReportPeriod({ from: '2026-10-05', to: '2026-10-04' }), /không được sau/);
  assert.match(validateReportPeriod({ from: '2026-02-30', to: '2026-03-01' }), /không hợp lệ/);
});

test('revenue export uses the authoritative summary and trend values', () => {
  const csv = createRevenueCsv({
    summary: {
      from: '2026-10-01',
      to: '2026-10-04',
      completedInvoiceCount: 2,
      grossRevenue: 300000,
      refundAmount: 50000,
      netRevenue: 250000,
    },
    trend: [{ date: '2026-10-04', completedInvoiceCount: 2, grossRevenue: 300000, refundAmount: 50000, netRevenue: 250000 }],
  });
  assert.match(csv, /Số hóa đơn hoàn tất,2/);
  assert.match(csv, /Doanh thu thuần,250000/);
  assert.match(csv, /2026-10-04,2,300000,50000,250000/);
});

test('MH-23, MH-24 and MH-25 are manager-only routes with navigation and required views', () => {
  const routes = readFileSync(new URL('../src/routes/AppRoutes.jsx', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../src/layouts/ManagerLayout.jsx', import.meta.url), 'utf8');
  const revenue = readFileSync(new URL('../src/pages/manager/reports/RevenueReportPage.jsx', import.meta.url), 'utf8');
  const merchandise = readFileSync(new URL('../src/pages/manager/reports/MerchandiseReportPage.jsx', import.meta.url), 'utf8');
  const workforce = readFileSync(new URL('../src/pages/manager/reports/WorkforceReportPage.jsx', import.meta.url), 'utf8');

  assert.match(routes, /ProtectedRoute allowedRoles=\{\['MANAGER'\]\}/);
  assert.match(routes, /path="reports\/revenue"/);
  assert.match(routes, /path="reports\/merchandise"/);
  assert.match(routes, /path="reports\/workforce"/);
  assert.match(layout, /\/manager\/reports/);
  assert.match(revenue, /Xuất PDF/);
  assert.match(revenue, /Xuất Excel/);
  assert.match(revenue, /RevenueTrendChart/);
  assert.match(merchandise, /CategoryDonutChart/);
  assert.match(merchandise, /Top 10 sản phẩm bán chạy/);
  assert.match(merchandise, /Tình hình nhập hàng/);
  assert.match(workforce, /HorizontalBarChart/);
  assert.match(workforce, /Lịch sử ca làm việc/);
});
