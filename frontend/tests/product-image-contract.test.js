import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(currentDirectory, '../src');

test('public product image renders lazily and falls back after an image load error', async () => {
  const imageSource = await readFile(path.join(sourceRoot, 'components/ProductImage.jsx'), 'utf8');
  const cardSource = await readFile(path.join(sourceRoot, 'components/ProductCard.jsx'), 'utf8');
  const catalogSource = await readFile(
    path.join(sourceRoot, 'pages/customer/ProductCatalogPage.jsx'),
    'utf8',
  );

  assert.match(imageSource, /loading=\{loading\}/);
  assert.match(imageSource, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(imageSource, /imageUrl && !failed/);
  assert.match(imageSource, /getProductInitials\(name\)/);
  assert.match(cardSource, /imageUrl=\{product\.imageUrl\}/);
  assert.match(catalogSource, /className="product-detail-image"/);
  assert.match(catalogSource, /imageUrl=\{detail\.data\.imageUrl\}/);
});
