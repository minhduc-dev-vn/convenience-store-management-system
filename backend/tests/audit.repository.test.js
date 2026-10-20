'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { AuditRepository } = require('../src/repositories/audit.repository');

function sqlType(name) {
  return (length) => (length === undefined ? name : `${name}(${length})`);
}

test('audit repository parameterizes write, list and detail queries', async () => {
  const calls = [];
  const executor = {
    request() {
      const parameters = {};
      return {
        input(name, type, value) { parameters[name] = { type, value }; return this; },
        async query(text) {
          calls.push({ parameters, text });
          if (text.includes('TraCuu')) return { recordset: [{ TongSoBanGhi: 2 }] };
          if (text.includes('WHERE MaNhatKy')) return { recordset: [{ MaNhatKy: 7 }] };
          return { recordset: [{ MaNhatKy: 7 }] };
        },
      };
    },
  };
  const sqlDriver = {
    BigInt: 'BigInt', Date: 'Date', Int: 'Int', MAX: 'MAX',
    NVarChar: sqlType('NVarChar'), VarChar: sqlType('VarChar'),
  };
  const repository = new AuditRepository({
    poolProvider: async () => executor,
    sqlDriver,
  });

  await repository.write({
    action: 'ACCOUNT_LOCKED', actorAccountId: 43, ipAddress: '127.0.0.1',
    newData: '{"status":"LOCKED"}', oldData: '{"status":"ACTIVE"}',
    recordId: '12', tableName: 'TAI_KHOAN',
  });
  const list = await repository.list({
    action: 'ACCOUNT_LOCKED', from: '2026-10-01', page: 1, pageSize: 20,
    recordId: '12', tableName: 'TAI_KHOAN', to: '2026-10-04', username: 'manager',
  });
  const detail = await repository.findById(7);

  assert.equal(calls.length, 3);
  assert.match(calls[0].text, /usp_NHAT_KY_HE_THONG_Ghi/);
  assert.equal(calls[0].parameters.NewData.value, '{"status":"LOCKED"}');
  assert.match(calls[1].text, /usp_NHAT_KY_HE_THONG_TraCuu/);
  assert.equal(calls[1].parameters.PageSize.value, 20);
  assert.equal(list.totalItems, 2);
  assert.match(calls[2].text, /@AuditLogId/);
  assert.equal(calls[2].parameters.AuditLogId.value, 7);
  assert.equal(detail.MaNhatKy, 7);
});
