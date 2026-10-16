'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { getDatabaseSettings } = require('../src/config/database.config');
const { getSqlDriver } = require('../src/config/database.driver');
const {
  createMigrationPool,
  getMigrationStatus,
  runMigrations,
} = require('../src/utils/migration-runner');

const databaseDirectory = path.resolve(__dirname, '../../database');
const migrationsDirectory = path.join(databaseDirectory, 'migrations');
const sqlcmdExecutable = process.env.SQLCMD_PATH?.trim() || 'sqlcmd';
const bootstrapIntegrationEnabled = process.env.RUN_DB_INTEGRATION_TESTS === 'true'
  && process.env.RUN_DB_BOOTSTRAP_TESTS === 'true';
const bootstrapTest = bootstrapIntegrationEnabled ? test : test.skip;
const normalizationIntegrationEnabled = process.env.RUN_DB_INTEGRATION_TESTS === 'true'
  && process.env.RUN_DB_NORMALIZATION_TESTS === 'true';
const normalizationTest = normalizationIntegrationEnabled ? test : test.skip;
const currentMigrationIds = [
  '000_baseline',
  '001_add_product_image_url',
  '002_fix_business_timezone',
  '003_normalize_inventory_transaction_3nf',
  '004_add_dbms_user_defined_functions',
  '005_add_dbms_business_triggers',
  '006_add_dbms_database_roles',
];

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
      CASE WHEN COL_LENGTH(N'dbo.GIAO_DICH_KHO', N'MaSP') IS NULL
             AND OBJECT_ID(N'dbo.FK_GIAO_DICH_KHO_SAN_PHAM', N'F') IS NULL
        THEN 1 ELSE 0 END AS HasNormalizedStockTransaction,
      (SELECT COUNT(*)
       FROM sys.foreign_keys
       WHERE schema_id = SCHEMA_ID(N'dbo')) AS ForeignKeyCount,
      (SELECT COUNT(*)
       FROM sys.objects
       WHERE schema_id = SCHEMA_ID(N'dbo')
         AND type IN ('FN', 'IF', 'TF')) AS FunctionCount,
      (SELECT COUNT(*)
       FROM sys.triggers AS trigger_definition
       JOIN sys.tables AS parent_table ON parent_table.object_id = trigger_definition.parent_id
       WHERE trigger_definition.parent_class = 1
         AND trigger_definition.is_ms_shipped = 0
         AND parent_table.schema_id = SCHEMA_ID(N'dbo')) AS TriggerCount,
      (SELECT COUNT(*)
       FROM sys.database_principals
       WHERE type = 'R'
         AND is_fixed_role = 0
         AND name IN (N'dbms_customer', N'dbms_cashier', N'dbms_warehouse', N'dbms_manager')) AS CustomRoleCount,
      CASE WHEN OBJECT_ID(N'dbo.SCHEMA_MIGRATIONS', N'U') IS NOT NULL THEN 1 ELSE 0 END AS HasMigrationTable;
  `);

  return {
    counts: result.recordsets[0][0],
    roles: result.recordsets[1].map((row) => row.MaVaiTro),
    developmentSeed: result.recordsets[2][0],
    objects: result.recordsets[3][0],
  };
}

function assertBootstrapState(state, { developmentSeedExpected, normalizedExpected }) {
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
      HasNormalizedStockTransaction: state.objects.HasNormalizedStockTransaction,
      ForeignKeyCount: state.objects.ForeignKeyCount,
      FunctionCount: state.objects.FunctionCount,
      TriggerCount: state.objects.TriggerCount,
      CustomRoleCount: state.objects.CustomRoleCount,
    },
    {
      HasView: 1,
      HasProcedure: 1,
      HasIndex: 1,
      HasTrustedCheck: 1,
      HasTrustedForeignKey: 1,
      HasProductImageColumn: 1,
      ProductViewHasImageUrl: 1,
      HasNormalizedStockTransaction: normalizedExpected ? 1 : 0,
      ForeignKeyCount: normalizedExpected ? 30 : 31,
      FunctionCount: normalizedExpected ? 5 : 0,
      TriggerCount: normalizedExpected ? 5 : 1,
      CustomRoleCount: normalizedExpected ? 4 : 0,
    },
  );
}

async function assertAllMigrationsPending(pool, databaseName) {
  const status = await getMigrationStatus({
    pool,
    migrationsDirectory,
    expectedDatabaseName: databaseName,
  });
  assert.equal(status.trackingTableExists, false);
  assert.deepEqual(
    status.migrations.map((migration) => migration.status),
    ['PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING'],
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

async function createPre003MigrationsDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'convenience-store-pre003-'));
  for (const fileName of [
    '000_baseline.sql',
    '001_add_product_image_url.sql',
    '002_fix_business_timezone.sql',
  ]) {
    await fs.copyFile(
      path.join(migrationsDirectory, fileName),
      path.join(directory, fileName),
    );
  }
  return directory;
}

async function runLocalBootstrapFlow(baseSettings, sql, databaseName) {
  await runSqlcmd(baseSettings, { databaseName, inputFile: '.\\init.sql' });

  let pool = createMigrationPool(databaseSettingsFor(baseSettings, databaseName), sql);
  try {
    await pool.connect();
    const initialState = await readBootstrapState(pool);
    assert.equal(initialState.counts.DboTableCount, 23);
    assert.equal(initialState.objects.HasMigrationTable, 0);
    assertBootstrapState(initialState, {
      developmentSeedExpected: true,
      normalizedExpected: false,
    });
    await assertAllMigrationsPending(pool, databaseName);

    const firstRun = await runMigrations({
      pool,
      sql,
      migrationsDirectory,
      expectedDatabaseName: databaseName,
      allowMigrations: true,
      lockTimeoutMs: 5000,
    });
    assert.deepEqual(
      firstRun.results.map((migration) => migration.action),
      ['APPLIED', 'APPLIED', 'APPLIED', 'APPLIED', 'APPLIED', 'APPLIED', 'APPLIED'],
    );
    assert.deepEqual(await readAppliedMigrationIds(pool), currentMigrationIds);
    assertBootstrapState(await readBootstrapState(pool), {
      developmentSeedExpected: true,
      normalizedExpected: true,
    });
  } finally {
    await pool.close().catch(() => {});
  }

  await runSqlcmd(baseSettings, { databaseName, inputFile: '.\\init.sql' });

  pool = createMigrationPool(databaseSettingsFor(baseSettings, databaseName), sql);
  try {
    await pool.connect();
    const rebuiltState = await readBootstrapState(pool);
    assert.equal(rebuiltState.counts.DboTableCount, 23);
    assert.equal(rebuiltState.objects.HasMigrationTable, 0, 'clean init must reset migration metadata');
    assertBootstrapState(rebuiltState, {
      developmentSeedExpected: true,
      normalizedExpected: false,
    });
    await assertAllMigrationsPending(pool, databaseName);

    const reapplied = await runMigrations({
      pool,
      sql,
      migrationsDirectory,
      expectedDatabaseName: databaseName,
      allowMigrations: true,
      lockTimeoutMs: 5000,
    });
    assert.deepEqual(
      reapplied.results.map((migration) => migration.action),
      ['APPLIED', 'APPLIED', 'APPLIED', 'APPLIED', 'APPLIED', 'APPLIED', 'APPLIED'],
    );
    assert.deepEqual(await readAppliedMigrationIds(pool), currentMigrationIds);
    assertBootstrapState(await readBootstrapState(pool), {
      developmentSeedExpected: true,
      normalizedExpected: true,
    });
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
    assertBootstrapState(initialState, {
      developmentSeedExpected: false,
      normalizedExpected: false,
    });
    await assertAllMigrationsPending(pool, databaseName);

    const firstRun = await runMigrations({
      pool,
      sql,
      migrationsDirectory,
      expectedDatabaseName: databaseName,
      allowMigrations: true,
      lockTimeoutMs: 5000,
    });
    assert.deepEqual(
      firstRun.results.map((migration) => migration.action),
      ['APPLIED', 'APPLIED', 'APPLIED', 'APPLIED', 'APPLIED', 'APPLIED', 'APPLIED'],
    );
    assert.deepEqual(await readAppliedMigrationIds(pool), currentMigrationIds);
    assertBootstrapState(await readBootstrapState(pool), {
      developmentSeedExpected: false,
      normalizedExpected: true,
    });

    const secondRun = await runMigrations({
      pool,
      sql,
      migrationsDirectory,
      expectedDatabaseName: databaseName,
      allowMigrations: true,
      lockTimeoutMs: 5000,
    });
    assert.deepEqual(
      secondRun.results.map((migration) => migration.action),
      ['SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED'],
    );

    const migratedState = await readBootstrapState(pool);
    assert.equal(migratedState.counts.CoreTableCount, 23);
    assert.equal(migratedState.counts.DboTableCount, 24);
    assert.equal(migratedState.objects.HasMigrationTable, 1);
    assertBootstrapState(migratedState, {
      developmentSeedExpected: false,
      normalizedExpected: true,
    });
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

normalizationTest('migration 003 preserves valid stock movements and rolls back inconsistent legacy data', {
  timeout: 120000,
}, async () => {
  const baseSettings = getDatabaseSettings();
  const databaseName = assertDedicatedTestDatabaseName(
    process.env.DB_MIGRATION_003_TEST_NAME,
    'DB_MIGRATION_003_TEST_NAME',
  );
  assert.notEqual(databaseName.toLowerCase(), baseSettings.config.database.toLowerCase());
  assert.match(baseSettings.config.database, /test/i, 'DB_NAME must identify a dedicated test database.');

  const sql = getSqlDriver(baseSettings.driver);
  const databaseSettings = databaseSettingsFor(baseSettings, databaseName);
  const pre003MigrationsDirectory = await createPre003MigrationsDirectory();
  let pool;
  let databaseCreated = false;

  async function connectPool() {
    pool = createMigrationPool(databaseSettings, sql);
    await pool.connect();
  }

  async function migrate(migrationDirectory) {
    return runMigrations({
      pool,
      sql,
      migrationsDirectory: migrationDirectory,
      expectedDatabaseName: databaseName,
      allowMigrations: true,
      lockTimeoutMs: 5000,
    });
  }

  try {
    await createDatabase(baseSettings, databaseName);
    databaseCreated = true;
    await runSqlcmd(baseSettings, { databaseName, inputFile: '.\\init.sql' });
    await connectPool();

    const pre003Run = await migrate(pre003MigrationsDirectory);
    assert.deepEqual(
      pre003Run.results.map((migration) => migration.action),
      ['APPLIED', 'APPLIED', 'APPLIED'],
    );

    const pre003Shape = await pool.request().query(`
      SELECT
        CASE WHEN COL_LENGTH(N'dbo.GIAO_DICH_KHO', N'MaSP') IS NOT NULL THEN 1 ELSE 0 END AS MaSPPresent,
        CASE WHEN OBJECT_ID(N'dbo.FK_GIAO_DICH_KHO_SAN_PHAM', N'F') IS NOT NULL THEN 1 ELSE 0 END AS ProductForeignKeyPresent;
    `);
    assert.deepEqual(
      Object.fromEntries(Object.entries(pre003Shape.recordset[0]).map(([key, value]) => [key, Number(value)])),
      { MaSPPresent: 1, ProductForeignKeyPresent: 1 },
    );

    const legacyInsert = await pool.request().batch(`
      INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, DonViTinh, GiaBan, MucTonToiThieu, MaLoai, TrangThai
      )
      VALUES ('C27P001', N'Sản phẩm migration 003', N'Cái', 12000, 1, 'LDEV001', 'ACTIVE');

      INSERT INTO dbo.LO_HANG (
        MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
      )
      VALUES ('C27L001', 'C27P001', 'C27-LOT-001', '2026-01-01', '2027-01-01', 8000, 7, 'ACTIVE');

      INSERT INTO dbo.GIAO_DICH_KHO (
        MaSP, MaLo, LoaiGiaoDich, SoLuongBienDong,
        ThoiGian, MaThamChieu, MaNV, GhiChu
      )
      VALUES (
        'C27P001', 'C27L001', 'IMPORT', 7,
        '2026-10-01T03:04:05', 'C27REF001', 'NVDEV001', N'Fixture bảo toàn migration 003'
      );

      SELECT
        MaGiaoDich, MaSP, MaLo, LoaiGiaoDich, SoLuongBienDong,
        ThoiGian, MaThamChieu, MaNV, GhiChu
      FROM dbo.GIAO_DICH_KHO
      WHERE MaThamChieu = 'C27REF001';
    `);
    assert.equal(legacyInsert.recordset.length, 1);
    const before = legacyInsert.recordset[0];
    assert.ok(before.MaGiaoDich);

    const normalizationRun = await migrate(migrationsDirectory);
    assert.deepEqual(
      normalizationRun.results.map((migration) => migration.action),
      ['SKIPPED', 'SKIPPED', 'SKIPPED', 'APPLIED', 'APPLIED', 'APPLIED', 'APPLIED'],
    );

    const preserved = await pool.request().query(`
      SELECT
        movement.MaGiaoDich,
        movement.MaLo,
        movement.LoaiGiaoDich,
        movement.SoLuongBienDong,
        movement.ThoiGian,
        movement.MaThamChieu,
        movement.MaNV,
        movement.GhiChu,
        lot.MaSP AS DerivedMaSP
      FROM dbo.GIAO_DICH_KHO AS movement
      JOIN dbo.LO_HANG AS lot ON lot.MaLo = movement.MaLo
      WHERE movement.MaThamChieu = 'C27REF001';

      SELECT
        CASE WHEN COL_LENGTH(N'dbo.GIAO_DICH_KHO', N'MaSP') IS NULL THEN 1 ELSE 0 END AS MaSPRemoved,
        CASE WHEN OBJECT_ID(N'dbo.FK_GIAO_DICH_KHO_SAN_PHAM', N'F') IS NULL THEN 1 ELSE 0 END AS ProductForeignKeyRemoved,
        CASE WHEN OBJECT_ID(N'dbo.FK_GIAO_DICH_KHO_LO_HANG', N'F') IS NOT NULL THEN 1 ELSE 0 END AS LotForeignKeyPresent,
        (SELECT COUNT(*) FROM dbo.GIAO_DICH_KHO WHERE MaThamChieu = 'C27REF001') AS MovementCount;

      SELECT MigrationId, ExecutionTimeMs, AppliedAt
      FROM dbo.SCHEMA_MIGRATIONS
      ORDER BY MigrationId;
    `);
    const after = preserved.recordsets[0][0];
    assert.deepEqual(
      {
        MaGiaoDich: String(after.MaGiaoDich),
        MaLo: after.MaLo,
        LoaiGiaoDich: after.LoaiGiaoDich,
        SoLuongBienDong: after.SoLuongBienDong,
        ThoiGian: after.ThoiGian.toISOString(),
        MaThamChieu: after.MaThamChieu,
        MaNV: after.MaNV,
        GhiChu: after.GhiChu,
        DerivedMaSP: after.DerivedMaSP,
      },
      {
        MaGiaoDich: String(before.MaGiaoDich),
        MaLo: before.MaLo,
        LoaiGiaoDich: before.LoaiGiaoDich,
        SoLuongBienDong: before.SoLuongBienDong,
        ThoiGian: before.ThoiGian.toISOString(),
        MaThamChieu: before.MaThamChieu,
        MaNV: before.MaNV,
        GhiChu: before.GhiChu,
        DerivedMaSP: before.MaSP,
      },
    );
    assert.deepEqual(
      Object.fromEntries(Object.entries(preserved.recordsets[1][0]).map(([key, value]) => [key, Number(value)])),
      {
        MaSPRemoved: 1,
        ProductForeignKeyRemoved: 1,
        LotForeignKeyPresent: 1,
        MovementCount: 1,
      },
    );
    assert.deepEqual(
      preserved.recordsets[2].map((row) => row.MigrationId),
      currentMigrationIds,
    );
    assert.ok(preserved.recordsets[2].every((row) => row.AppliedAt instanceof Date));
    assert.ok(preserved.recordsets[2].every((row) => Number(row.ExecutionTimeMs) >= 0));

    const secondRun = await migrate(migrationsDirectory);
    assert.deepEqual(
      secondRun.results.map((migration) => migration.action),
      ['SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED'],
    );

    await pool.close();
    pool = undefined;
    await runSqlcmd(baseSettings, { databaseName, inputFile: '.\\init.sql' });
    await connectPool();
    await migrate(pre003MigrationsDirectory);

    await pool.request().batch(`
      INSERT INTO dbo.SAN_PHAM (
        MaSP, TenSP, DonViTinh, GiaBan, MucTonToiThieu, MaLoai, TrangThai
      )
      VALUES ('C27P002', N'Sản phẩm sai lịch sử', N'Cái', 15000, 1, 'LDEV001', 'ACTIVE');

      INSERT INTO dbo.GIAO_DICH_KHO (
        MaSP, MaLo, LoaiGiaoDich, SoLuongBienDong,
        ThoiGian, MaThamChieu, MaNV, GhiChu
      )
      VALUES (
        'C27P002', 'LODEV001', 'IMPORT', 1,
        '2026-10-02T03:04:05', 'C27BAD001', 'NVDEV001', N'Fixture mismatch migration 003'
      );
    `);

    await assert.rejects(
      migrate(migrationsDirectory),
      (error) => error.code === 'MIGRATION_FAILED'
        && /003_normalize_inventory_transaction_3nf/.test(error.message)
        && /historical product\/lot values conflict/i.test(error.cause?.message || ''),
    );

    const rolledBack = await pool.request().query(`
      SELECT
        CASE WHEN COL_LENGTH(N'dbo.GIAO_DICH_KHO', N'MaSP') IS NOT NULL THEN 1 ELSE 0 END AS MaSPStillPresent,
        CASE WHEN OBJECT_ID(N'dbo.FK_GIAO_DICH_KHO_SAN_PHAM', N'F') IS NOT NULL THEN 1 ELSE 0 END AS ProductForeignKeyStillPresent,
        (SELECT COUNT(*) FROM dbo.GIAO_DICH_KHO
         WHERE MaThamChieu = 'C27BAD001' AND MaSP = 'C27P002' AND MaLo = 'LODEV001') AS InvalidMovementPreserved,
        (SELECT COUNT(*) FROM dbo.SCHEMA_MIGRATIONS
         WHERE MigrationId = '003_normalize_inventory_transaction_3nf') AS NormalizationMetadataCount;
    `);
    assert.deepEqual(
      Object.fromEntries(Object.entries(rolledBack.recordset[0]).map(([key, value]) => [key, Number(value)])),
      {
        MaSPStillPresent: 1,
        ProductForeignKeyStillPresent: 1,
        InvalidMovementPreserved: 1,
        NormalizationMetadataCount: 0,
      },
    );
    assert.deepEqual(
      await readAppliedMigrationIds(pool),
      currentMigrationIds.slice(0, 3),
    );
  } finally {
    if (pool) await pool.close().catch(() => {});
    if (databaseCreated) await dropCreatedDatabase(baseSettings, databaseName);
    await fs.rm(pre003MigrationsDirectory, { recursive: true, force: true });
  }
});
