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
  const compactActionsRule = getCssRule(styles, '.manager-table .table-actions');
  const compactActionRule = getCssRule(styles, '.manager-table .table-action');

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
  assert.match(compactCellRule, /padding:\s*8px 6px\s*;/);
  assert.match(compactActionsRule, /flex-direction:\s*row\s*;/);
  assert.match(compactActionsRule, /flex-wrap:\s*wrap\s*;/);
  assert.doesNotMatch(compactActionsRule, /flex-direction:\s*column\s*;/);
  assert.match(compactActionRule, /width:\s*auto\s*;/);
  assert.doesNotMatch(compactActionRule, /width:\s*100%\s*;/);
  assert.match(styles, /\.employee-table__id,[\s\S]*?\.promotion-table__status\s*\{[^}]*width:\s*1%\s*;[^}]*white-space:\s*nowrap\s*;/);
  assert.match(styles, /\.employee-table__actions,[\s\S]*?\.promotion-table__actions\s*\{[^}]*width:\s*auto\s*;[^}]*white-space:\s*normal\s*;/);
  assert.match(styles, /\.employee-table__email,[\s\S]*?overflow-wrap:\s*anywhere\s*;[\s\S]*?white-space:\s*normal\s*;/);
  const semanticPercentageWidths = [...styles.matchAll(
    /\.(?:employee|customer|product|promotion)-table__[\w-]+\s*\{\s*width:\s*(\d+)%\s*;/g,
  )].map((match) => Number(match[1]));
  assert.ok(
    semanticPercentageWidths.every((width) => width === 1),
    'Manager semantic columns may only use the natural compact 1% width hint',
  );
  assert.match(styles, /\.manager-table--promotions \.table-date-range\s*\{[^}]*white-space:\s*normal\s*;/);
  assert.match(styles, /\.table-scroll\s*\{[^}]*overflow-x:\s*auto\s*;/s);
  assert.match(styles, /\.data-table--xwide\s*\{[^}]*--table-min-width:\s*1220px\s*;/s);
});
