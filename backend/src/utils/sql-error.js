'use strict';

function getSqlErrorNumber(error) {
  return error?.number
    ?? error?.originalError?.info?.number
    ?? error?.precedingErrors?.[0]?.number
    ?? null;
}

function isUniqueConstraintError(error) {
  return [2601, 2627].includes(getSqlErrorNumber(error));
}

module.exports = {
  getSqlErrorNumber,
  isUniqueConstraintError,
};
