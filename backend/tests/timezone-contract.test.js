'use strict';

const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

function filesUnder(relativeDirectory, extension) {
  const directory = path.join(repositoryRoot, relativeDirectory);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return filesUnder(relativePath, extension);
    return entry.name.endsWith(extension) ? [relativePath] : [];
  });
}

test('persistent timestamp writers use UTC rather than SQL Server local time', () => {
  const productionFiles = [
    ...filesUnder('database/schema', '.sql'),
    ...filesUnder('database/procedures', '.sql'),
    ...filesUnder('database/views', '.sql'),
    ...filesUnder('backend/src', '.js'),
  ];
  const offenders = productionFiles.filter((file) => /\bSYSDATETIME\s*\(/i.test(read(file)));
  assert.deepEqual(offenders, []);

  const requiredUtcWriters = [
    'database/schema/01_identity.sql',
    'database/schema/03_inventory.sql',
    'database/schema/04_sales_returns_audit.sql',
    'database/procedures/07_receiving_transactions.sql',
    'database/procedures/09_sale_transactions.sql',
    'database/procedures/10_return_transactions.sql',
    'database/procedures/11_stocktake_transactions.sql',
    'backend/src/repositories/auth.repository.js',
    'backend/src/repositories/pos.repository.js',
  ];
  for (const file of requiredUtcWriters) {
    assert.match(read(file), /SYSUTCDATETIME\s*\(/i, `${file} must write UTC timestamps`);
  }
});

test('database drivers and business-date filters preserve the UTC contract', () => {
  assert.match(read('backend/src/config/database.config.js'), /useUTC:\s*true/);

  for (const file of [
    'backend/src/repositories/invoice.repository.js',
    'backend/src/repositories/customer.repository.js',
  ]) {
    const source = read(file);
    assert.match(source, /AT TIME ZONE 'SE Asia Standard Time'/);
    assert.match(source, /invoice\.NgayLap\s*>=\s*@UtcFrom/);
    assert.match(source, /invoice\.NgayLap\s*<\s*@UtcToExclusive/);
    assert.doesNotMatch(source, /CONVERT\([^\n]*invoice\.NgayLap/i);
  }

  const reports = read('database/procedures/13_business_reports.sql');
  assert.match(reports, /event\.NgayGiaoDich\s*>=\s*@TuNgayUtc/);
  assert.match(reports, /event\.NgayGiaoDich\s*<\s*@DenNgayKeTiepUtc/);
  assert.match(
    reports,
    /\(event\.NgayGiaoDich AT TIME ZONE 'UTC'\) AT TIME ZONE 'SE Asia Standard Time'/,
  );
});

test('timezone migration is additive, runner-safe and does not rewrite production rows', () => {
  const migration = read('database/migrations/002_fix_business_timezone.sql');
  assert.doesNotMatch(migration, /^\s*GO\s*$/im);
  assert.match(migration, /SYSUTCDATETIME\s*\(/i);
  assert.match(migration, /SE Asia Standard Time/);
  const migrationPreamble = migration.split('-- Module definitions')[0];
  assert.doesNotMatch(
    migrationPreamble,
    /\bUPDATE\s+(?:dbo\.)?(?:HOA_DON|PHIEU_TRA|PHIEU_NHAP|CA_LAM_VIEC|NHAT_KY_HE_THONG)\b/i,
  );
});
