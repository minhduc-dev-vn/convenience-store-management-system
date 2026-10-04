import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { screenMatrix } from '../scripts/screen-matrix.mjs';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('release matrix covers MH-01 through MH-28 without gaps', () => {
  assert.equal(screenMatrix.length, 28);
  assert.deepEqual(
    screenMatrix.map(({ id }) => id),
    Array.from({ length: 28 }, (_, index) => `MH-${String(index + 1).padStart(2, '0')}`),
  );
  screenMatrix.forEach(({ path, roles, title }) => {
    assert.match(path, /^\//);
    assert.ok(roles.length > 0);
    assert.ok(title.length > 0);
  });
});

test('application routes protect every authenticated role and lazy-load screens', async () => {
  const routes = await read('src/routes/AppRoutes.jsx');

  for (const role of ['CUSTOMER', 'CASHIER', 'WAREHOUSE', 'MANAGER']) {
    assert.match(routes, new RegExp(`allowedRoles=\\{\\['${role}'\\]\\}`));
  }

  for (const route of [
    'auth/login', 'auth/register', 'account/change-password', 'customer', 'manager', 'warehouse',
    'cashier', 'history', 'profile', 'employees', 'accounts', 'customers', 'products',
    'products/pricing', 'promotions', 'suppliers', 'inventory', 'stocktakes', 'invoices',
    'audit-logs', 'reports/revenue', 'reports/merchandise', 'reports/workforce', 'receiving',
    'receiving/new', 'pos', 'returns',
  ]) {
    assert.ok(routes.includes(`path="${route}"`), `Thiếu route ${route}`);
  }

  assert.match(routes, /lazy\(\(\) => import\(/);
  assert.match(routes, /<Suspense fallback=\{<LoadingState/);
});

test('shared states, responsive tables and small-screen rules remain available', async () => {
  const [components, styles] = await Promise.all([
    read('src/components/index.js'),
    read('src/assets/app.css'),
  ]);

  for (const state of ['LoadingState', 'ErrorState', 'EmptyState', 'AsyncContent']) {
    assert.ok(components.includes(state), `Thiếu shared state ${state}`);
  }

  assert.match(styles, /\.table-scroll\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)/);
  assert.match(styles, /@media\s*\(max-width:\s*680px\)/);
});

test('critical submissions keep an in-flight guard against double submit', async () => {
  const files = await Promise.all([
    read('src/components/pos/CheckoutDialog.jsx'),
    read('src/pages/cashier/CashierDashboardPage.jsx'),
    read('src/pages/cashier/CashierReturnPage.jsx'),
    read('src/pages/warehouse/ReceivingManagementPage.jsx'),
    read('src/pages/warehouse/StocktakePage.jsx'),
    read('src/pages/manager/StocktakeApprovalPage.jsx'),
  ]);

  files.forEach((source, index) => {
    assert.match(source, /isSubmitting|isCheckoutSubmitting|isProposing/,
      `Thiếu trạng thái submit ở critical file #${index + 1}`);
    assert.match(source, /disabled=/, `Thiếu disable guard ở critical file #${index + 1}`);
  });
});

test('release documentation contains every screen and all four role flows', async () => {
  const documentation = await read('README.md');

  screenMatrix.forEach(({ id }) => assert.ok(documentation.includes(id), `README thiếu ${id}`));
  for (const role of ['CUSTOMER', 'CASHIER', 'WAREHOUSE', 'MANAGER']) {
    assert.ok(documentation.includes(role), `README thiếu flow ${role}`);
  }
});
