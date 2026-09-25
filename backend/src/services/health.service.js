'use strict';

function getHealth() {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

module.exports = {
  getHealth,
};
