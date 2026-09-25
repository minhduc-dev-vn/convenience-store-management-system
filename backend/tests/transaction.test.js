'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { withTransaction } = require('../src/utils/transaction');

function createTransaction(events) {
  return {
    async begin(isolationLevel) {
      events.push(`begin:${isolationLevel}`);
    },
    async commit() {
      events.push('commit');
    },
    async rollback() {
      events.push('rollback');
    },
  };
}

test('withTransaction commits successful work and returns its result', async () => {
  const events = [];
  const fakePool = { id: 'pool' };
  const transaction = createTransaction(events);

  const result = await withTransaction(
    async (receivedTransaction) => {
      assert.equal(receivedTransaction, transaction);
      events.push('work');
      return 'done';
    },
    {
      isolationLevel: 'READ_COMMITTED_TEST',
      poolProvider: async () => fakePool,
      transactionFactory: (receivedPool) => {
        assert.equal(receivedPool, fakePool);
        return transaction;
      },
      sqlDriver: {},
    },
  );

  assert.equal(result, 'done');
  assert.deepEqual(events, ['begin:READ_COMMITTED_TEST', 'work', 'commit']);
});

test('withTransaction rolls back when work fails', async () => {
  const events = [];
  const transaction = createTransaction(events);
  const expectedError = new Error('ROLLBACK_SMOKE');

  await assert.rejects(
    withTransaction(
      async () => {
        events.push('work');
        throw expectedError;
      },
      {
        isolationLevel: 'READ_COMMITTED_TEST',
        poolProvider: async () => ({ id: 'pool' }),
        transactionFactory: () => transaction,
        sqlDriver: {},
      },
    ),
    (error) => error === expectedError,
  );

  assert.deepEqual(events, ['begin:READ_COMMITTED_TEST', 'work', 'rollback']);
});
