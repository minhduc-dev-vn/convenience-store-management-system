'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { BaseRepository } = require('../src/repositories/base.repository');

function createExecutor() {
  const inputs = [];
  const queries = [];

  const request = {
    input(name, type, value) {
      inputs.push({ name, type, value });
      return this;
    },
    async query(text) {
      queries.push(text);
      return { recordset: [{ ok: true }] };
    },
  };

  return {
    inputs,
    queries,
    request: () => request,
  };
}

test('BaseRepository binds typed parameters before executing a query', async () => {
  const executor = createExecutor();
  const repository = new BaseRepository({ poolProvider: async () => executor });
  const fakeType = { name: 'VarChar(20)' };

  const result = await repository.query({
    text: 'SELECT @Username AS Username',
    parameters: {
      Username: { type: fakeType, value: 'cashier' },
    },
  });

  assert.deepEqual(executor.inputs, [
    { name: 'Username', type: fakeType, value: 'cashier' },
  ]);
  assert.deepEqual(executor.queries, ['SELECT @Username AS Username']);
  assert.deepEqual(result.recordset, [{ ok: true }]);
});

test('BaseRepository uses the supplied transaction instead of the pool', async () => {
  const transaction = createExecutor();
  let poolRequested = false;
  const repository = new BaseRepository({
    poolProvider: async () => {
      poolRequested = true;
      return createExecutor();
    },
  });

  await repository.query({
    text: 'SELECT 1',
    transaction,
  });

  assert.equal(poolRequested, false);
  assert.deepEqual(transaction.queries, ['SELECT 1']);
});

test('BaseRepository rejects untyped parameters', async () => {
  const repository = new BaseRepository({ poolProvider: async () => createExecutor() });

  await assert.rejects(
    repository.query({
      text: 'SELECT @Value',
      parameters: { Value: { value: 1 } },
    }),
    /must define both type and value/,
  );
});
