'use strict';

const dotenv = require('dotenv');

dotenv.config({ quiet: true });

const DEFAULT_PORT = 3000;
const parsedPort = Number.parseInt(process.env.PORT, 10);

module.exports = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT,
});
