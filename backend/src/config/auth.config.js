'use strict';

require('./env');

function readBcryptRounds() {
  const rawValue = process.env.BCRYPT_ROUNDS?.trim();
  if (!rawValue) return 12;

  const rounds = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(rounds) || rounds < 4 || rounds > 15) {
    throw new Error('BCRYPT_ROUNDS must be an integer between 4 and 15');
  }

  return rounds;
}

function getAuthSettings() {
  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes');
  }

  return {
    bcryptRounds: readBcryptRounds(),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN?.trim() || '1h',
    jwtSecret,
  };
}

module.exports = {
  getAuthSettings,
};
