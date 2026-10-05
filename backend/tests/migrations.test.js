'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  MigrationError,
  assertSafeDatabaseName,
  calculateChecksum,
  compareMigrationHistory,
  discoverMigrations,
  readLockTimeout,
} = require('../src/utils/migration-runner');

async function withMigrationDirectory(files, callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'convenience-store-migrations-'));
  try {
    await Promise.all(Object.entries(files).map(([fileName, content]) => (
      fs.writeFile(path.join(directory, fileName), content, 'utf8')
    )));
    return await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('migration discovery ignores the template and orders strict filenames', async () => {
  await withMigrationDirectory({
    '010_third.sql': 'SELECT 10;',
    '002_second.sql': 'SELECT 2;',
    '001_first.sql': 'SELECT 1;',
    '_template.sql': 'SELECT 999;',
    'notes.md': 'not a migration',
  }, async (directory) => {
    const migrations = await discoverMigrations(directory);

    assert.deepEqual(
      migrations.map((migration) => migration.fileName),
      ['001_first.sql', '002_second.sql', '010_third.sql'],
    );
    assert.equal(migrations[0].checksum, calculateChecksum(Buffer.from('SELECT 1;')));
  });
});

test('migration discovery rejects malformed filenames, duplicate sequences and batch separators', async () => {
  await withMigrationDirectory({ '1_bad.sql': 'SELECT 1;' }, async (directory) => {
    await assert.rejects(
      discoverMigrations(directory),
      (error) => error instanceof MigrationError && error.code === 'MALFORMED_MIGRATION_FILENAME',
    );
  });

  await withMigrationDirectory({
    '001_first.sql': 'SELECT 1;',
    '001_second.sql': 'SELECT 2;',
  }, async (directory) => {
    await assert.rejects(
      discoverMigrations(directory),
      (error) => error instanceof MigrationError && error.code === 'DUPLICATE_MIGRATION_SEQUENCE',
    );
  });

  await withMigrationDirectory({ '001_bad_batch.sql': 'SELECT 1;\nGO\nSELECT 2;' }, async (directory) => {
    await assert.rejects(
      discoverMigrations(directory),
      (error) => error instanceof MigrationError && error.code === 'MALFORMED_MIGRATION',
    );
  });
});

test('history comparison marks pending/applied and rejects changed or missing applied files', () => {
  const migrations = [
    {
      sequence: 0,
      id: '000_baseline',
      fileName: '000_baseline.sql',
      checksum: 'a'.repeat(64),
      sqlText: 'SELECT 1;',
    },
    {
      sequence: 1,
      id: '001_next',
      fileName: '001_next.sql',
      checksum: 'b'.repeat(64),
      sqlText: 'SELECT 2;',
    },
  ];

  const status = compareMigrationHistory(migrations, [{
    MigrationId: '000_baseline',
    FileName: '000_baseline.sql',
    Checksum: 'a'.repeat(64),
    AppliedAt: new Date('2026-10-05T00:00:00.000Z'),
    ExecutionTimeMs: 4,
  }]);
  assert.deepEqual(status.map((migration) => migration.status), ['APPLIED', 'PENDING']);

  assert.throws(
    () => compareMigrationHistory(migrations, [{
      MigrationId: '000_baseline',
      FileName: '000_baseline.sql',
      Checksum: 'c'.repeat(64),
      AppliedAt: new Date(),
      ExecutionTimeMs: 1,
    }]),
    (error) => error instanceof MigrationError && error.code === 'APPLIED_MIGRATION_MODIFIED',
  );

  assert.throws(
    () => compareMigrationHistory(migrations, [{
      MigrationId: '999_removed',
      FileName: '999_removed.sql',
      Checksum: 'd'.repeat(64),
      AppliedAt: new Date(),
      ExecutionTimeMs: 1,
    }]),
    (error) => error instanceof MigrationError && error.code === 'APPLIED_MIGRATION_MISSING',
  );
});
test('system database names are rejected case-insensitively', () => {
  for (const databaseName of ['master', 'MODEL', ' msdb ', 'tempdb']) {
    assert.throws(
      () => assertSafeDatabaseName(databaseName),
      (error) => error instanceof MigrationError && error.code === 'SYSTEM_DATABASE_REJECTED',
    );
  }

  assert.equal(assertSafeDatabaseName('ConvenienceStore_Test'), 'ConvenienceStore_Test');
});

test('migration lock timeout is bounded and defaults safely', () => {
  assert.equal(readLockTimeout(undefined), 15000);
  assert.equal(readLockTimeout('2500'), 2500);
  assert.throws(
    () => readLockTimeout('-1'),
    (error) => error instanceof MigrationError && error.code === 'INVALID_MIGRATION_LOCK_TIMEOUT',
  );
  assert.throws(
    () => readLockTimeout('600001'),
    (error) => error instanceof MigrationError && error.code === 'INVALID_MIGRATION_LOCK_TIMEOUT',
  );
});
