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

async function restorePreNormalizationStockTransactionShape(pool) {
  await pool.request().batch(`
    IF COL_LENGTH(N'dbo.GIAO_DICH_KHO', N'MaSP') IS NULL
    BEGIN
      ALTER TABLE dbo.GIAO_DICH_KHO ADD MaSP VARCHAR(10) NULL;
      EXEC(N'
        UPDATE movement
        SET MaSP = lot.MaSP
        FROM dbo.GIAO_DICH_KHO AS movement
        JOIN dbo.LO_HANG AS lot ON lot.MaLo = movement.MaLo;

        ALTER TABLE dbo.GIAO_DICH_KHO ALTER COLUMN MaSP VARCHAR(10) NOT NULL;
      ');
    END;

    IF OBJECT_ID(N'dbo.FK_GIAO_DICH_KHO_SAN_PHAM', N'F') IS NULL
      EXEC(N'
        ALTER TABLE dbo.GIAO_DICH_KHO WITH CHECK
          ADD CONSTRAINT FK_GIAO_DICH_KHO_SAN_PHAM
          FOREIGN KEY (MaSP) REFERENCES dbo.SAN_PHAM (MaSP);
      ');
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
    await restorePreNormalizationStockTransactionShape(pool);
    await pool.request().batch(`
      IF OBJECT_ID(N'dbo.SCHEMA_MIGRATIONS', N'U') IS NOT NULL
        DROP TABLE dbo.SCHEMA_MIGRATIONS;
      EXEC(N'
        CREATE OR ALTER VIEW dbo.vw_SAN_PHAM_DANH_MUC
        AS
        SELECT
          product.MaSP, product.TenSP, product.MaVach, product.DonViTinh,
          product.GiaBan, product.MucTonToiThieu, product.MaLoai,
          category.TenLoai, category.TrangThai AS TrangThaiLoai, product.TrangThai
        FROM dbo.SAN_PHAM AS product
        JOIN dbo.LOAI_SAN_PHAM AS category ON category.MaLoai = product.MaLoai;
      ');
      IF COL_LENGTH(N'dbo.SAN_PHAM', N'ImageUrl') IS NOT NULL
        ALTER TABLE dbo.SAN_PHAM DROP COLUMN ImageUrl;
    `);

    const freshStatus = await getMigrationStatus({
      pool,
      migrationsDirectory: productionMigrationsDirectory,
      expectedDatabaseName: settings.config.database,
    });
    assert.equal(freshStatus.trackingTableExists, false);
    assert.deepEqual(
      freshStatus.migrations.map((migration) => migration.status),
      ['PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING'],
    );

    const absentCheck = await pool.request().query(`
      SELECT CASE WHEN OBJECT_ID(N'dbo.SCHEMA_MIGRATIONS', N'U') IS NULL THEN 1 ELSE 0 END AS IsAbsent;
    `);
    assert.equal(absentCheck.recordset[0].IsAbsent, 1, 'status must not create migration metadata');

    const firstRun = await migrate(productionMigrationsDirectory);
    assert.deepEqual(
      firstRun.results.map((migration) => migration.action),
      ['APPLIED', 'APPLIED', 'APPLIED', 'APPLIED', 'APPLIED', 'APPLIED', 'APPLIED'],
    );

    const secondRun = await migrate(productionMigrationsDirectory);
    assert.deepEqual(
      secondRun.results.map((migration) => migration.action),
      ['SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED'],
    );

    const baselineRows = await pool.request().query(`
      SELECT MigrationId FROM dbo.SCHEMA_MIGRATIONS ORDER BY MigrationId;
    `);
    assert.deepEqual(
      baselineRows.recordset.map((row) => row.MigrationId),
      [
        '000_baseline',
        '001_add_product_image_url',
        '002_fix_business_timezone',
        '003_normalize_inventory_transaction_3nf',
        '004_add_dbms_user_defined_functions',
        '005_add_dbms_business_triggers',
        '006_add_dbms_database_roles',
      ],
    );

    const imageSchema = await pool.request().query(`
      SELECT
        CASE WHEN COL_LENGTH(N'dbo.SAN_PHAM', N'ImageUrl') = 500 THEN 1 ELSE 0 END AS HasColumn,
        CASE WHEN EXISTS (
          SELECT 1
          FROM sys.columns
          WHERE object_id = OBJECT_ID(N'dbo.vw_SAN_PHAM_DANH_MUC', N'V')
            AND name = N'ImageUrl'
        ) THEN 1 ELSE 0 END AS ViewExposesColumn;
    `);
    assert.deepEqual(imageSchema.recordset[0], { HasColumn: 1, ViewExposesColumn: 1 });

    const changedBaselineDirectory = await writeMigrations({
      '000_baseline.sql': `${await fs.readFile(path.join(productionMigrationsDirectory, '000_baseline.sql'), 'utf8')}\n-- changed after apply\n`,
      '001_add_product_image_url.sql': await fs.readFile(
        path.join(productionMigrationsDirectory, '001_add_product_image_url.sql'),
        'utf8',
      ),
      '002_fix_business_timezone.sql': await fs.readFile(
        path.join(productionMigrationsDirectory, '002_fix_business_timezone.sql'),
        'utf8',
      ),
      '003_normalize_inventory_transaction_3nf.sql': await fs.readFile(
        path.join(productionMigrationsDirectory, '003_normalize_inventory_transaction_3nf.sql'),
        'utf8',
      ),
      '004_add_dbms_user_defined_functions.sql': await fs.readFile(
        path.join(productionMigrationsDirectory, '004_add_dbms_user_defined_functions.sql'),
        'utf8',
      ),
      '005_add_dbms_business_triggers.sql': await fs.readFile(
        path.join(productionMigrationsDirectory, '005_add_dbms_business_triggers.sql'),
        'utf8',
      ),
      '006_add_dbms_database_roles.sql': await fs.readFile(
        path.join(productionMigrationsDirectory, '006_add_dbms_database_roles.sql'),
        'utf8',
      ),
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
    const firstMigrationSql = `
      CREATE TABLE dbo.MIGRATION_TEST_EVENTS (SequenceValue INT NOT NULL);
      INSERT INTO dbo.MIGRATION_TEST_EVENTS (SequenceValue) VALUES (1);
    `;
    const thirdMigrationSql = 'INSERT INTO dbo.MIGRATION_TEST_EVENTS (SequenceValue) VALUES (3);';
    const partialHistoryDirectory = await writeMigrations({
      '901_first.sql': firstMigrationSql,
      '903_third.sql': thirdMigrationSql,
    });
    temporaryDirectories.push(partialHistoryDirectory);
    await migrate(partialHistoryDirectory);

    const outOfOrderDirectory = await writeMigrations({
      '901_first.sql': firstMigrationSql,
      '902_second.sql': 'INSERT INTO dbo.MIGRATION_TEST_EVENTS (SequenceValue) VALUES (2);',
      '903_third.sql': thirdMigrationSql,
    });
    temporaryDirectories.push(outOfOrderDirectory);
    await assert.rejects(
      migrate(outOfOrderDirectory),
      (error) => error instanceof MigrationError && error.code === 'OUT_OF_ORDER_MIGRATION',
    );

    const outOfOrderState = await pool.request().query(`
      SELECT SequenceValue FROM dbo.MIGRATION_TEST_EVENTS ORDER BY SequenceValue;
      SELECT MigrationId FROM dbo.SCHEMA_MIGRATIONS ORDER BY MigrationId;
    `);
    assert.deepEqual(outOfOrderState.recordsets[0].map((row) => row.SequenceValue), [1, 3]);
    assert.deepEqual(
      outOfOrderState.recordsets[1].map((row) => row.MigrationId),
      ['901_first', '903_third'],
    );

    await cleanupTestObjects(pool);
    await restorePreNormalizationStockTransactionShape(pool);
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
      await restorePreNormalizationStockTransactionShape(pool);
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
