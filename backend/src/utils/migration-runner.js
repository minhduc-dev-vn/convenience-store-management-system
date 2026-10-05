'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const MIGRATION_FILENAME_PATTERN = /^(\d{3})_([a-z0-9_]+)\.sql$/;
const SYSTEM_DATABASES = new Set(['master', 'model', 'msdb', 'tempdb']);
const LOCK_RESOURCE = 'ConvenienceStore.DatabaseMigration';
const TRACKING_TABLE = 'dbo.SCHEMA_MIGRATIONS';

class MigrationError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'MigrationError';
    this.code = code;
  }
}

function assertSafeDatabaseName(databaseName) {
  const normalized = databaseName?.trim().toLowerCase();

  if (!normalized) {
    throw new MigrationError('DATABASE_NAME_REQUIRED', 'A target database name is required.');
  }

  if (SYSTEM_DATABASES.has(normalized)) {
    throw new MigrationError(
      'SYSTEM_DATABASE_REJECTED',
      `Database migrations are not allowed against the SQL Server system database "${databaseName}".`,
    );
  }

  return databaseName.trim();
}

function readLockTimeout(value = process.env.DB_MIGRATION_LOCK_TIMEOUT_MS) {
  if (value === undefined || value === null || value === '') return 15000;

  const timeout = Number.parseInt(value, 10);
  if (!Number.isInteger(timeout) || timeout < 0 || timeout > 600000) {
    throw new MigrationError(
      'INVALID_MIGRATION_LOCK_TIMEOUT',
      'DB_MIGRATION_LOCK_TIMEOUT_MS must be an integer between 0 and 600000.',
    );
  }

  return timeout;
}

function assertProductionMigrationEnvironment(environment = process.env.NODE_ENV, env = process.env) {
  if (environment !== 'production') return;

  if (env.DB_DRIVER?.trim().toLowerCase() !== 'tedious') {
    throw new MigrationError(
      'PRODUCTION_DRIVER_REJECTED',
      'Production migrations require DB_DRIVER=tedious with SQL authentication over TCP.',
    );
  }

  if (env.DB_TRUSTED_CONNECTION?.trim().toLowerCase() !== 'false') {
    throw new MigrationError(
      'PRODUCTION_TRUSTED_CONNECTION_REJECTED',
      'Production migrations require DB_TRUSTED_CONNECTION=false.',
    );
  }

  if (env.DB_ENCRYPT?.trim().toLowerCase() !== 'true') {
    throw new MigrationError(
      'PRODUCTION_ENCRYPTION_REQUIRED',
      'Production migrations require DB_ENCRYPT=true.',
    );
  }

  if (env.DB_TRUST_SERVER_CERTIFICATE?.trim().toLowerCase() !== 'false') {
    throw new MigrationError(
      'PRODUCTION_TRUST_CERTIFICATE_REJECTED',
      'Production migrations require DB_TRUST_SERVER_CERTIFICATE=false.',
    );
  }

  if (env.DB_INSTANCE?.trim()) {
    throw new MigrationError(
      'PRODUCTION_INSTANCE_REJECTED',
      'Production Azure SQL migrations require DB_INSTANCE to be empty.',
    );
  }

  if (env.DB_PORT?.trim() !== '1433') {
    throw new MigrationError(
      'PRODUCTION_PORT_REJECTED',
      'Production Azure SQL migrations require DB_PORT=1433.',
    );
  }
}

function assertProductionMigrationConfiguration(settings, environment = process.env.NODE_ENV) {
  if (environment !== 'production') return;

  if (settings.driver !== 'tedious') {
    throw new MigrationError(
      'PRODUCTION_DRIVER_REJECTED',
      'Production migrations require DB_DRIVER=tedious with SQL authentication over TCP.',
    );
  }

  const options = settings.config?.options || {};
  if (options.trustedConnection === true) {
    throw new MigrationError(
      'PRODUCTION_TRUSTED_CONNECTION_REJECTED',
      'Production migrations require DB_TRUSTED_CONNECTION=false.',
    );
  }

  if (options.encrypt !== true) {
    throw new MigrationError(
      'PRODUCTION_ENCRYPTION_REQUIRED',
      'Production migrations require DB_ENCRYPT=true.',
    );
  }

  if (options.trustServerCertificate !== false) {
    throw new MigrationError(
      'PRODUCTION_TRUST_CERTIFICATE_REJECTED',
      'Production migrations require DB_TRUST_SERVER_CERTIFICATE=false.',
    );
  }

  if (options.instanceName) {
    throw new MigrationError(
      'PRODUCTION_INSTANCE_REJECTED',
      'Production Azure SQL migrations require DB_INSTANCE to be empty.',
    );
  }

  if (settings.config?.port !== 1433) {
    throw new MigrationError(
      'PRODUCTION_PORT_REJECTED',
      'Production Azure SQL migrations require DB_PORT=1433.',
    );
  }
}

function calculateChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function validateMigrationSql(fileName, sqlText) {
  if (!sqlText.trim()) {
    throw new MigrationError('MALFORMED_MIGRATION', `Migration ${fileName} is empty.`);
  }

  if (/^\s*GO(?:\s*--.*)?\s*$/gim.test(sqlText)) {
    throw new MigrationError(
      'MALFORMED_MIGRATION',
      `Migration ${fileName} contains a GO batch separator, which the Node migration runner does not support.`,
    );
  }

  if (/^\s*:(?:r|setvar|on\s+error)\b/gim.test(sqlText)) {
    throw new MigrationError(
      'MALFORMED_MIGRATION',
      `Migration ${fileName} contains a sqlcmd directive, which is not allowed in production migrations.`,
    );
  }
}

async function discoverMigrations(migrationsDirectory) {
  let entries;
  try {
    entries = await fs.readdir(migrationsDirectory, { withFileTypes: true });
  } catch (error) {
    throw new MigrationError(
      'MIGRATION_DIRECTORY_UNAVAILABLE',
      `Cannot read migration directory: ${migrationsDirectory}`,
      { cause: error },
    );
  }

  const migrationEntries = [];
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.sql') continue;
    if (entry.name === '_template.sql') continue;

    const match = MIGRATION_FILENAME_PATTERN.exec(entry.name);
    if (!match) {
      throw new MigrationError(
        'MALFORMED_MIGRATION_FILENAME',
        `Invalid migration filename ${entry.name}; expected NNN_lowercase_name.sql.`,
      );
    }

    const buffer = await fs.readFile(path.join(migrationsDirectory, entry.name));
    const sqlText = buffer.toString('utf8').replace(/^\uFEFF/, '');
    validateMigrationSql(entry.name, sqlText);

    migrationEntries.push({
      sequence: Number.parseInt(match[1], 10),
      id: entry.name.slice(0, -4),
      fileName: entry.name,
      checksum: calculateChecksum(buffer),
      sqlText,
    });
  }

  migrationEntries.sort((left, right) => left.fileName.localeCompare(right.fileName, 'en'));

  const seenSequences = new Set();
  const seenIds = new Set();
  const seenFileNames = new Set();
  for (const migration of migrationEntries) {
    const normalizedId = migration.id.toLowerCase();
    const normalizedFileName = migration.fileName.toLowerCase();

    if (seenSequences.has(migration.sequence)) {
      throw new MigrationError(
        'DUPLICATE_MIGRATION_SEQUENCE',
        `Migration sequence ${String(migration.sequence).padStart(3, '0')} is duplicated.`,
      );
    }
    if (seenIds.has(normalizedId)) {
      throw new MigrationError('DUPLICATE_MIGRATION_ID', `Migration id ${migration.id} is duplicated.`);
    }
    if (seenFileNames.has(normalizedFileName)) {
      throw new MigrationError(
        'DUPLICATE_MIGRATION_FILENAME',
        `Migration filename ${migration.fileName} is duplicated.`,
      );
    }

    seenSequences.add(migration.sequence);
    seenIds.add(normalizedId);
    seenFileNames.add(normalizedFileName);
  }

  return migrationEntries;
}

function compareMigrationHistory(migrations, appliedRows) {
  const migrationById = new Map(migrations.map((migration) => [migration.id.toLowerCase(), migration]));
  const appliedById = new Map();

  for (const row of appliedRows) {
    const id = String(row.MigrationId).toLowerCase();
    if (appliedById.has(id)) {
      throw new MigrationError('DUPLICATE_APPLIED_MIGRATION', `Applied migration id ${row.MigrationId} is duplicated.`);
    }
    appliedById.set(id, row);

    if (!migrationById.has(id)) {
      throw new MigrationError(
        'APPLIED_MIGRATION_MISSING',
        `Applied migration ${row.MigrationId} no longer exists in the migration directory.`,
      );
    }
  }

  const migrationsWithStatus = migrations.map((migration) => {
    const applied = appliedById.get(migration.id.toLowerCase());
    if (!applied) return { ...migration, status: 'PENDING', appliedAt: null, executionTimeMs: null };

    if (
      String(applied.FileName).toLowerCase() !== migration.fileName.toLowerCase()
      || String(applied.Checksum).toLowerCase() !== migration.checksum
    ) {
      throw new MigrationError(
        'APPLIED_MIGRATION_MODIFIED',
        `Applied migration ${migration.id} does not match its recorded filename/checksum.`,
      );
    }

    return {
      ...migration,
      status: 'APPLIED',
      appliedAt: applied.AppliedAt,
      executionTimeMs: Number(applied.ExecutionTimeMs),
    };
  });

  const appliedSequences = migrationsWithStatus
    .filter((migration) => migration.status === 'APPLIED')
    .map((migration) => migration.sequence);

  if (appliedSequences.length > 0) {
    const maxAppliedSequence = Math.max(...appliedSequences);
    const outOfOrderMigration = migrationsWithStatus.find(
      (migration) => migration.status === 'PENDING' && migration.sequence < maxAppliedSequence,
    );

    if (outOfOrderMigration) {
      throw new MigrationError(
        'OUT_OF_ORDER_MIGRATION',
        `Pending migration ${outOfOrderMigration.id} has a lower sequence than already applied migration ${String(maxAppliedSequence).padStart(3, '0')}.`,
      );
    }
  }

  return migrationsWithStatus;
}

async function inspectTarget(pool, expectedDatabaseName) {
  const result = await pool.request().query(`
    SELECT
      CONVERT(NVARCHAR(128), SERVERPROPERTY('ServerName')) AS ServerName,
      DB_NAME() AS DatabaseName;
  `);
  const target = result.recordset[0];
  assertSafeDatabaseName(target.DatabaseName);

  if (
    expectedDatabaseName
    && target.DatabaseName.toLowerCase() !== expectedDatabaseName.trim().toLowerCase()
  ) {
    throw new MigrationError(
      'TARGET_DATABASE_MISMATCH',
      `Connected database ${target.DatabaseName} does not match configured database ${expectedDatabaseName}.`,
    );
  }

  return target;
}

async function trackingTableExists(pool) {
  const result = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID(N'${TRACKING_TABLE}', N'U') IS NULL THEN 0 ELSE 1 END AS TableExists;
  `);
  return result.recordset[0].TableExists === 1;
}

async function ensureTrackingTable(pool) {
  await pool.request().batch(`
    SET XACT_ABORT ON;

    IF OBJECT_ID(N'${TRACKING_TABLE}', N'U') IS NULL
    BEGIN
      CREATE TABLE ${TRACKING_TABLE} (
        MigrationId VARCHAR(128) NOT NULL,
        FileName VARCHAR(260) NOT NULL,
        Checksum CHAR(64) NOT NULL,
        AppliedAt DATETIME2(3) NOT NULL
          CONSTRAINT DF_SCHEMA_MIGRATIONS_AppliedAt DEFAULT SYSUTCDATETIME(),
        ExecutionTimeMs BIGINT NOT NULL,
        CONSTRAINT PK_SCHEMA_MIGRATIONS PRIMARY KEY (MigrationId),
        CONSTRAINT UQ_SCHEMA_MIGRATIONS_FileName UNIQUE (FileName),
        CONSTRAINT CK_SCHEMA_MIGRATIONS_Checksum
          CHECK (Checksum NOT LIKE '%[^0-9a-f]%' AND LEN(Checksum) = 64),
        CONSTRAINT CK_SCHEMA_MIGRATIONS_ExecutionTimeMs CHECK (ExecutionTimeMs >= 0)
      );
    END;
  `);

  const validation = await pool.request().query(`
    SELECT COUNT(*) AS RequiredColumnCount
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'${TRACKING_TABLE}', N'U')
      AND name IN ('MigrationId', 'FileName', 'Checksum', 'AppliedAt', 'ExecutionTimeMs');
  `);

  if (validation.recordset[0].RequiredColumnCount !== 5) {
    throw new MigrationError(
      'INVALID_MIGRATION_TRACKING_TABLE',
      `${TRACKING_TABLE} exists but does not have the required migration metadata columns.`,
    );
  }
}

async function readAppliedMigrations(pool) {
  if (!(await trackingTableExists(pool))) return [];

  const result = await pool.request().query(`
    SELECT MigrationId, FileName, Checksum, AppliedAt, ExecutionTimeMs
    FROM ${TRACKING_TABLE}
    ORDER BY MigrationId;
  `);
  return result.recordset;
}

async function acquireMigrationLock(pool, sql, lockTimeoutMs) {
  const request = pool.request();
  request.input('LockResource', sql.NVarChar(255), LOCK_RESOURCE);
  request.input('LockTimeout', sql.Int, lockTimeoutMs);
  const result = await request.query(`
    DECLARE @LockResult INT;
    EXEC @LockResult = sys.sp_getapplock
      @Resource = @LockResource,
      @LockMode = 'Exclusive',
      @LockOwner = 'Session',
      @LockTimeout = @LockTimeout,
      @DbPrincipal = 'public';
    SELECT @LockResult AS LockResult;
  `);

  const lockResult = result.recordset[0].LockResult;
  if (lockResult < 0) {
    throw new MigrationError(
      'MIGRATION_LOCK_UNAVAILABLE',
      `Could not acquire the database migration lock within ${lockTimeoutMs} ms (SQL result ${lockResult}).`,
    );
  }
}

async function releaseMigrationLock(pool, sql) {
  const request = pool.request();
  request.input('LockResource', sql.NVarChar(255), LOCK_RESOURCE);
  await request.query(`
    DECLARE @ReleaseResult INT;
    EXEC @ReleaseResult = sys.sp_releaseapplock
      @Resource = @LockResource,
      @LockOwner = 'Session',
      @DbPrincipal = 'public';
    SELECT @ReleaseResult AS ReleaseResult;
  `);
}

async function executeMigration(pool, sql, migration) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  const startedAt = process.hrtime.bigint();

  try {
    await new sql.Request(transaction).batch(migration.sqlText);
    const executionTimeMs = Number((process.hrtime.bigint() - startedAt) / 1000000n);

    const metadataRequest = new sql.Request(transaction);
    metadataRequest.input('MigrationId', sql.VarChar(128), migration.id);
    metadataRequest.input('FileName', sql.VarChar(260), migration.fileName);
    metadataRequest.input('Checksum', sql.Char(64), migration.checksum);
    metadataRequest.input('ExecutionTimeMs', sql.BigInt, executionTimeMs);
    await metadataRequest.query(`
      INSERT INTO ${TRACKING_TABLE} (
        MigrationId, FileName, Checksum, AppliedAt, ExecutionTimeMs
      )
      VALUES (
        @MigrationId, @FileName, @Checksum, SYSUTCDATETIME(), @ExecutionTimeMs
      );
    `);

    await transaction.commit();
    return executionTimeMs;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // Preserve the migration error; a broken connection can also make rollback fail.
    }

    throw new MigrationError(
      'MIGRATION_FAILED',
      `Migration ${migration.fileName} failed and was rolled back.`,
      { cause: error },
    );
  }
}

async function getMigrationStatus({ pool, migrationsDirectory, expectedDatabaseName }) {
  const target = await inspectTarget(pool, expectedDatabaseName);
  const migrations = await discoverMigrations(migrationsDirectory);
  const appliedRows = await readAppliedMigrations(pool);
  const migrationsWithStatus = compareMigrationHistory(migrations, appliedRows);

  return {
    target,
    trackingTableExists: await trackingTableExists(pool),
    migrations: migrationsWithStatus,
  };
}

async function runMigrations({
  pool,
  sql,
  migrationsDirectory,
  expectedDatabaseName,
  allowMigrations,
  lockTimeoutMs = readLockTimeout(),
  onEvent = () => {},
}) {
  if (!allowMigrations) {
    throw new MigrationError(
      'MIGRATIONS_NOT_ALLOWED',
      'Database migration execution is disabled. Set ALLOW_DB_MIGRATIONS=true for the explicit migration command.',
    );
  }

  const target = await inspectTarget(pool, expectedDatabaseName);
  const migrations = await discoverMigrations(migrationsDirectory);
  let lockAcquired = false;

  try {
    await acquireMigrationLock(pool, sql, lockTimeoutMs);
    lockAcquired = true;
    onEvent({ type: 'lock-acquired', resource: LOCK_RESOURCE });

    await ensureTrackingTable(pool);
    const appliedRows = await readAppliedMigrations(pool);
    const migrationsWithStatus = compareMigrationHistory(migrations, appliedRows);
    const results = [];

    for (const migration of migrationsWithStatus) {
      if (migration.status === 'APPLIED') {
        onEvent({ type: 'skipped', migration });
        results.push({ ...migration, action: 'SKIPPED' });
        continue;
      }

      onEvent({ type: 'applying', migration });
      const executionTimeMs = await executeMigration(pool, sql, migration);
      const applied = { ...migration, status: 'APPLIED', action: 'APPLIED', executionTimeMs };
      onEvent({ type: 'applied', migration: applied });
      results.push(applied);
    }

    return { target, results };
  } finally {
    if (lockAcquired) {
      await releaseMigrationLock(pool, sql);
      onEvent({ type: 'lock-released', resource: LOCK_RESOURCE });
    }
  }
}

function createMigrationPool(settings, sql) {
  const config = {
    ...settings.config,
    options: { ...settings.config.options },
    pool: {
      ...settings.config.pool,
      min: 0,
      max: 1,
    },
  };

  const pool = new sql.ConnectionPool(config);
  pool.on('error', () => {
    // CLI/test callers receive query failures directly; never log connection details here.
  });
  return pool;
}

module.exports = {
  LOCK_RESOURCE,
  MIGRATION_FILENAME_PATTERN,
  MigrationError,
  TRACKING_TABLE,
  assertProductionMigrationConfiguration,
  assertProductionMigrationEnvironment,
  assertSafeDatabaseName,
  calculateChecksum,
  compareMigrationHistory,
  createMigrationPool,
  discoverMigrations,
  getMigrationStatus,
  readLockTimeout,
  runMigrations,
};
