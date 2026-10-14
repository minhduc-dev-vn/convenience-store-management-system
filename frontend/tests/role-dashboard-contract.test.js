import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeInventoryMode } from '../src/components/inventoryPresentation.js';
import {
  getPrimaryNavigation,
  getRoleNavigation,
} from '../src/layouts/navigation.js';

function paths(role) {
  return getRoleNavigation(role).map((item) => item.to);
}

test('role navigation exposes only the modules assigned to each role', () => {
  assert.deepEqual(paths('CUSTOMER'), [
    '/customer',
    '/products',
    '/promotions',
    '/customer/history',
    '/customer/profile',
    '/account/change-password',
  ]);
  assert.deepEqual(paths('CASHIER'), [
    '/cashier',
    '/cashier/pos',
    '/cashier/invoices',
    '/cashier/returns',
    '/account/change-password',
  ]);
  assert.deepEqual(paths('WAREHOUSE'), [
    '/warehouse',
    '/warehouse/receiving/new',
    '/warehouse/receiving',
    '/warehouse/inventory',
    '/warehouse/stocktakes',
    '/account/change-password',
  ]);
  assert.ok(paths('MANAGER').includes('/manager/reports'));
  assert.ok(paths('MANAGER').includes('/manager/audit-logs'));
  assert.equal(paths('WAREHOUSE').includes('/manager/suppliers'), false);
  assert.deepEqual(getRoleNavigation('UNKNOWN'), []);
});

test('authenticated top navigation does not leak public or cross-role modules', () => {
  assert.deepEqual(
    getPrimaryNavigation(true, 'CASHIER').map((item) => item.to),
    ['/cashier', '/account/change-password'],
  );
  assert.ok(getPrimaryNavigation(false).some((item) => item.to === '/products'));
});

test('inventory alert links accept only supported server filter modes', () => {
  assert.equal(normalizeInventoryMode('LOW_STOCK'), 'LOW_STOCK');
  assert.equal(normalizeInventoryMode('NEAR_EXPIRY'), 'NEAR_EXPIRY');
  assert.equal(normalizeInventoryMode('EXPIRED'), 'EXPIRED');
  assert.equal(normalizeInventoryMode('invented-mode'), 'ALL');
  assert.equal(normalizeInventoryMode(null), 'ALL');
});

test('MH-04 dashboards use live services and remain protected by role routes', () => {
  const routes = readFileSync(new URL('../src/routes/AppRoutes.jsx', import.meta.url), 'utf8');
  const cashier = readFileSync(new URL('../src/pages/cashier/CashierDashboardPage.jsx', import.meta.url), 'utf8');
  const warehouse = readFileSync(new URL('../src/pages/warehouse/WarehouseDashboardPage.jsx', import.meta.url), 'utf8');
  const manager = readFileSync(new URL('../src/pages/manager/ManagerDashboardPage.jsx', import.meta.url), 'utf8');

  assert.match(routes, /ProtectedRoute allowedRoles=\{\['CASHIER'\]\}/);
  assert.match(routes, /ProtectedRoute allowedRoles=\{\['WAREHOUSE'\]\}/);
  assert.match(routes, /ProtectedRoute allowedRoles=\{\['MANAGER'\]\}/);
  assert.match(cashier, /getCurrentPosShift/);
  assert.match(cashier, /Doanh thu gộp/);
  assert.match(cashier, /Tiền hoàn/);
  assert.match(cashier, /Doanh thu thuần/);
  assert.match(cashier, /Tiền mặt thuần/);
  assert.match(cashier, /Không tiền mặt thuần/);
  assert.match(cashier, /shift\.isCarryOver \|\| reconciliation\?\.isCarryOver/);
  assert.match(cashier, /Ca này được mở từ ngày nghiệp vụ trước\./);
  assert.match(cashier, /Hãy đối chiếu và đóng ca nếu ca làm việc đã kết thúc/);
  assert.match(cashier, /<Notice tone="warning">/);
  assert.match(cashier, /<dt>Ngày nghiệp vụ<\/dt>/);
  assert.doesNotMatch(cashier, /<dt>Tổng doanh thu<\/dt>/);
  assert.match(warehouse, /mode: 'LOW_STOCK'/);
  assert.match(warehouse, /mode: 'NEAR_EXPIRY'/);
  assert.match(manager, /getRevenueReport/);
  assert.match(manager, /listManagerStocktakes/);
  assert.doesNotMatch(`${cashier}${warehouse}${manager}`, /mockData|demoMetrics|hardcodedKpi/i);
});

test('cashier dashboard spacing and sidebar remain scoped away from manager scrolling', () => {
  const css = readFileSync(new URL('../src/assets/app.css', import.meta.url), 'utf8');

  assert.match(
    css,
    /\.cashier-shift-page \.role-metric-grid \+ \.cashier-shift-workspace,[\s\S]*?\{[^}]*margin-top:\s*24px\s*;/,
  );
  assert.match(
    css,
    /@media\s*\(min-width:\s*1121px\)[\s\S]*?\.cashier-portal \.portal-sidebar\s*\{[^}]*max-height:\s*none\s*;[^}]*overflow-y:\s*visible\s*;/,
  );
  assert.match(
    css,
    /@media\s*\(min-width:\s*1121px\)[\s\S]*?\.manager-portal \.portal-sidebar\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*124px\)\s*;[^}]*overflow-y:\s*auto\s*;/,
  );
  assert.doesNotMatch(css, /\.cashier-portal \.portal-sidebar\s*\{[^}]*overflow-y:\s*auto\s*;/);
});
