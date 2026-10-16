'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { InvoiceRepository } = require('../src/repositories/invoice.repository');

function createHarness() {
  const calls = [];
  const executor = {
    request() {
      const parameters = {};
      return {
        input(name, type, value) {
          parameters[name] = { type, value };
          return this;
        },
        async query(text) {
          calls.push({ parameters, text });
          if (text.includes('OFFSET @Offset ROWS')) return { recordset: [] };
          return { recordsets: [[], [], [], [], []] };
        },
      };
    },
  };
  const sqlDriver = {
    Date: 'Date',
    Int: 'Int',
    VarChar: (length) => `VarChar(${length})`,
  };
  return {
    calls,
    repository: new InvoiceRepository({ poolProvider: async () => executor, sqlDriver }),
  };
}

test('invoice list uses a parameterized literal substring while detail stays exact', async () => {
  const { calls, repository } = createHarness();

  await repository.listInvoices({
    cashierId: null,
    from: null,
    invoiceId: '%_',
    page: 1,
    pageSize: 10,
    to: null,
  });

  assert.match(calls[0].text, /CHARINDEX\(@InvoiceId, invoice\.MaHD\) > 0/);
  assert.doesNotMatch(calls[0].text, /invoice\.MaHD\s+LIKE/);
  assert.equal(calls[0].parameters.InvoiceId.value, '%_');

  await repository.findInvoiceDetail('183');

  assert.match(calls[1].text, /WHERE invoice\.MaHD = @InvoiceId;/);
  assert.match(calls[1].text, /dbo\.ufn_HOA_DON_PhanBoCoTheTra\(@InvoiceId\)/);
  assert.doesNotMatch(calls[1].text, /CHARINDEX\(@InvoiceId, invoice\.MaHD\)/);
  assert.equal(calls[1].parameters.InvoiceId.value, '183');
});
