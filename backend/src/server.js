'use strict';

const app = require('./app');
const env = require('./config/env');
const { closePool } = require('./config/database.pool');

const server = app.listen(env.port, () => {
  console.log(`API server is running on port ${env.port}`);
});

let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`${signal} received. Closing API server.`);
  server.close(async (error) => {
    if (error) {
      console.error('Failed to close API server cleanly.');
      process.exitCode = 1;
    }

    try {
      await closePool();
    } catch {
      console.error('Failed to close database pool cleanly.');
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
