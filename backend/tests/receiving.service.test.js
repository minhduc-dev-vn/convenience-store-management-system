'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ReceivingService,
  mapReceivingError,
  normalizeLine,
} = require('../src/services/receiving.service');

const warehouseIdentity = {
  accountId: 23,
  employeeId: 'C23WARE',
  role: 'WAREHOUSE',
};
const transaction = { id: 'c23-transaction' };
const transactionRunner = async (work) => work(transaction);

function receiptRow(overrides = {}) {
  return {
    MaPN: 'PNC23SERVICE001',
    NgayNhap: new Date('2026-09-28T08:00:00Z'),
    MaNV: 'C23WARE',
    TenNhanVien: 'C23 Warehouse',
    MaNCC: 'C23SUP01',
    TenNCC: 'C23 Supplier',
    TongTien: 12000,
    TrangThai: 'DRAFT',
    NgayXacNhan: null,
    GhiChu: 'C23 draft',
    SoDong: 1,
    ...overrides,
  };
}

function lineRow(overrides = {}) {
  return {
    MaCTPN: '23',
    MaPN: 'PNC23SERVICE001',
    MaLo: 'LOC23SERVICE000001',
    MaSP: 'C23PROD1',
    TenSP: 'C23 Product',
    SoLo: 'C23-LOT-001',
    NgaySanXuat: new Date('2026-09-01T00:00:00Z'),
    HanSuDung: new Date('2027-09-01T00:00:00Z'),
    SoLuong: 2,
    DonGiaNhap: 6000,
    ThanhTien: 12000,
    ...overrides,
  };
}

test('receiving list defaults to DRAFT and exposes stable pagination', async () => {
  let receivedFilters;
  const service = new ReceivingService({
    receivingRepository: {
      async listReceipts(filters) {
        receivedFilters = filters;
        return { items: [receiptRow()], totalItems: 3 };
      },
    },
  });

  const result = await service.listReceipts(warehouseIdentity, {
    page: '2', pageSize: '2', search: 'C23',
  });

  assert.deepEqual(receivedFilters, {
    page: 2,
    pageSize: 2,
    search: 'C23',
    searchPattern: 'C23%',
    status: 'DRAFT',
  });
  assert.deepEqual(result.pagination, {
    page: 2, pageSize: 2, totalItems: 3, totalPages: 2,
  });
  assert.equal(result.items[0].receiptId, 'PNC23SERVICE001');
  assert.equal(result.items[0].supplier.supplierId, 'C23SUP01');
});

test('draft creation binds the authenticated employee and server-generated receipt id', async () => {
  const calls = [];
  const repository = {
    async findReceiptForUpdate(receiptId, receivedTransaction) {
      calls.push(['allocate', receiptId, receivedTransaction]);
      return null;
    },
    async saveDraft(draft, receivedTransaction) {
      calls.push(['save', draft, receivedTransaction]);
    },
    async findReceiptById(receiptId, receivedTransaction) {
      calls.push(['find', receiptId, receivedTransaction]);
      return receiptRow({ MaPN: receiptId, TongTien: 0, SoDong: 0 });
    },
    async listReceiptLines() { return []; },
  };
  const service = new ReceivingService({
    receiptIdGenerator: () => 'PNC23SERVICE001',
    receivingRepository: repository,
    transactionRunner,
  });

  const result = await service.createDraft(warehouseIdentity, {
    supplierId: ' C23SUP01 ',
    receivedAt: '2026-09-28T08:00:00Z',
    note: ' C23 draft ',
  });

  assert.equal(result.receiptId, 'PNC23SERVICE001');
  assert.equal(calls[1][1].employeeId, 'C23WARE');
  assert.equal(calls[1][1].supplierId, 'C23SUP01');
  assert.equal(calls[1][1].note, 'C23 draft');
  assert.equal(calls[1][2], transaction);
});

test('receipt lines validate quantity, cost and expiry relation before data access', () => {
  assert.throws(
    () => normalizeLine({
      productId: 'C23PROD1', manufacturerLot: 'LOT', quantity: 0, unitCost: 1,
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.throws(
    () => normalizeLine({
      productId: 'C23PROD1', manufacturerLot: 'LOT', quantity: 1, unitCost: -1,
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.throws(
    () => normalizeLine({
      productId: 'C23PROD1', manufacturerLot: 'LOT', quantity: 1, unitCost: 1,
      manufactureDate: '2027-01-02', expiryDate: '2027-01-01',
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('line creation reuses a matching lot and returns refreshed receipt detail', async () => {
  const calls = [];
  const repository = {
    async findReceiptForUpdate() { return receiptRow(); },
    async findProductForReceiving() { return { MaSP: 'C23PROD1' }; },
    async findLotByProductAndNumber() { return { MaLo: 'LOC23EXISTING00001' }; },
    async findLineByLot() { return null; },
    async saveLine(receiptId, lotId, line, receivedTransaction) {
      calls.push({ receiptId, lotId, line, receivedTransaction });
    },
    async findReceiptById() { return receiptRow(); },
    async listReceiptLines() { return [lineRow({ MaLo: 'LOC23EXISTING00001' })]; },
  };
  const service = new ReceivingService({ receivingRepository: repository, transactionRunner });

  const result = await service.addLine(warehouseIdentity, 'PNC23SERVICE001', {
    productId: 'C23PROD1',
    manufacturerLot: 'C23-LOT-001',
    manufactureDate: '2026-09-01',
    expiryDate: '2027-09-01',
    quantity: 2,
    unitCost: 6000,
  });

  assert.equal(calls[0].lotId, 'LOC23EXISTING00001');
  assert.equal(calls[0].receivedTransaction, transaction);
  assert.equal(result.lines[0].detailId, '23');
  assert.equal(result.lines[0].unitCost, 6000);
});

test('line creation returns PRODUCT_NOT_FOUND before creating a lot shell', async () => {
  let dataWasMutated = false;
  const repository = {
    async findReceiptForUpdate() { return receiptRow(); },
    async findProductForReceiving() { return null; },
    async findLotByProductAndNumber() { dataWasMutated = true; },
    async saveLine() { dataWasMutated = true; },
  };
  const service = new ReceivingService({ receivingRepository: repository, transactionRunner });

  await assert.rejects(
    service.addLine(warehouseIdentity, 'PNC23SERVICE001', {
      productId: 'UNKNOWN',
      manufacturerLot: 'C23-LOT-404',
      quantity: 1,
      unitCost: 1,
    }),
    (error) => error.code === 'PRODUCT_NOT_FOUND' && error.statusCode === 404,
  );
  assert.equal(dataWasMutated, false);
});

test('confirm delegates inventory to C22 procedure and writes audit in the same transaction', async () => {
  const calls = [];
  const repository = {
    async confirmReceipt(receiptId, receivedTransaction) {
      calls.push(['confirm', receiptId, receivedTransaction]);
      return {
        MaPN: receiptId,
        TrangThai: 'CONFIRMED',
        NgayXacNhan: new Date('2026-09-28T09:00:00Z'),
        TongTien: 12000,
        SoGiaoDichNhap: 1,
      };
    },
    async writeConfirmAudit(audit, receivedTransaction) {
      calls.push(['audit', audit, receivedTransaction]);
    },
    async findReceiptById() {
      return receiptRow({
        TrangThai: 'CONFIRMED',
        NgayXacNhan: new Date('2026-09-28T09:00:00Z'),
      });
    },
    async listReceiptLines() { return [lineRow()]; },
  };
  const service = new ReceivingService({ receivingRepository: repository, transactionRunner });

  const result = await service.confirmReceipt(
    warehouseIdentity,
    'PNC23SERVICE001',
    '127.0.0.1',
  );

  assert.deepEqual(calls.map((call) => call[0]), ['confirm', 'audit']);
  assert.equal(calls[0][2], transaction);
  assert.equal(calls[1][2], transaction);
  assert.equal(calls[1][1].actorAccountId, 23);
  assert.match(calls[1][1].newData, /"stockTransactionCount":1/);
  assert.equal(result.status, 'CONFIRMED');
});

test('C22 SQL errors map to stable API errors without exposing SQL text', () => {
  const duplicate = mapReceivingError({ number: 51332, message: 'raw SQL detail' });
  assert.equal(duplicate.code, 'RECEIPT_ALREADY_CONFIRMED');
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.message.includes('raw SQL detail'), false);

  const conflict = mapReceivingError({ number: 2627, message: 'constraint name' });
  assert.equal(conflict.code, 'RECEIVING_CONFLICT');
  assert.equal(conflict.statusCode, 409);
});

test('service rejects a non-WAREHOUSE identity even without route middleware', async () => {
  const service = new ReceivingService({ receivingRepository: {} });
  await assert.rejects(
    service.listReceipts({ role: 'MANAGER', employeeId: 'C23MGR' }),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
});
