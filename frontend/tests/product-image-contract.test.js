import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(currentDirectory, '../src');

function getCssRule(styles, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));

  assert.ok(match, `Expected CSS rule for ${selector}`);
  return match[1];
}

test('public product image renders lazily and falls back after an image load error', async () => {
  const imageSource = await readFile(path.join(sourceRoot, 'components/ProductImage.jsx'), 'utf8');
  const cardSource = await readFile(path.join(sourceRoot, 'components/ProductCard.jsx'), 'utf8');
  const catalogSource = await readFile(
    path.join(sourceRoot, 'pages/customer/ProductCatalogPage.jsx'),
    'utf8',
  );
  const managerSource = await readFile(
    path.join(sourceRoot, 'pages/manager/ProductManagementPage.jsx'),
    'utf8',
  );

  assert.match(imageSource, /loading=\{loading\}/);
  assert.match(imageSource, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(imageSource, /imageUrl && !failed/);
  assert.match(imageSource, /getProductInitials\(name\)/);
  assert.match(cardSource, /imageUrl=\{product\.imageUrl\}/);
  assert.match(catalogSource, /className="product-detail-image"/);
  assert.match(catalogSource, /imageUrl=\{detail\.data\.imageUrl\}/);
  assert.match(managerSource, /className="product-thumbnail"/);
  assert.match(managerSource, /className="product-form-preview__image"/);
});

test('public cards use square cover images while shared manager presentation stays unchanged', async () => {
  const styles = await readFile(path.join(sourceRoot, 'assets/app.css'), 'utf8');
  const imageRule = getCssRule(styles, '.product-image img');
  const productCardRule = getCssRule(styles, '.product-card');
  const cardImageRule = getCssRule(styles, '.product-card__visual img');
  const detailImageRule = getCssRule(styles, '.product-detail-image img');
  const cardRule = getCssRule(styles, '.product-card__visual');
  const bodyRule = getCssRule(styles, '.product-card__body');
  const metaRule = getCssRule(styles, '.product-card__meta');
  const thumbnailRule = getCssRule(styles, '.product-thumbnail');
  const previewRule = getCssRule(styles, '.product-form-preview__image');
  const detailRule = getCssRule(styles, '.product-detail-image');

  assert.match(imageRule, /object-fit:\s*cover\s*;/);
  assert.doesNotMatch(imageRule, /object-fit:\s*contain\s*;/);

  assert.match(productCardRule, /display:\s*flex\s*;/);
  assert.match(productCardRule, /height:\s*100%\s*;/);
  assert.match(productCardRule, /flex-direction:\s*column\s*;/);

  assert.match(cardImageRule, /width:\s*100%\s*;/);
  assert.match(cardImageRule, /height:\s*100%\s*;/);
  assert.match(cardImageRule, /object-fit:\s*cover\s*;/);
  assert.match(cardImageRule, /object-position:\s*center\s*;/);
  assert.match(detailImageRule, /object-fit:\s*contain\s*;/);
  assert.match(detailImageRule, /object-position:\s*center\s*;/);

  assert.match(cardRule, /width:\s*100%\s*;/);
  assert.match(cardRule, /aspect-ratio:\s*1\s*\/\s*1\s*;/);
  assert.match(cardRule, /overflow:\s*hidden\s*;/);
  assert.doesNotMatch(cardRule, /(?:min-)?height:\s*180px\s*;/);
  assert.doesNotMatch(cardRule, /padding\s*:/);

  assert.match(bodyRule, /display:\s*flex\s*;/);
  assert.match(bodyRule, /flex:\s*1\s*;/);
  assert.match(bodyRule, /flex-direction:\s*column\s*;/);
  assert.match(metaRule, /margin-top:\s*auto\s*;/);

  assert.match(thumbnailRule, /width:\s*52px\s*;/);
  assert.match(thumbnailRule, /height:\s*52px\s*;/);
  assert.doesNotMatch(thumbnailRule, /padding\s*:/);

  assert.match(previewRule, /width:\s*96px\s*;/);
  assert.match(previewRule, /height:\s*96px\s*;/);
  assert.doesNotMatch(previewRule, /padding\s*:/);

  assert.match(detailRule, /width:\s*100%\s*;/);
  assert.match(detailRule, /height:\s*240px\s*;/);
  assert.doesNotMatch(detailRule, /padding\s*:/);
});
