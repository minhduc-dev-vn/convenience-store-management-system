'use strict';

const jwt = require('jsonwebtoken');
const { getAuthSettings } = require('../config/auth.config');
const { AppError } = require('../utils/app-error');

class TokenService {
  constructor({ jwtLibrary = jwt, settingsProvider = getAuthSettings } = {}) {
    this.jwtLibrary = jwtLibrary;
    this.settingsProvider = settingsProvider;
  }

  sign({ accountId, role }) {
    const settings = this.settingsProvider();
    return this.jwtLibrary.sign(
      { role },
      settings.jwtSecret,
      {
        algorithm: 'HS256',
        expiresIn: settings.jwtExpiresIn,
        subject: String(accountId),
      },
    );
  }

  verify(token) {
    const settings = this.settingsProvider();

    try {
      return this.jwtLibrary.verify(token, settings.jwtSecret, {
        algorithms: ['HS256'],
      });
    } catch (error) {
      throw new AppError('The access token is invalid or expired', {
        code: 'INVALID_TOKEN',
        statusCode: 401,
        cause: error,
      });
    }
  }
}

module.exports = {
  TokenService,
};
