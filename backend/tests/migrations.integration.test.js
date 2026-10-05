'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { getDatabaseSettings } = require('../src/config/database.config');
const { getSqlDriver } = require('../src/config/database.driver');
const {
  MigrationError,
  createMigrationPool,
  getMigrationStatus,
  runMigrations,
} = require('../src/utils/migration-runner');

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === 'true' ? test : test.skip;
const productionMigrationsDirectory = path.resolve(__dirname, '../../database/migrations');

async function writeMigrations(files) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'convenience-store-migrations-integration-'));
  await Promise.all(Object.entries(files).map(([fileName, content]) => (
    fs.writeFile(path.join(directory, fileName), content, 'utf8')
  )));
  return directory;
}

async function cleanupTestObjects(pool) {
  await pool.request().batch(`
    IF OBJECT_ID(N'dbo.MIGRATION_TEST_ROLLBACK', N'U') IS NOT NULL
      DROP TABLE dbo.MIGRATION_TEST_ROLLBACK;
    IF OBJECT_ID(N'dbo.MIGRATION_TEST_EVENTS', N'U') IS NOT NULL
      DROP TABLE dbo.MIGRATION_TEST_EVENTS;
    IF OBJECT_ID(N'dbo.SCHEMA_MIGRATIONS', N'U') IS NOT NULL
      DELETE FROM dbo.SCHEMA_MIGRATIONS;
  `);
}

integrationTest('migration runner handles baseline, idempotency, rollback, checksum, ordering and locking', async () => {
  const settings = getDatabaseSettings();
  assert.match(
    settings.config.database,
    /test/i,
    'Migration integration tests require a dedicated DB_NAME containing "test".',
  );

  const sql = getSqlDriver(settings.driver);
  const pool = createMigrationPool(settings, sql);
  const lockHolderPool = createMigrationPool(settings, sql);
  const temporaryDirectories = [];
  let competingLockAcquired = false;

  async function migrate(migrationsDirectory, options = {}) {
    return runMigrations({
      pool,
      sql,
      migrationsDirectory,
      expectedDatabaseName: settings.config.database,
      allowMigrations: true,
      lockTimeoutMs: options.lockTimeoutMs ?? 5000,
    });
  }

  try {
    await pool.connect();
    await pool.request().batch(`
      IF OBJECT_ID(N'dbo.SCHEMA_MIGRATIONS', N'U') IS NOT NULL
        DROP TABLE dbo.SCHEMA_MIGRATIONS;
    `);

    const freshStatus = await getMigrationStatus({
      pool,
      migrationsDirectory: productionMigrationsDirectory,
      expectedDatabaseName: settings.config.database,
    });
    assert.equal(freshStatus.trackingTableExists, false);
    assert.deepEqual(freshStatus.migrations.map((migration) => migration.status), ['PENDING']);

    const absentCheck = await pool.request().query(`
      SELECT CASE WHEN OBJECT_ID(N'dbo.SCHEMA_MIGRATIONS', N'U') IS NULL THEN 1 ELSE 0 END AS IsAbsent;
    `);
    assert.equal(absentCheck.recordset[0].IsAbsent, 1, 'status must not create migration metadata');

    const firstRun = await migrate(productionMigrationsDirectory);
    assert.deepEqual(firstRun.results.map((migration) => migration.action), ['APPLIED']);

    const secondRun = await migrate(productionMigrationsDirectory);
    assert.deepEqual(secondRun.results.map((migration) => migration.action), ['SKIPPED']);

    const baselineRows = await pool.request().query(`
      SELECT MigrationId FROM dbo.SCHEMA_MIGRATIONS ORDER BY MigrationId;
    `);
    assert.deepEqual(baselineRows.recordset.map((row) => row.MigrationId), ['000_baseline']);

    const changedBaselineDirectory = await writeMigrations({
      '000_baseline.sql': `${await fs.readFile(path.join(productionMigrationsDirectory, '000_baseline.sql'), 'utf8')}\n-- changed after apply\n`,
    });
    temporaryDirectories.push(changedBaselineDirectory);
    await assert.rejects(
      migrate(changedBaselineDirectory),
      (error) => error instanceof MigrationError && error.code === 'APPLIED_MIGRATION_MODIFIED',
    );

    await cleanupTestObjects(pool);
    const failingDirectory = await writeMigrations({
      '901_create_marker.sql': `
        CREATE TABLE dbo.MIGRATION_TEST_EVENTS (SequenceValue INT NOT NULL);
        INSERT INTO dbo.MIGRATION_TEST_EVENTS (SequenceValue) VALUES (1);
      `,
      '902_force_failure.sql': `
        CREATE TABLE dbo.MIGRATION_TEST_ROLLBACK (Id INT NOT NULL);
        INSERT INTO dbo.MIGRATION_TEST_EVENTS (SequenceValue) VALUES (2);
        THROW 52902, 'forced migration failure', 1;
      `,
      '903_must_not_run.sql': `
        INSERT INTO dbo.MIGRATION_TEST_EVENTS (SequenceValue) VALUES (3);
      `,
    });
    temporaryDirectories.push(failingDirectory);

    await assert.rejects(
      migrate(failingDirectory),
      (error) => error instanceof MigrationError && error.code === 'MIGRATION_FAILED',
    );

    const failedState = await pool.request().query(`
      SELECT SequenceValue FROM dbo.MIGRATION_TEST_EVENTS ORDER BY SequenceValue;
      SELECT CASE WHEN OBJECT_ID(N'dbo.MIGRATION_TEST_ROLLBACK', N'U') IS NULL THEN 1 ELSE 0 END AS RolledBack;
      SELECT MigrationId FROM dbo.SCHEMA_MIGRATIONS ORDER BY MigrationId;
    `);
    assert.deepEqual(failedState.recordsets[0].map((row) => row.SequenceValue), [1]);
    assert.equal(failedState.recordsets[1][0].RolledBack, 1);
    assert.deepEqual(failedState.recordsets[2].map((row) => row.MigrationId), ['901_create_marker']);

    await cleanupTestObjects(pool);
    const orderingDirectory = await writeMigrations({
      '903_third.sql': 'INSERT INTO dbo.MIGRATION_TEST_EVENTS (SequenceValue) VALUES (3);',
      '901_first.sql': `
        CREATE TABLE dbo.MIGRATION_TEST_EVENTS (SequenceValue INT NOT NULL);
        INSERT INTO dbo.MIGRATION_TEST_EVENTS (SequenceValue) VALUES (1);
      `,
      '902_second.sql': 'INSERT INTO dbo.MIGRATION_TEST_EVENTS (SequenceValue) VALUES (2);',
    });
    temporaryDirectories.push(orderingDirectory);
    await migrate(orderingDirectory);

    const orderingState = await pool.request().query(`
      SELECT SequenceValue FROM dbo.MIGRATION_TEST_EVENTS ORDER BY SequenceValue;
    `);
    assert.deepEqual(orderingState.recordset.map((row) => row.SequenceValue), [1, 2, 3]);

    await cleanupTestObjects(pool);
    await migrate(productionMigrationsDirectory);

    await lockHolderPool.connect();
    const lockRequest = lockHolderPool.request();
    lockRequest.input('Resource', sql.NVarChar(255), 'ConvenienceStore.DatabaseMigration');
    const lockResult = await lockRequest.query(`
      DECLARE @Result INT;
      EXEC @Result = sys.sp_getapplock
        @Resource = @Resource,
        @LockMode = 'Exclusive',
        @LockOwner = 'Session',
        @LockTimeout = 0,
        @DbPrincipal = 'public';
      SELECT @Result AS LockResult;
    `);
    assert.ok(lockResult.recordset[0].LockResult >= 0);
    competingLockAcquired = true;

    await assert.rejects(
      migrate(productionMigrationsDirectory, { lockTimeoutMs: 0 }),
      (error) => error instanceof MigrationError && error.code === 'MIGRATION_LOCK_UNAVAILABLE',
    );
  } finally {
    if (competingLockAcquired) {
      const releaseRequest = lockHolderPool.request();
      releaseRequest.input('Resource', sql.NVarChar(255), 'ConvenienceStore.DatabaseMigration');
      await releaseRequest.query(`
        EXEC sys.sp_releaseapplock
          @Resource = @Resource,
          @LockOwner = 'Session',
          @DbPrincipal = 'public';
      `).catch(() => {});
    }
    await lockHolderPool.close().catch(() => {});

    let restoreError;
    try {
      await cleanupTestObjects(pool);
      await migrate(productionMigrationsDirectory);
    } catch (error) {
      restoreError = error;
    }
    await pool.close().catch(() => {});

    await Promise.all(temporaryDirectories.map((directory) => (
      fs.rm(directory, { recursive: true, force: true })
    )));

    if (restoreError) throw restoreError;
  }
});
