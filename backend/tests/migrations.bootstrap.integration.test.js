'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { getDatabaseSettings } = require('../src/config/database.config');
const { getSqlDriver } = require('../src/config/database.driver');
const {
  createMigrationPool,
  runMigrations,
} = require('../src/utils/migration-runner');

const databaseDirectory = path.resolve(__dirname, '../../database');
const migrationsDirectory = path.join(databaseDirectory, 'migrations');
const sqlcmdExecutable = process.env.SQLCMD_PATH?.trim() || 'sqlcmd';
const bootstrapIntegrationEnabled = process.env.RUN_DB_INTEGRATION_TESTS === 'true'
  && process.env.RUN_DB_BOOTSTRAP_TESTS === 'true';
const bootstrapTest = bootstrapIntegrationEnabled ? test : test.skip;

const coreTables = [
  'VAI_TRO',
  'NHAN_VIEN',
  'KHACH_HANG',
  'TAI_KHOAN',
  'CA_LAM_VIEC',
  'LOAI_SAN_PHAM',
  'SAN_PHAM',
  'KHUYEN_MAI',
  'KHUYEN_MAI_SAN_PHAM',
  'NHA_CUNG_CAP',
  'PHIEU_NHAP',
  'LO_HANG',
  'CHI_TIET_PHIEU_NHAP',
  'KIEM_KE',
  'CHI_TIET_KIEM_KE',
  'GIAO_DICH_KHO',
  'HOA_DON',
  'CHI_TIET_HOA_DON',
  'CHI_TIET_XUAT_LO',
  'THANH_TOAN',
  'PHIEU_TRA',
  'CHI_TIET_PHIEU_TRA',
  'NHAT_KY_HE_THONG',
];

function assertDedicatedTestDatabaseName(rawName, label) {
  const databaseName = rawName?.trim();
  assert.ok(databaseName, `${label} is required when RUN_DB_BOOTSTRAP_TESTS=true.`);
  assert.match(
    databaseName,
    /^[A-Za-z][A-Za-z0-9_]{0,127}Test$/i,
    `${label} must be a safe SQL identifier ending in Test.`,
  );
  assert.doesNotMatch(databaseName, /^(master|model|msdb|tempdb)$/i);
  return databaseName;
}

function databaseSettingsFor(settings, databaseName) {
  return {
    driver: settings.driver,
    config: {
      ...settings.config,
      database: databaseName,
      options: { ...settings.config.options },
      pool: { ...settings.config.pool },
    },
  };
}

function sqlcmdServer(settings) {
  let server = settings.config.server;
  if (settings.config.options?.instanceName) {
    server = `${server}\\${settings.config.options.instanceName}`;
  }
  if (settings.config.port) {
    server = `${server},${settings.config.port}`;
  }
  return server;
}

function runSqlcmd(settings, { databaseName, inputFile, query }) {
  assert.notEqual(Boolean(inputFile), Boolean(query), 'Provide exactly one sqlcmd input file or query.');

  const args = [
    '-S', sqlcmdServer(settings),
    '-d', databaseName,
    '-b',
    '-I',
    '-C',
    '-f', '65001',
    '-l', '30',
  ];
  const childEnvironment = { ...process.env };

  if (settings.config.options?.trustedConnection) {
    args.push('-E');
  } else {
    assert.ok(settings.config.user, 'DB_USER is required for sqlcmd SQL authentication.');
    assert.ok(settings.config.password, 'DB_PASSWORD is required for sqlcmd SQL authentication.');
    args.push('-U', settings.config.user);
    childEnvironment.SQLCMDPASSWORD = settings.config.password;
  }

  if (inputFile) args.push('-i', inputFile);
  if (query) args.push('-Q', query);

  return new Promise((resolve, reject) => {
    const child = spawn(sqlcmdExecutable, args, {
      cwd: databaseDirectory,
      env: childEnvironment,
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      reject(new Error(`Unable to start sqlcmd for bootstrap verification: ${error.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      const diagnostic = `${stdout}\n${stderr}`.trim().slice(-4000);
      reject(new Error(`sqlcmd bootstrap verification failed with exit code ${code}.\n${diagnostic}`));
    });
  });
}

async function createDatabase(settings, databaseName) {
  await runSqlcmd(settings, {
    databaseName: 'master',
    query: `
      IF DB_ID(N'${databaseName}') IS NOT NULL
        THROW 54001, 'Dedicated bootstrap test database already exists.', 1;
      CREATE DATABASE [${databaseName}];
    `,
  });
}

async function dropCreatedDatabase(settings, databaseName) {
  await runSqlcmd(settings, {
    databaseName: 'master',
    query: `
      IF DB_ID(N'${databaseName}') IS NOT NULL
      BEGIN
        ALTER DATABASE [${databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
        DROP DATABASE [${databaseName}];
      END;
    `,
  });
}

async function readBootstrapState(pool) {
  const coreTableList = coreTables.map((tableName) => `'${tableName}'`).join(', ');
  const result = await pool.request().query(`
    SELECT
      COUNT(*) AS DboTableCount,
      SUM(CASE WHEN name IN (${coreTableList}) THEN 1 ELSE 0 END) AS CoreTableCount
    FROM sys.tables
    WHERE schema_id = SCHEMA_ID(N'dbo');

    SELECT MaVaiTro
    FROM dbo.VAI_TRO
    ORDER BY MaVaiTro;

    SELECT
      (SELECT COUNT(*) FROM dbo.NHAN_VIEN WHERE MaNV = 'NVDEV001') AS EmployeeCount,
      (SELECT COUNT(*) FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = 'LDEV001') AS CategoryCount,
      (SELECT COUNT(*) FROM dbo.SAN_PHAM WHERE MaSP = 'SPDEV001') AS ProductCount,
      (SELECT COUNT(*) FROM dbo.NHA_CUNG_CAP WHERE MaNCC = 'NCCDEV001') AS SupplierCount,
      (SELECT COUNT(*) FROM dbo.LO_HANG WHERE MaLo = 'LODEV001') AS LotCount;

    SELECT
      CASE WHEN OBJECT_ID(N'dbo.vw_TAI_KHOAN_VAI_TRO', N'V') IS NOT NULL THEN 1 ELSE 0 END AS HasView,
      CASE WHEN OBJECT_ID(N'dbo.usp_HOA_DON_HoanTatBanHang', N'P') IS NOT NULL THEN 1 ELSE 0 END AS HasProcedure,
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.SAN_PHAM', N'U')
          AND name = N'IX_SAN_PHAM_TenSP_TrangThai'
      ) THEN 1 ELSE 0 END AS HasIndex,
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.SAN_PHAM', N'U')
          AND name = N'CK_SAN_PHAM_GiaBan'
          AND is_disabled = 0
          AND is_not_trusted = 0
      ) THEN 1 ELSE 0 END AS HasTrustedCheck,
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID(N'dbo.SAN_PHAM', N'U')
          AND name = N'FK_SAN_PHAM_LOAI_SAN_PHAM'
          AND is_disabled = 0
          AND is_not_trusted = 0
      ) THEN 1 ELSE 0 END AS HasTrustedForeignKey,
      CASE WHEN COL_LENGTH(N'dbo.SAN_PHAM', N'ImageUrl') = 500
        THEN 1 ELSE 0 END AS HasProductImageColumn,
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.vw_SAN_PHAM_DANH_MUC', N'V')
          AND name = N'ImageUrl'
      ) THEN 1 ELSE 0 END AS ProductViewHasImageUrl,
      CASE WHEN OBJECT_ID(N'dbo.SCHEMA_MIGRATIONS', N'U') IS NOT NULL THEN 1 ELSE 0 END AS HasMigrationTable;
  `);

  return {
    counts: result.recordsets[0][0],
    roles: result.recordsets[1].map((row) => row.MaVaiTro),
    developmentSeed: result.recordsets[2][0],
    objects: result.recordsets[3][0],
  };
}

function assertBootstrapState(state, { developmentSeedExpected }) {
  assert.equal(state.counts.CoreTableCount, 23);
  assert.deepEqual(state.roles, ['CASHIER', 'CUSTOMER', 'MANAGER', 'WAREHOUSE']);
  assert.deepEqual(
    Object.values(state.developmentSeed).map(Number),
    developmentSeedExpected ? [1, 1, 1, 1, 1] : [0, 0, 0, 0, 0],
  );
  assert.deepEqual(
    {
      HasView: state.objects.HasView,
      HasProcedure: state.objects.HasProcedure,
      HasIndex: state.objects.HasIndex,
      HasTrustedCheck: state.objects.HasTrustedCheck,
      HasTrustedForeignKey: state.objects.HasTrustedForeignKey,
      HasProductImageColumn: state.objects.HasProductImageColumn,
      ProductViewHasImageUrl: state.objects.ProductViewHasImageUrl,
    },
    {
      HasView: 1,
      HasProcedure: 1,
      HasIndex: 1,
      HasTrustedCheck: 1,
      HasTrustedForeignKey: 1,
      HasProductImageColumn: 1,
      ProductViewHasImageUrl: 1,
    },
  );
}

async function readAppliedMigrationIds(pool) {
  const result = await pool.request().query(`
    SELECT MigrationId
    FROM dbo.SCHEMA_MIGRATIONS
    ORDER BY MigrationId;
  `);
  return result.recordset.map((row) => row.MigrationId);
}

async function runLocalBootstrapFlow(baseSettings, sql, databaseName) {
  await runSqlcmd(baseSettings, { databaseName, inputFile: '.\\init.sql' });

  let pool = createMigrationPool(databaseSettingsFor(baseSettings, databaseName), sql);
  try {
    await pool.connect();
    const initialState = await readBootstrapState(pool);
    assert.equal(initialState.counts.DboTableCount, 23);
    assert.equal(initialState.objects.HasMigrationTable, 0);
    assertBootstrapState(initialState, { developmentSeedExpected: true });

    const firstRun = await runMigrations({
      pool,
      sql,
      migrationsDirectory,
      expectedDatabaseName: databaseName,
      allowMigrations: true,
      lockTimeoutMs: 5000,
    });
    assert.deepEqual(firstRun.results.map((migration) => migration.action), ['APPLIED', 'APPLIED']);
    assert.deepEqual(
      await readAppliedMigrationIds(pool),
      ['000_baseline', '001_add_product_image_url'],
    );
  } finally {
    await pool.close().catch(() => {});
  }

  await runSqlcmd(baseSettings, { databaseName, inputFile: '.\\init.sql' });

  pool = createMigrationPool(databaseSettingsFor(baseSettings, databaseName), sql);
  try {
    await pool.connect();
    const rebuiltState = await readBootstrapState(pool);
    assert.equal(rebuiltState.objects.HasMigrationTable, 0, 'clean init must reset migration metadata');
    assertBootstrapState(rebuiltState, { developmentSeedExpected: true });

    const reapplied = await runMigrations({
      pool,
      sql,
      migrationsDirectory,
      expectedDatabaseName: databaseName,
      allowMigrations: true,
      lockTimeoutMs: 5000,
    });
    assert.deepEqual(reapplied.results.map((migration) => migration.action), ['APPLIED', 'APPLIED']);
    assert.deepEqual(
      await readAppliedMigrationIds(pool),
      ['000_baseline', '001_add_product_image_url'],
    );
  } finally {
    await pool.close().catch(() => {});
  }
}

async function runProductionBootstrapFlow(baseSettings, sql, databaseName) {
  await runSqlcmd(baseSettings, { databaseName, inputFile: '.\\init.production.sql' });

  const pool = createMigrationPool(databaseSettingsFor(baseSettings, databaseName), sql);
  try {
    await pool.connect();
    const initialState = await readBootstrapState(pool);
    assert.equal(initialState.counts.DboTableCount, 23);
    assert.equal(initialState.objects.HasMigrationTable, 0);
    assertBootstrapState(initialState, { developmentSeedExpected: false });

    const firstRun = await runMigrations({
      pool,
      sql,
      migrationsDirectory,
      expectedDatabaseName: databaseName,
      allowMigrations: true,
      lockTimeoutMs: 5000,
    });
    assert.deepEqual(firstRun.results.map((migration) => migration.action), ['APPLIED', 'APPLIED']);
    assert.deepEqual(
      await readAppliedMigrationIds(pool),
      ['000_baseline', '001_add_product_image_url'],
    );

    const secondRun = await runMigrations({
      pool,
      sql,
      migrationsDirectory,
      expectedDatabaseName: databaseName,
      allowMigrations: true,
      lockTimeoutMs: 5000,
    });
    assert.deepEqual(secondRun.results.map((migration) => migration.action), ['SKIPPED', 'SKIPPED']);

    const migratedState = await readBootstrapState(pool);
    assert.equal(migratedState.counts.CoreTableCount, 23);
    assert.equal(migratedState.counts.DboTableCount, 24);
    assert.equal(migratedState.objects.HasMigrationTable, 1);
    assertBootstrapState(migratedState, { developmentSeedExpected: false });
  } finally {
    await pool.close().catch(() => {});
  }
}

bootstrapTest('local and production bootstrap execute end to end on isolated SQL Server test databases', {
  timeout: 120000,
}, async () => {
  const baseSettings = getDatabaseSettings();
  const localDatabaseName = assertDedicatedTestDatabaseName(
    process.env.DB_BOOTSTRAP_LOCAL_TEST_NAME,
    'DB_BOOTSTRAP_LOCAL_TEST_NAME',
  );
  const productionDatabaseName = assertDedicatedTestDatabaseName(
    process.env.DB_BOOTSTRAP_PRODUCTION_TEST_NAME,
    'DB_BOOTSTRAP_PRODUCTION_TEST_NAME',
  );

  assert.notEqual(localDatabaseName.toLowerCase(), productionDatabaseName.toLowerCase());
  assert.notEqual(localDatabaseName.toLowerCase(), baseSettings.config.database.toLowerCase());
  assert.notEqual(productionDatabaseName.toLowerCase(), baseSettings.config.database.toLowerCase());
  assert.match(baseSettings.config.database, /test/i, 'DB_NAME must also identify a dedicated test database.');

  const sql = getSqlDriver(baseSettings.driver);
  const createdDatabases = [];

  try {
    await createDatabase(baseSettings, localDatabaseName);
    createdDatabases.push(localDatabaseName);
    await createDatabase(baseSettings, productionDatabaseName);
    createdDatabases.push(productionDatabaseName);

    await runLocalBootstrapFlow(baseSettings, sql, localDatabaseName);
    await runProductionBootstrapFlow(baseSettings, sql, productionDatabaseName);
  } finally {
    for (const databaseName of createdDatabases.reverse()) {
      await dropCreatedDatabase(baseSettings, databaseName);
    }
  }
});
