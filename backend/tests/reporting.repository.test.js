'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ReportingRepository } = require('../src/repositories/reporting.repository');

function sqlType(name) {
  return (length) => (length === undefined ? name : `${name}(${length})`);
}

test('report repository parameterizes and delegates every metric to C45 objects', async () => {
  const calls = [];
  const executor = {
    request() {
      const parameters = {};
      return {
        input(name, type, value) { parameters[name] = { type, value }; return this; },
        async query(text) {
          calls.push({ parameters, text });
          if (text.includes('DoanhThuTongQuan')) return { recordsets: [[{}], []] };
          if (text.includes('DoanhThuTheoNganhHang')) return { recordsets: [[], [], []] };
          if (text.includes('TON_KHO_HIEN_TAI')) return { recordsets: [[{ TongSoSanPham: 0 }], []] };
          if (text.includes('#SupplierReceiving')) return { recordsets: [[{}], [{ TongSoBanGhi: 0 }], []] };
          return { recordsets: [[{ TongSoBanGhi: 0 }], []] };
        },
      };
    },
  };
  const repository = new ReportingRepository({
    poolProvider: async () => executor,
    sqlDriver: { Date: 'Date', Int: 'Int', VarChar: sqlType('VarChar') },
  });
  const dates = { from: '2026-09-01', to: '2026-09-02' };
  const paged = { ...dates, offset: 20, pageSize: 10 };

  await repository.getRevenue(dates);
  await repository.getProducts({ ...dates, limit: 10 });
  await repository.getInventory({ offset: 20, pageSize: 10 });
  await repository.getReceiving(paged);
  await repository.getEmployees(paged);
  await repository.getShifts(paged);

  assert.equal(calls.length, 6);
  assert.match(calls[0].text, /usp_BAO_CAO_DoanhThuTongQuan/);
  assert.match(calls[0].text, /usp_BAO_CAO_XuHuongDoanhThu/);
  assert.match(calls[1].text, /usp_BAO_CAO_DoanhThuTheoNganhHang/);
  assert.equal((calls[1].text.match(/usp_BAO_CAO_XepHangSanPham/g) || []).length, 2);
  assert.match(calls[2].text, /vw_BAO_CAO_TON_KHO_HIEN_TAI/);
  assert.match(calls[3].text, /usp_BAO_CAO_NhapHangTongQuan/);
  assert.match(calls[3].text, /usp_BAO_CAO_NhapHangTheoNhaCungCap/);
  assert.match(calls[4].text, /usp_BAO_CAO_DoanhThuNhanVien/);
  assert.match(calls[5].text, /usp_BAO_CAO_CaLamViec/);
  assert.equal(calls[0].parameters.From.value, '2026-09-01');
  assert.equal(calls[1].parameters.Limit.value, 10);
  assert.equal(calls[2].parameters.Offset.value, 20);
  assert.equal(calls[5].parameters.PageSize.value, 10);
});
