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

test('product images use deterministic contain frames without cropping', async () => {
  const styles = await readFile(path.join(sourceRoot, 'assets/app.css'), 'utf8');
  const imageRule = getCssRule(styles, '.product-image img');
  const cardRule = getCssRule(styles, '.product-card__visual');
  const thumbnailRule = getCssRule(styles, '.product-thumbnail');
  const previewRule = getCssRule(styles, '.product-form-preview__image');
  const detailRule = getCssRule(styles, '.product-detail-image');

  assert.match(imageRule, /object-fit:\s*contain\s*;/);
  assert.match(imageRule, /object-position:\s*center\s*;/);
  assert.doesNotMatch(imageRule, /object-fit:\s*cover\s*;/);

  assert.match(cardRule, /height:\s*180px\s*;/);
  assert.match(cardRule, /min-height:\s*180px\s*;/);
  assert.match(cardRule, /padding:\s*16px\s*;/);

  assert.match(thumbnailRule, /width:\s*52px\s*;/);
  assert.match(thumbnailRule, /height:\s*52px\s*;/);
  assert.match(thumbnailRule, /padding:\s*4px\s*;/);

  assert.match(previewRule, /width:\s*96px\s*;/);
  assert.match(previewRule, /height:\s*96px\s*;/);
  assert.match(previewRule, /padding:\s*8px\s*;/);

  assert.match(detailRule, /width:\s*100%\s*;/);
  assert.match(detailRule, /height:\s*240px\s*;/);
  assert.match(detailRule, /padding:\s*16px\s*;/);
});
