'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPOSITORY_DIRECTORY = path.join(__dirname, '..', 'src', 'repositories');
const TRUSTED_SQL_FRAGMENTS = new Set([
  'lockHint',
  "placeholders.join(', ')",
  "values.join(', ')",
  'index',
  'name',
  'SELLABLE_PRODUCT_CTE',
  'WORKFLOW_ACTIONS_SQL',
]);

test('repository SQL interpolation is limited to reviewed structural fragments', () => {
  const violations = [];
  for (const fileName of fs.readdirSync(REPOSITORY_DIRECTORY)) {
    if (!fileName.endsWith('.js')) continue;
    const source = fs.readFileSync(path.join(REPOSITORY_DIRECTORY, fileName), 'utf8');
    const interpolations = source.matchAll(/\$\{([^}]+)\}/g);
    for (const match of interpolations) {
      const expression = match[1].trim();
      if (!TRUSTED_SQL_FRAGMENTS.has(expression)) {
        violations.push(`${fileName}: ${expression}`);
      }
    }
  }

  assert.deepEqual(violations, [], `Unreviewed SQL interpolation: ${violations.join(', ')}`);
});
