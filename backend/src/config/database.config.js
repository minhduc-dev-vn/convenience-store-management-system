'use strict';

require('./env');

const SUPPORTED_DRIVERS = new Set(['tedious', 'msnodesqlv8']);

function readRequired(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required database environment variable: ${name}`);
  }

  return value;
}

function readBoolean(name, fallback) {
  const rawValue = process.env[name]?.trim().toLowerCase();

  if (!rawValue) return fallback;
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;

  throw new Error(`${name} must be either true or false`);
}

function readInteger(name, fallback, { minimum = 0 } = {}) {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return fallback;

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }

  return value;
}

function getDatabaseSettings() {
  const driver = (process.env.DB_DRIVER || 'tedious').trim().toLowerCase();
  if (!SUPPORTED_DRIVERS.has(driver)) {
    throw new Error(`Unsupported DB_DRIVER: ${driver}`);
  }

  const host = readRequired('DB_SERVER');
  const database = readRequired('DB_NAME');
  const instanceName = process.env.DB_INSTANCE?.trim();
  const port = readInteger('DB_PORT', undefined, { minimum: 1 });
  const trustedConnection = readBoolean('DB_TRUSTED_CONNECTION', false);

  if (port && instanceName) {
    throw new Error('DB_PORT and DB_INSTANCE cannot be configured at the same time');
  }

  if (trustedConnection && driver !== 'msnodesqlv8') {
    throw new Error('DB_TRUSTED_CONNECTION requires DB_DRIVER=msnodesqlv8');
  }

  const options = {
    encrypt: readBoolean('DB_ENCRYPT', true),
    trustServerCertificate: readBoolean('DB_TRUST_SERVER_CERTIFICATE', false),
    enableArithAbort: true,
  };

  let server = host;
  if (driver === 'msnodesqlv8') {
    options.trustedConnection = trustedConnection;
    if (instanceName) server = `${host}\\${instanceName}`;
  } else if (instanceName) {
    options.instanceName = instanceName;
  }

  const config = {
    server,
    database,
    options,
    pool: {
      max: readInteger('DB_POOL_MAX', 10, { minimum: 1 }),
      min: readInteger('DB_POOL_MIN', 0, { minimum: 0 }),
      idleTimeoutMillis: readInteger('DB_POOL_IDLE_TIMEOUT_MS', 30000, { minimum: 1 }),
    },
  };

  const odbcDriver = process.env.DB_ODBC_DRIVER?.trim();
  if (driver === 'msnodesqlv8' && odbcDriver) config.driver = odbcDriver;

  if (port) config.port = port;

  if (!trustedConnection) {
    config.user = readRequired('DB_USER');
    config.password = readRequired('DB_PASSWORD');
  }

  return {
    driver,
    config,
  };
}

module.exports = {
  getDatabaseSettings,
};
