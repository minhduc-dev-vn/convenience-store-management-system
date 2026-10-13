'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { PosRepository } = require('../src/repositories/pos.repository');

function sqlType(name) {
  return (length) => `${name}(${length})`;
}

test('shift reconciliation query derives gross, refunds and payment-method net from original invoices', async () => {
  let captured;
  const row = { DoanhThuGop: 12000, TongTienHoan: 4000, DoanhThuThuan: 8000 };
  const executor = {
    request() {
      const parameters = {};
      return {
        input(name, type, value) { parameters[name] = { type, value }; return this; },
        async query(text) {
          captured = { parameters, text };
          return { recordset: [row] };
        },
      };
    },
  };
  const repository = new PosRepository({
    poolProvider: async () => executor,
    sqlDriver: { BigInt: 'BigInt', VarChar: sqlType('VarChar') },
  });

  assert.equal(await repository.getShiftReconciliation(7, 'NV001'), row);
  assert.match(captured.text, /dbo\.PHIEU_TRA/);
  assert.match(captured.text, /return_header\.TrangThai = 'COMPLETED'/);
  assert.match(captured.text, /payment\.TrangThai IN \('SUCCESS', 'REFUNDED'\)/);
  assert.match(captured.text, /AS DoanhThuGop/);
  assert.match(captured.text, /AS TongTienHoan/);
  assert.match(captured.text, /AS DoanhThuThuan/);
  assert.match(captured.text, /AS DoanhThuTienMat/);
  assert.match(captured.text, /AS DoanhThuKhongTienMat/);
  assert.equal(captured.parameters.ShiftId.value, 7);
  assert.equal(captured.parameters.EmployeeId.value, 'NV001');
});
