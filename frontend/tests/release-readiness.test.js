import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getDataTableColumnClassName } from '../src/components/dataTableColumns.js';
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

test('portal layout uses the desktop viewport and tables scale by column count', async () => {
  const [layout, table, styles] = await Promise.all([
    read('src/layouts/AppLayout.jsx'),
    read('src/components/DataTable.jsx'),
    read('src/assets/app.css'),
  ]);

  assert.match(layout, /page-content--portal/);
  assert.match(layout, /site-header--portal/);
  assert.match(styles, /--portal-max-width:\s*1560px/);
  assert.match(styles, /@media\s*\(max-width:\s*1120px\)/);
  assert.match(styles, /\.portal-shell\s*\{[^}]*grid-template-columns:\s*224px\s+minmax\(0,\s*1fr\)/s);
  assert.doesNotMatch(styles, /body\s*\{[^}]*overflow-x:\s*hidden/s);

  assert.match(table, /data-table--xwide/);
  assert.match(table, /--table-min-width/);
  assert.match(styles, /\.data-table--xwide\s*\{[^}]*--table-min-width:\s*1220px/s);
  assert.match(styles, /\.data-table__cell--actions\s*\{[^}]*min-width:\s*164px/s);
  assert.match(styles, /\.data-table__cell--breakable\s*\{[^}]*white-space:\s*normal/s);
  assert.match(styles, /\.modal__body\s*\{[^}]*overflow-y:\s*auto/s);

  const footerRuleIndex = styles.indexOf('.site-footer {');
  const portalWidthRuleIndex = styles.indexOf('.site-header--portal,');
  const responsiveRuleIndex = styles.indexOf('@media (max-width: 1120px)');
  assert.ok(footerRuleIndex >= 0);
  assert.ok(portalWidthRuleIndex > footerRuleIndex, 'Portal width modifier must follow the base footer width');
  assert.ok(portalWidthRuleIndex < responsiveRuleIndex, 'Responsive widths must remain able to override portal width');
});

test('table column semantics wrap text and prioritize breakable identifiers', () => {
  for (const key of ['employeeId', 'productId', 'auditLogId', 'dateOfBirth', 'startDate', 'occurredAt', 'status', 'role', 'phone', 'barcode', 'price', 'quantity', 'unit']) {
    const classes = getDataTableColumnClassName({ key });
    assert.match(classes, /data-table__cell--nowrap/, `${key} must remain compact`);
  }

  for (const key of ['fullName', 'name', 'productName', 'category', 'description', 'address', 'owner']) {
    const classes = getDataTableColumnClassName({ key }) || '';
    assert.doesNotMatch(classes, /data-table__cell--nowrap/, `${key} must wrap normally`);
  }

  for (const key of ['email', 'username']) {
    const classes = getDataTableColumnClassName({ key, nowrap: true });
    assert.match(classes, /data-table__cell--breakable/, `${key} must be breakable`);
    assert.doesNotMatch(classes, /data-table__cell--nowrap/, `${key} must not remain nowrap`);
  }
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
