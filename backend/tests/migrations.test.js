'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  MigrationError,
  assertProductionMigrationConfiguration,
  assertProductionMigrationEnvironment,
  assertSafeDatabaseName,
  calculateChecksum,
  compareMigrationHistory,
  discoverMigrations,
  normalizeMigrationContent,
  readLockTimeout,
} = require('../src/utils/migration-runner');

const repositoryRoot = path.resolve(__dirname, '../..');

function productionSettings(overrides = {}) {
  return {
    driver: overrides.driver || 'tedious',
    config: {
      port: Object.hasOwn(overrides, 'port') ? overrides.port : 1433,
      options: {
        encrypt: Object.hasOwn(overrides, 'encrypt') ? overrides.encrypt : true,
        trustServerCertificate: Object.hasOwn(overrides, 'trustServerCertificate')
          ? overrides.trustServerCertificate
          : false,
        trustedConnection: Object.hasOwn(overrides, 'trustedConnection')
          ? overrides.trustedConnection
          : false,
        ...(overrides.instanceName ? { instanceName: overrides.instanceName } : {}),
      },
    },
  };
}

function productionEnvironment(overrides = {}) {
  return {
    DB_DRIVER: 'tedious',
    DB_TRUSTED_CONNECTION: 'false',
    DB_ENCRYPT: 'true',
    DB_TRUST_SERVER_CERTIFICATE: 'false',
    DB_INSTANCE: '',
    DB_PORT: '1433',
    ...overrides,
  };
}

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

test('repository migrations keep baseline first and add product image URL incrementally', async () => {
  const migrations = await discoverMigrations(path.join(repositoryRoot, 'database/migrations'));
  assert.deepEqual(
    migrations.map((migration) => migration.id),
    ['000_baseline', '001_add_product_image_url'],
  );

  const productImageMigration = migrations[1].sqlText;
  assert.match(productImageMigration, /ADD ImageUrl VARCHAR\(500\) NULL/i);
  assert.match(productImageMigration, /CREATE OR ALTER VIEW dbo\.vw_SAN_PHAM_DANH_MUC/i);
  assert.match(productImageMigration, /product\.ImageUrl/i);
  assert.doesNotMatch(productImageMigration, /^\s*GO\s*$/im);
});

test('migration checksum canonicalizes line endings and UTF-8 BOM without hiding SQL changes', () => {
  const lf = 'SELECT 1;\nSELECT 2;\n';
  const crlf = 'SELECT 1;\r\nSELECT 2;\r\n';
  const cr = 'SELECT 1;\rSELECT 2;\r';
  const bomCrlf = `\uFEFF${crlf}`;

  assert.equal(normalizeMigrationContent(crlf), lf);
  assert.equal(normalizeMigrationContent(cr), lf);
  assert.equal(normalizeMigrationContent(bomCrlf), lf);
  assert.equal(calculateChecksum(lf), calculateChecksum(crlf));
  assert.equal(calculateChecksum(lf), calculateChecksum(cr));
  assert.equal(calculateChecksum(lf), calculateChecksum(bomCrlf));
  assert.notEqual(calculateChecksum('SELECT 2;\n'), calculateChecksum('SELECT 3;\n'));
  assert.notEqual(calculateChecksum('SELECT 1; \n'), calculateChecksum('SELECT 1;\n'));
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

test('history comparison rejects pending migrations below the highest applied sequence', () => {
  const migrations = [1, 2, 3].map((sequence) => ({
    sequence,
    id: `${String(sequence).padStart(3, '0')}_migration`,
    fileName: `${String(sequence).padStart(3, '0')}_migration.sql`,
    checksum: String(sequence).repeat(64),
    sqlText: `SELECT ${sequence};`,
  }));
  const appliedRows = [migrations[0], migrations[2]].map((migration) => ({
    MigrationId: migration.id,
    FileName: migration.fileName,
    Checksum: migration.checksum,
    AppliedAt: new Date('2026-10-05T00:00:00.000Z'),
    ExecutionTimeMs: 1,
  }));

  assert.throws(
    () => compareMigrationHistory(migrations, appliedRows),
    (error) => error instanceof MigrationError && error.code === 'OUT_OF_ORDER_MIGRATION',
  );
});

test('history comparison accepts canonical line-ending checksum and still rejects SQL changes', () => {
  const migration = {
    sequence: 1,
    id: '001_line_endings',
    fileName: '001_line_endings.sql',
    checksum: calculateChecksum('SELECT 1;\r\nSELECT 2;\r\n'),
    sqlText: 'SELECT 1;\nSELECT 2;\n',
  };
  const applied = {
    MigrationId: migration.id,
    FileName: migration.fileName,
    Checksum: calculateChecksum('SELECT 1;\nSELECT 2;\n'),
    AppliedAt: new Date('2026-10-08T00:00:00.000Z'),
    ExecutionTimeMs: 1,
  };

  assert.equal(compareMigrationHistory([migration], [applied])[0].status, 'APPLIED');
  assert.throws(
    () => compareMigrationHistory([
      { ...migration, checksum: calculateChecksum('SELECT 1;\nSELECT 3;\n') },
    ], [applied]),
    (error) => error instanceof MigrationError && error.code === 'APPLIED_MIGRATION_MODIFIED',
  );
});

test('production migration configuration enforces Azure SQL TLS, TCP and port rules', () => {
  assert.throws(
    () => assertProductionMigrationConfiguration(productionSettings({ driver: 'msnodesqlv8' }), 'production'),
    (error) => error instanceof MigrationError && error.code === 'PRODUCTION_DRIVER_REJECTED',
  );
  assert.throws(
    () => assertProductionMigrationConfiguration(productionSettings({ trustedConnection: true }), 'production'),
    (error) => error instanceof MigrationError && error.code === 'PRODUCTION_TRUSTED_CONNECTION_REJECTED',
  );
  assert.throws(
    () => assertProductionMigrationConfiguration(productionSettings({ encrypt: false }), 'production'),
    (error) => error instanceof MigrationError && error.code === 'PRODUCTION_ENCRYPTION_REQUIRED',
  );
  assert.throws(
    () => assertProductionMigrationConfiguration(productionSettings({ trustServerCertificate: true }), 'production'),
    (error) => error instanceof MigrationError && error.code === 'PRODUCTION_TRUST_CERTIFICATE_REJECTED',
  );
  assert.throws(
    () => assertProductionMigrationConfiguration(productionSettings({ instanceName: 'SQLEXPRESS' }), 'production'),
    (error) => error instanceof MigrationError && error.code === 'PRODUCTION_INSTANCE_REJECTED',
  );
  assert.throws(
    () => assertProductionMigrationConfiguration(productionSettings({ port: 1434 }), 'production'),
    (error) => error instanceof MigrationError && error.code === 'PRODUCTION_PORT_REJECTED',
  );

  assert.doesNotThrow(() => assertProductionMigrationConfiguration(productionSettings(), 'production'));
  assert.doesNotThrow(() => assertProductionMigrationConfiguration(
    productionSettings({ driver: 'msnodesqlv8', encrypt: false, trustServerCertificate: true }),
    'development',
  ));
});

test('production migration environment rejects unsafe values before config parsing', () => {
  const cases = [
    [{ DB_DRIVER: 'msnodesqlv8' }, 'PRODUCTION_DRIVER_REJECTED'],
    [{ DB_TRUSTED_CONNECTION: 'true' }, 'PRODUCTION_TRUSTED_CONNECTION_REJECTED'],
    [{ DB_ENCRYPT: 'false' }, 'PRODUCTION_ENCRYPTION_REQUIRED'],
    [{ DB_TRUST_SERVER_CERTIFICATE: 'true' }, 'PRODUCTION_TRUST_CERTIFICATE_REJECTED'],
    [{ DB_INSTANCE: 'SQLEXPRESS' }, 'PRODUCTION_INSTANCE_REJECTED'],
    [{ DB_PORT: '1434' }, 'PRODUCTION_PORT_REJECTED'],
  ];

  for (const [overrides, expectedCode] of cases) {
    assert.throws(
      () => assertProductionMigrationEnvironment('production', productionEnvironment(overrides)),
      (error) => error instanceof MigrationError && error.code === expectedCode,
    );
  }

  assert.doesNotThrow(() => assertProductionMigrationEnvironment(
    'production',
    productionEnvironment(),
  ));
  assert.doesNotThrow(() => assertProductionMigrationEnvironment(
    'development',
    productionEnvironment({ DB_DRIVER: 'msnodesqlv8' }),
  ));
});

test('bootstrap entry points reset metadata locally and exclude development seed in production', async () => {
  const [dropScript, localInit, productionInit, sharedSchema] = await Promise.all([
    fs.readFile(path.join(repositoryRoot, 'database/schema/00_drop_core_schema.sql'), 'utf8'),
    fs.readFile(path.join(repositoryRoot, 'database/init.sql'), 'utf8'),
    fs.readFile(path.join(repositoryRoot, 'database/init.production.sql'), 'utf8'),
    fs.readFile(path.join(repositoryRoot, 'database/init.schema.sql'), 'utf8'),
  ]);

  assert.match(dropScript, /DROP TABLE dbo\.SCHEMA_MIGRATIONS/i);
  assert.match(localInit, /:r \.\\init\.schema\.sql/i);
  assert.match(localInit, /:r \.\\seed\\02_development_data\.sql/i);
  assert.match(productionInit, /:r \.\\init\.schema\.sql/i);
  assert.match(productionInit, /:r \.\\seed\\01_roles\.sql/i);
  assert.doesNotMatch(productionInit, /:r .*02_development_data\.sql/i);
  assert.match(productionInit, /Production bootstrap requires a new database with no dbo tables/i);
  assert.match(sharedSchema, /:r \.\\schema\\00_drop_core_schema\.sql/i);
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
