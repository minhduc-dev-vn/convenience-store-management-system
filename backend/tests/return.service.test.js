'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ReturnService,
  mapReturnError,
  normalizeReturnInput,
} = require('../src/services/return.service');

const cashierIdentity = {
  accountId: 37,
  employeeId: 'C37CASH',
  role: 'CASHIER',
};
const transaction = { name: 'c37-transaction' };
const transactionRunner = async (work) => work(transaction);

function storedResult(overrides = {}) {
  return {
    header: {
      MaPT: 'PTC37SERVICE01',
      MaHD: 'C37INV001',
      MaNV: 'C37CASH',
      NgayTra: new Date('2026-10-03T04:00:00Z'),
      LyDo: 'Bao bi loi',
      TongTienHoan: 11000,
      TrangThai: 'COMPLETED',
      TrangThaiHoaDon: 'PAID',
      DiemDaDieuChinh: 1,
      ...overrides,
    },
    items: [{
      MaCTHD: 3701n,
      MaSP: 'C37P001',
      TenSP: 'C37 Product',
      DonViTinh: 'Cai',
      MaLo: 'C37LOT001',
      SoLo: 'C37-BATCH-1',
      SoLuongTra: 1,
      TienHoan: 11000,
      TinhTrangHang: 'RESALABLE',
    }],
  };
}

test('normalization rejects client-controlled refund fields and duplicate allocations', () => {
  assert.throws(
    () => normalizeReturnInput({
      invoiceId: 'C37INV001',
      reason: 'Damaged package',
      refundAmount: 1,
      items: [],
    }),
    (error) => error.code === 'VALIDATION_ERROR' && /refundAmount/.test(error.message),
  );

  assert.throws(
    () => normalizeReturnInput({
      invoiceId: 'C37INV001',
      reason: 'Damaged package',
      items: [
        { lineId: '3701', lotId: 'C37LOT001', quantity: 1, condition: 'resalable' },
        { lineId: 3701, lotId: 'C37LOT001', quantity: 1, condition: 'DAMAGED' },
      ],
    }),
    (error) => error.code === 'VALIDATION_ERROR' && /only once/.test(error.message),
  );
});

test('normalization accepts BIGINT strings and canonicalizes the condition', () => {
  const input = normalizeReturnInput({
    invoiceId: ' C37INV001 ',
    reason: ' Damaged package ',
    items: [{
      lineId: '0003701',
      lotId: ' C37LOT001 ',
      quantity: 2,
      condition: 'resalable',
    }],
  });

  assert.deepEqual(input, {
    invoiceId: 'C37INV001',
    reason: 'Damaged package',
    items: [{
      lineId: '3701',
      lotId: 'C37LOT001',
      quantity: 2,
      condition: 'RESALABLE',
    }],
  });
});

test('createReturn delegates authoritative calculation to C36 and audits in one transaction', async () => {
  const calls = [];
  const auditService = {
    async record(audit, receivedTransaction) {
      calls.push(['audit', audit, receivedTransaction]);
    },
  };
  const repository = {
    async completeReturn(request, receivedTransaction) {
      calls.push(['complete', request, receivedTransaction]);
      return storedResult();
    },
  };
  const service = new ReturnService({
    auditService,
    returnIdGenerator: () => 'PTC37SERVICE01',
    returnRepository: repository,
    transactionRunner,
  });

  const result = await service.createReturn(cashierIdentity, {
    invoiceId: 'C37INV001',
    reason: 'Bao bi loi',
    items: [{
      lineId: '3701', lotId: 'C37LOT001', quantity: 1, condition: 'RESALABLE',
    }],
  }, '127.0.0.1');

  assert.deepEqual(calls.map((call) => call[0]), ['complete', 'audit']);
  assert.equal(calls[0][2], transaction);
  assert.equal(calls[1][2], transaction);
  assert.equal(calls[0][1].employeeId, 'C37CASH');
  assert.equal(calls[0][1].returnId, 'PTC37SERVICE01');
  assert.deepEqual(JSON.parse(calls[0][1].itemsJson), [{
    MaCTHD: '3701',
    MaLo: 'C37LOT001',
    SoLuongTra: 1,
    TinhTrangHang: 'RESALABLE',
  }]);
  assert.equal(calls[1][1].actorAccountId, 37);
  assert.doesNotMatch(JSON.stringify(calls[1][1].newData), /password|token|secret/i);
  assert.deepEqual(result.return, {
    employeeId: 'C37CASH',
    invoiceId: 'C37INV001',
    invoiceStatus: 'PAID',
    items: [{
      condition: 'RESALABLE',
      lineId: '3701',
      lot: { lotId: 'C37LOT001', manufacturerLot: 'C37-BATCH-1' },
      product: { name: 'C37 Product', productId: 'C37P001', unit: 'Cai' },
      quantity: 1,
      refundAmount: 11000,
    }],
    loyaltyPointsAdjusted: 1,
    reason: 'Bao bi loi',
    refundAmount: 11000,
    returnId: 'PTC37SERVICE01',
    returnedAt: '2026-10-03T04:00:00.000Z',
    status: 'COMPLETED',
  });
});

test('service rejects non-cashier identity without relying on route middleware', async () => {
  const service = new ReturnService({ returnRepository: {} });
  await assert.rejects(
    service.createReturn({ ...cashierIdentity, role: 'MANAGER' }, {}),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
});

test('C36 SQL errors map to stable return errors without exposing SQL details', () => {
  const overReturn = mapReturnError({ number: 51614, message: 'raw allocation detail' });
  assert.equal(overReturn.code, 'RETURN_QUANTITY_EXCEEDED');
  assert.equal(overReturn.statusCode, 409);
  assert.doesNotMatch(overReturn.message, /raw allocation detail/);

  const redeemedPoints = mapReturnError({ number: 51612, message: 'raw point policy detail' });
  assert.equal(redeemedPoints.code, 'LOYALTY_RETURN_POLICY_UNRESOLVED');
  assert.equal(redeemedPoints.statusCode, 409);
});
