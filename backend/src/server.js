'use strict';

const app = require('./app');
const env = require('./config/env');

const server = app.listen(env.port, () => {
  console.log(`API server is running on port ${env.port}`);
});

function shutdown(signal) {
  console.log(`${signal} received. Closing API server.`);
  server.close((error) => {
    if (error) {
      console.error('Failed to close API server cleanly.');
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
