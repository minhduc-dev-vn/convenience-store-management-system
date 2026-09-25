'use strict';

const { getPool } = require('../config/database.pool');

const PARAMETER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

class BaseRepository {
  constructor({ poolProvider = getPool } = {}) {
    this.poolProvider = poolProvider;
  }

  async getExecutor(transaction) {
    return transaction || this.poolProvider();
  }

  bindParameters(request, parameters) {
    for (const [name, descriptor] of Object.entries(parameters)) {
      if (!PARAMETER_NAME_PATTERN.test(name)) {
        throw new TypeError(`Invalid SQL parameter name: ${name}`);
      }

      if (!descriptor || !Object.hasOwn(descriptor, 'type') || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError(`SQL parameter ${name} must define both type and value`);
      }

      request.input(name, descriptor.type, descriptor.value);
    }

    return request;
  }

  async query({ text, parameters = {}, transaction = null }) {
    if (typeof text !== 'string' || !text.trim()) {
      throw new TypeError('SQL query text must be a non-empty string');
    }

    const executor = await this.getExecutor(transaction);
    const request = this.bindParameters(executor.request(), parameters);
    return request.query(text);
  }
}

module.exports = {
  BaseRepository,
};
