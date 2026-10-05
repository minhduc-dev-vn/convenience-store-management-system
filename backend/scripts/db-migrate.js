#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { nodeEnv } = require('../src/config/env');
const { getDatabaseSettings } = require('../src/config/database.config');
const { getSqlDriver } = require('../src/config/database.driver');
const {
  MigrationError,
  assertSafeDatabaseName,
  createMigrationPool,
  getMigrationStatus,
  readLockTimeout,
  runMigrations,
} = require('../src/utils/migration-runner');

const MIGRATIONS_DIRECTORY = path.resolve(__dirname, '../../database/migrations');

function assertProductionConfiguration(settings) {
  if (nodeEnv !== 'production') return;

  if (settings.driver !== 'tedious') {
    throw new MigrationError(
      'PRODUCTION_DRIVER_REJECTED',
      'Production migrations require DB_DRIVER=tedious with SQL authentication over TCP.',
    );
  }

  if (settings.config.options.trustedConnection) {
    throw new MigrationError(
      'PRODUCTION_AUTHENTICATION_REJECTED',
      'Production migrations do not allow a Windows trusted connection.',
    );
  }
}

function printTarget(target, settings) {
  console.log(`[migration] environment=${nodeEnv}`);
  console.log(`[migration] driver=${settings.driver}`);
  console.log(`[migration] server=${target.ServerName}`);
  console.log(`[migration] database=${target.DatabaseName}`);
}

function printStatus(status) {
  console.log(`[migration] tracking-table=${status.trackingTableExists ? 'PRESENT' : 'ABSENT'}`);
  if (status.migrations.length === 0) {
    console.log('[migration] no migration files found');
    return;
  }

  console.table(status.migrations.map((migration) => ({
    Migration: migration.id,
    Status: migration.status,
    AppliedAt: migration.appliedAt ? new Date(migration.appliedAt).toISOString() : '-',
    ExecutionTimeMs: migration.executionTimeMs ?? '-',
  })));
}

async function main() {
  const command = (process.argv[2] || 'up').toLowerCase();
  if (!['up', 'status'].includes(command)) {
    throw new MigrationError('INVALID_MIGRATION_COMMAND', 'Use "up" or "status".');
  }

  const settings = getDatabaseSettings();
  assertSafeDatabaseName(settings.config.database);
  assertProductionConfiguration(settings);

  const sql = getSqlDriver(settings.driver);
  const pool = createMigrationPool(settings, sql);

  try {
    await pool.connect();

    if (command === 'status') {
      const status = await getMigrationStatus({
        pool,
        migrationsDirectory: MIGRATIONS_DIRECTORY,
        expectedDatabaseName: settings.config.database,
      });
      printTarget(status.target, settings);
      printStatus(status);
      return;
    }

    const result = await runMigrations({
      pool,
      sql,
      migrationsDirectory: MIGRATIONS_DIRECTORY,
      expectedDatabaseName: settings.config.database,
      allowMigrations: process.env.ALLOW_DB_MIGRATIONS?.trim().toLowerCase() === 'true',
      lockTimeoutMs: readLockTimeout(),
      onEvent(event) {
        if (event.type === 'applying') {
          console.log(`[migration] APPLY ${event.migration.fileName}`);
        } else if (event.type === 'applied') {
          console.log(`[migration] APPLIED ${event.migration.fileName} (${event.migration.executionTimeMs} ms)`);
        } else if (event.type === 'skipped') {
          console.log(`[migration] SKIP ${event.migration.fileName}`);
        }
      },
    });

    printTarget(result.target, settings);
    const appliedCount = result.results.filter((migration) => migration.action === 'APPLIED').length;
    const skippedCount = result.results.filter((migration) => migration.action === 'SKIPPED').length;
    console.log(`[migration] complete applied=${appliedCount} skipped=${skippedCount}`);
  } finally {
    await pool.close().catch(() => {});
  }
}

main().catch((error) => {
  const code = error.code || 'MIGRATION_COMMAND_FAILED';
  const message = error instanceof MigrationError
    ? error.message
    : 'The migration command failed. Review the database configuration and server logs.';
  console.error(`[migration] ERROR ${code}: ${message}`);
  process.exitCode = 1;
});
