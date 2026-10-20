'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { PosRepository } = require('../src/repositories/pos.repository');

function sqlType(name) {
  return (length) => `${name}(${length})`;
}

test('shift reconciliation query derives gross, refunds and payment-method net from original invoices', async () => {
  let captured;
  const currentUtc = new Date('2026-10-13T17:00:01.000Z');
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
    currentTimeProvider: () => currentUtc,
    poolProvider: async () => executor,
    sqlDriver: {
      BigInt: 'BigInt',
      DateTime2: sqlType('DateTime2'),
      VarChar: sqlType('VarChar'),
    },
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
  assert.match(captured.text, /GioBatDau AT TIME ZONE 'UTC'/);
  assert.match(captured.text, /AT TIME ZONE 'SE Asia Standard Time'/);
  assert.match(captured.text, /AS BusinessDate/);
  assert.match(captured.text, /AS IsCarryOver/);
  assert.equal(captured.parameters.ShiftId.value, 7);
  assert.equal(captured.parameters.EmployeeId.value, 'NV001');
  assert.equal(captured.parameters.CurrentUtc.value, currentUtc);
});

test('current shift query derives carry-over from Vietnam business dates', async () => {
  let captured;
  const currentUtc = new Date('2026-10-13T17:00:01.000Z');
  const executor = {
    request() {
      const parameters = {};
      return {
        input(name, type, value) { parameters[name] = { type, value }; return this; },
        async query(text) {
          captured = { parameters, text };
          return { recordset: [{ BusinessDate: '2026-10-13', IsCarryOver: true }] };
        },
      };
    },
  };
  const repository = new PosRepository({
    currentTimeProvider: () => currentUtc,
    poolProvider: async () => executor,
    sqlDriver: { DateTime2: sqlType('DateTime2'), VarChar: sqlType('VarChar') },
  });

  const result = await repository.findCurrentOpenShift('NV001');
  assert.equal(result.IsCarryOver, true);
  assert.match(captured.text, /ShiftBusinessDate < business_calendar\.CurrentBusinessDate/);
  assert.match(captured.text, /work_shift\.TrangThai = 'OPEN'/);
  assert.equal(captured.parameters.CurrentUtc.value, currentUtc);
  assert.equal(captured.parameters.EmployeeId.value, 'NV001');
});

test('sellable search uses ranked literal substrings while barcode lookup stays exact', async () => {
  const calls = [];
  const executor = {
    request() {
      const parameters = {};
      return {
        input(name, type, value) { parameters[name] = { type, value }; return this; },
        async query(text) {
          calls.push({ parameters, text });
          return { recordset: [] };
        },
      };
    },
  };
  const repository = new PosRepository({
    poolProvider: async () => executor,
    sqlDriver: {
      Int: 'Int',
      NVarChar: sqlType('NVarChar'),
      VarChar: sqlType('VarChar'),
    },
  });

  await repository.searchSellableProducts({
    page: 1,
    pageSize: 8,
    search: '%_[',
  });

  assert.match(calls[0].text, /CHARINDEX\(@Search, sellable\.MaSP\) > 0/);
  assert.match(calls[0].text, /CHARINDEX\(@Search, sellable\.TenSP\) > 0/);
  assert.match(calls[0].text, /CHARINDEX\(@Search, sellable\.MaVach\) > 0/);
  assert.match(calls[0].text, /WHEN sellable\.MaSP = @Search THEN 0/);
  assert.match(calls[0].text, /WHEN sellable\.MaVach = @Search THEN 1/);
  assert.match(calls[0].text, /WHEN CHARINDEX\(@Search, sellable\.MaSP\) = 1 THEN 2/);
  assert.match(calls[0].text, /WHEN CHARINDEX\(@Search, sellable\.TenSP\) = 1 THEN 3/);
  assert.doesNotMatch(calls[0].text, /LIKE @SearchPattern/);
  assert.equal(calls[0].parameters.Search.value, '%_[');
  assert.equal(Object.hasOwn(calls[0].parameters, 'SearchPattern'), false);

  await repository.findSellableProductByBarcode('8930000000003');

  assert.match(calls[1].text, /WHERE MaVach = @Barcode/);
  assert.doesNotMatch(calls[1].text, /CHARINDEX\(@Barcode/);
  assert.equal(calls[1].parameters.Barcode.value, '8930000000003');
});
