import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

function getCssRule(styles, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));

  assert.ok(match, `Expected CSS rule for ${selector}`);
  return match[1];
}

test('home workspace cards retain titles without decorative codes or checkmarks', async () => {
  const home = await read('src/pages/HomePage.jsx');

  for (const title of ['Khách hàng', 'Thu ngân', 'Nhân viên kho', 'Quản lý']) {
    assert.ok(home.includes(`title: '${title}'`), `Missing workspace title ${title}`);
  }

  assert.doesNotMatch(home, /workspace-code/);
  assert.doesNotMatch(home, /workspace-arrow/);
  assert.doesNotMatch(home, /✓/);
  assert.match(home, /key=\{workspace\.title\}/);
});

test('public promotion highlights use every loaded promotion in a native carousel', async () => {
  const [catalog, styles] = await Promise.all([
    read('src/pages/customer/ProductCatalogPage.jsx'),
    read('src/assets/app.css'),
  ]);
  const carouselRule = getCssRule(styles, '.promotion-carousel');
  const carouselCardRule = getCssRule(styles, '.promotion-carousel .promotion-card');

  assert.match(catalog, /useRef/);
  assert.match(catalog, /promotionCarouselRef/);
  assert.match(catalog, /promotions\.data\.map\(\(promotion\)/);
  assert.doesNotMatch(catalog, /promotions\.data\.slice\(0,\s*4\)/);
  assert.match(catalog, /className="promotion-carousel"/);
  assert.match(catalog, /aria-label="Xem khuyến mãi trước"/);
  assert.match(catalog, /aria-label="Xem khuyến mãi tiếp theo"/);
  assert.match(catalog, /Xem tất cả ưu đãi/);
  assert.match(catalog, /<AsyncContent/);
  assert.match(carouselRule, /overflow-x:\s*auto\s*;/);
  assert.match(carouselRule, /overflow-y:\s*hidden\s*;/);
  assert.match(carouselRule, /grid-auto-flow:\s*column\s*;/);
  assert.match(carouselRule, /scroll-snap-type:\s*x mandatory\s*;/);
  assert.match(carouselCardRule, /scroll-snap-align:\s*start\s*;/);
});

test('manager sidebar scroll is viewport-constrained only in desktop layout', async () => {
  const styles = await read('src/assets/app.css');
  const desktopSidebarRule = getCssRule(styles, '.manager-portal .portal-sidebar');

  assert.match(styles, /@media\s*\(min-width:\s*1121px\)/);
  assert.match(desktopSidebarRule, /max-height:\s*calc\(100dvh\s*-\s*124px\)\s*;/);
  assert.match(desktopSidebarRule, /overflow-y:\s*auto\s*;/);
  assert.match(desktopSidebarRule, /overscroll-behavior-y:\s*contain\s*;/);
  assert.match(
    styles,
    /@media\s*\(max-width:\s*1120px\)[\s\S]*?\.manager-portal \.portal-sidebar\s*\{[^}]*max-height:\s*none\s*;[^}]*overflow-y:\s*visible\s*;[^}]*overscroll-behavior-y:\s*auto\s*;/,
  );
});

test('four manager data tables use scoped compact desktop variants', async () => {
  const [dataTable, employeePage, customerPage, productPage, promotionPage, styles] = await Promise.all([
    read('src/components/DataTable.jsx'),
    read('src/pages/manager/EmployeeManagementPage.jsx'),
    read('src/pages/manager/CustomerMemberManagementPage.jsx'),
    read('src/pages/manager/ProductManagementPage.jsx'),
    read('src/pages/manager/PromotionManagementPage.jsx'),
    read('src/assets/app.css'),
  ]);
  const compactTableRule = getCssRule(styles, '.data-table--xwide.manager-table');
  const compactCellRule = getCssRule(styles, '.manager-table th,\n  .manager-table td');
  const compactLastCellRule = getCssRule(styles, '.manager-table th:last-child,\n  .manager-table td:last-child');
  const compactHeaderRule = getCssRule(styles, '.manager-table th');
  const compactActionsRule = getCssRule(styles, '.manager-table .table-actions');
  const compactActionRule = getCssRule(styles, '.manager-table .table-action');
  const globalCellRule = getCssRule(styles, '.data-table th,\n.data-table td');
  const globalBreakableRule = getCssRule(styles, '.data-table__cell--breakable');
  const desktopManagerStyles = styles.slice(
    styles.indexOf('@media (min-width: 1121px)'),
    styles.indexOf('@media (max-width: 1120px)'),
  );
  const semanticColumnDeclarations = [...desktopManagerStyles.matchAll(
    /\.(?:employee|customer|product|promotion)-table__[\w-]+(?:\s*,[\s\S]*?)?\s*\{([^}]*)\}/g,
  )].map((match) => match[1]);

  assert.match(dataTable, /containerClassName = ''/);
  assert.match(dataTable, /\['table-scroll', containerClassName\]/);
  assert.match(dataTable, /className=\{scrollClassName\} tabIndex=\{0\}/);

  for (const [source, variant] of [
    [employeePage, 'employees'],
    [customerPage, 'customers'],
    [productPage, 'products'],
    [promotionPage, 'promotions'],
  ]) {
    assert.ok(source.includes(`manager-table manager-table--${variant}`));
    assert.ok(source.includes(`manager-table-scroll manager-table-scroll--${variant}`));
  }

  assert.match(compactTableRule, /width:\s*100%\s*;/);
  assert.match(compactTableRule, /min-width:\s*0\s*;/);
  assert.match(compactTableRule, /table-layout:\s*auto\s*;/);
  assert.doesNotMatch(compactTableRule, /table-layout:\s*fixed\s*;/);
  assert.doesNotMatch(styles, /\.manager-table-scroll\s*\{[^}]*overflow-x:\s*hidden\s*;/s);
  assert.match(compactCellRule, /padding:\s*7px 8px\s*;/);
  assert.match(compactCellRule, /border-right:\s*1px solid var\(--line\)\s*;/);
  assert.match(compactCellRule, /border-bottom:\s*1px solid var\(--line\)\s*;/);
  assert.match(compactLastCellRule, /border-right:\s*0\s*;/);
  assert.match(compactHeaderRule, /white-space:\s*nowrap\s*;/);
  assert.match(compactHeaderRule, /overflow-wrap:\s*normal\s*;/);
  assert.match(compactHeaderRule, /word-break:\s*normal\s*;/);
  assert.doesNotMatch(compactHeaderRule, /overflow-wrap:\s*anywhere|word-break:\s*break-all/);
  assert.match(compactActionsRule, /flex-direction:\s*row\s*;/);
  assert.match(compactActionsRule, /flex-wrap:\s*wrap\s*;/);
  assert.doesNotMatch(compactActionsRule, /flex-direction:\s*column\s*;/);
  assert.match(compactActionRule, /width:\s*auto\s*;/);
  assert.match(compactActionRule, /white-space:\s*nowrap\s*;/);
  assert.doesNotMatch(compactActionRule, /width:\s*100%\s*;/);
  assert.match(styles, /\.manager-table td\.employee-table__id,[\s\S]*?\.manager-table td\.promotion-table__status\s*\{[^}]*white-space:\s*nowrap\s*;/);
  assert.match(styles, /\.manager-table td\.employee-table__actions,[\s\S]*?\.manager-table td\.promotion-table__actions\s*\{[^}]*white-space:\s*normal\s*;/);
  assert.match(styles, /\.manager-table td\.employee-table__name,[\s\S]*?\.manager-table td\.promotion-table__period\s*\{[^}]*overflow-wrap:\s*break-word\s*;[^}]*word-break:\s*normal\s*;[^}]*white-space:\s*normal\s*;/);
  assert.ok(semanticColumnDeclarations.length >= 3);
  for (const declarations of semanticColumnDeclarations) {
    assert.doesNotMatch(declarations, /width:\s*\d+%\s*;/);
  }
  assert.doesNotMatch(desktopManagerStyles, /overflow-wrap:\s*anywhere|word-break:\s*break-all/);
  assert.match(styles, /\.manager-table--promotions \.table-date-range\s*\{[^}]*white-space:\s*normal\s*;/);
  assert.match(styles, /\.table-scroll\s*\{[^}]*overflow-x:\s*auto\s*;/s);
  assert.match(styles, /\.data-table--xwide\s*\{[^}]*--table-min-width:\s*1220px\s*;/s);
  assert.match(globalCellRule, /padding:\s*13px 16px\s*;/);
  assert.match(globalBreakableRule, /overflow-wrap:\s*anywhere\s*;/);
});
