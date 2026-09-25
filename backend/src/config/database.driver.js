'use strict';

function getSqlDriver(driverName) {
  if (driverName === 'msnodesqlv8') {
    return require('mssql/msnodesqlv8');
  }

  return require('mssql');
}

module.exports = {
  getSqlDriver,
};
