'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { withTransaction } = require('../src/utils/transaction');

function createTransaction(events) {
  return Object.assign(new EventEmitter(), {
    async begin(isolationLevel) {
      events.push(`begin:${isolationLevel}`);
    },
    async commit() {
      events.push('commit');
    },
    async rollback() {
      events.push('rollback');
      this.emit('rollback', false);
    },
  });
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

test('withTransaction preserves the work error when the database already rolled back', async () => {
  const events = [];
  const transaction = createTransaction(events);
  const sqlError = Object.assign(new Error('A reason is required'), { number: 51711 });

  await assert.rejects(
    withTransaction(
      async () => {
        events.push('work');
        transaction.emit('rollback', true);
        throw sqlError;
      },
      {
        isolationLevel: 'READ_COMMITTED_TEST',
        poolProvider: async () => ({}),
        transactionFactory: () => transaction,
        sqlDriver: {},
      },
    ),
    (error) => error === sqlError && error.number === 51711,
  );

  assert.deepEqual(events, ['begin:READ_COMMITTED_TEST', 'work']);
});

test('withTransaction preserves the original error when rollback reports an inactive transaction', async () => {
  const events = [];
  const transaction = createTransaction(events);
  const sqlError = Object.assign(new Error('Stocktake validation failed'), { number: 51711 });
  transaction.rollback = async () => {
    events.push('rollback');
    throw Object.assign(new Error('Transaction has been aborted'), { code: 'EABORT' });
  };

  await assert.rejects(
    withTransaction(
      async () => {
        events.push('work');
        throw sqlError;
      },
      {
        isolationLevel: 'READ_COMMITTED_TEST',
        poolProvider: async () => ({}),
        transactionFactory: () => transaction,
        sqlDriver: {},
      },
    ),
    (error) => error === sqlError && error.number === 51711,
  );

  assert.deepEqual(events, ['begin:READ_COMMITTED_TEST', 'work', 'rollback']);
});

test('withTransaction surfaces a genuine rollback failure without losing both causes', async () => {
  const events = [];
  const transaction = createTransaction(events);
  const workError = new Error('WORK_FAILED');
  const rollbackError = Object.assign(new Error('ROLLBACK_IO_FAILED'), { code: 'EROLLBACK' });
  transaction.rollback = async () => {
    events.push('rollback');
    throw rollbackError;
  };

  await assert.rejects(
    withTransaction(
      async () => {
        events.push('work');
        throw workError;
      },
      {
        isolationLevel: 'READ_COMMITTED_TEST',
        poolProvider: async () => ({}),
        transactionFactory: () => transaction,
        sqlDriver: {},
      },
    ),
    (error) => {
      assert.equal(error.code, 'TRANSACTION_ROLLBACK_FAILED');
      assert.equal(error.statusCode, 500);
      assert.ok(error.cause instanceof AggregateError);
      assert.deepEqual(error.cause.errors, [workError, rollbackError]);
      return true;
    },
  );

  assert.deepEqual(events, ['begin:READ_COMMITTED_TEST', 'work', 'rollback']);
});
