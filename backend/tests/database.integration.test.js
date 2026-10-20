'use strict';

const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const { getDatabaseSettings } = require('../src/config/database.config');
const { getSqlDriver } = require('../src/config/database.driver');
const { closePool, getPool } = require('../src/config/database.pool');
const { BaseRepository } = require('../src/repositories/base.repository');
const { DatabaseRepository } = require('../src/repositories/database.repository');
const { withTransaction } = require('../src/utils/transaction');

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === 'true' ? test : test.skip;

after(async () => {
  await closePool();
});

integrationTest('database health succeeds and transaction helper rolls back real SQL work', async () => {
  const settings = getDatabaseSettings();
  const sql = getSqlDriver(settings.driver);
  const databaseRepository = new DatabaseRepository();
  const repository = new BaseRepository();
  const categoryId = 'C05ROLLBK';

  assert.equal(await getPool(), await getPool());
  assert.equal(await databaseRepository.checkConnection(), true);

  await assert.rejects(
    withTransaction(async (transaction) => {
      await repository.query({
        text: `
          INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, MoTa, TrangThai)
          VALUES (@MaLoai, @TenLoai, @MoTa, @TrangThai)
        `,
        parameters: {
          MaLoai: { type: sql.VarChar(10), value: categoryId },
          TenLoai: { type: sql.NVarChar(100), value: 'C05 rollback smoke' },
          MoTa: { type: sql.NVarChar(255), value: 'Temporary integration-test row' },
          TrangThai: { type: sql.VarChar(20), value: 'ACTIVE' },
        },
        transaction,
      });

      throw new Error('ROLLBACK_SMOKE');
    }),
    /ROLLBACK_SMOKE/,
  );

  const result = await repository.query({
    text: 'SELECT COUNT(*) AS [RowCount] FROM dbo.LOAI_SAN_PHAM WHERE MaLoai = @MaLoai',
    parameters: {
      MaLoai: { type: sql.VarChar(10), value: categoryId },
    },
  });

  assert.equal(result.recordset[0].RowCount, 0);
});
