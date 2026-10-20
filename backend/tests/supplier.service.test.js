'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SupplierService } = require('../src/services/supplier.service');

const transaction = { id: 'c20-transaction' };
const transactionRunner = async (work) => work(transaction);

function supplierRow(overrides = {}) {
  return {
    MaNCC: 'C20SUP01',
    TenNCC: 'C20 Supplier',
    SDT: '0832000001',
    Email: 'supplier@example.com',
    DiaChi: '20 Test Street',
    MaSoThue: 'C20-TAX-001',
    TrangThai: 'ACTIVE',
    ...overrides,
  };
}

test('supplier list normalizes filters and exposes stable pagination fields', async () => {
  let received;
  const service = new SupplierService({
    supplierRepository: {
      async listSuppliers(filters) {
        received = filters;
        return { items: [supplierRow()], totalItems: 6 };
      },
    },
  });

  const result = await service.listSuppliers({
    page: '2', pageSize: '5', search: 'C20', status: 'active',
  });

  assert.deepEqual(received, {
    page: 2, pageSize: 5, search: 'C20', status: 'ACTIVE',
  });
  assert.deepEqual(result.pagination, {
    page: 2, pageSize: 5, totalItems: 6, totalPages: 2,
  });
  assert.deepEqual(result.items[0], {
    address: '20 Test Street',
    email: 'supplier@example.com',
    name: 'C20 Supplier',
    phone: '0832000001',
    status: 'ACTIVE',
    supplierId: 'C20SUP01',
    taxCode: 'C20-TAX-001',
  });
});

test('supplier create validates uniqueness and writes in one transaction', async () => {
  const calls = [];
  const repository = {
    async findSupplierForUpdate(supplierId, receivedTransaction) {
      calls.push(['findForUpdate', supplierId, receivedTransaction]);
      return null;
    },
    async findPhoneConflict(phone, supplierId, receivedTransaction) {
      calls.push(['phone', phone, supplierId, receivedTransaction]);
      return null;
    },
    async findTaxCodeConflict(taxCode, supplierId, receivedTransaction) {
      calls.push(['taxCode', taxCode, supplierId, receivedTransaction]);
      return null;
    },
    async createSupplier(supplier, receivedTransaction) {
      calls.push(['create', supplier, receivedTransaction]);
    },
    async findSupplierById(supplierId, receivedTransaction) {
      calls.push(['find', supplierId, receivedTransaction]);
      return supplierRow();
    },
  };
  const service = new SupplierService({ supplierRepository: repository, transactionRunner });

  const result = await service.createSupplier({
    supplierId: ' C20SUP01 ',
    name: ' C20 Supplier ',
    phone: '0832000001',
    email: 'SUPPLIER@EXAMPLE.COM',
    address: ' 20 Test Street ',
    taxCode: ' C20-TAX-001 ',
  });

  assert.equal(result.supplierId, 'C20SUP01');
  assert.deepEqual(calls.map((call) => call[0]), [
    'findForUpdate', 'phone', 'taxCode', 'create', 'find',
  ]);
  assert.equal(calls[0][2], transaction);
  assert.equal(calls[3][1].email, 'supplier@example.com');
  assert.equal(calls[3][1].status, 'ACTIVE');
  assert.equal(calls[3][2], transaction);
});

test('supplier duplicate phone and tax code produce specific conflicts', async () => {
  const baseRepository = {
    async findSupplierForUpdate() { return null; },
    async createSupplier() {},
    async findSupplierById() { return supplierRow(); },
  };

  let service = new SupplierService({
    transactionRunner,
    supplierRepository: {
      ...baseRepository,
      async findPhoneConflict() { return { MaNCC: 'OTHER' }; },
      async findTaxCodeConflict() { return null; },
    },
  });
  await assert.rejects(
    service.createSupplier({ supplierId: 'C20SUP02', name: 'Duplicate', phone: '0832000001' }),
    (error) => error.code === 'SUPPLIER_PHONE_CONFLICT' && error.statusCode === 409,
  );

  service = new SupplierService({
    transactionRunner,
    supplierRepository: {
      ...baseRepository,
      async findPhoneConflict() { return null; },
      async findTaxCodeConflict() { return { MaNCC: 'OTHER' }; },
    },
  });
  await assert.rejects(
    service.createSupplier({
      supplierId: 'C20SUP02', name: 'Duplicate', phone: '0832000002',
      taxCode: 'C20-TAX-001',
    }),
    (error) => error.code === 'SUPPLIER_TAX_CODE_CONFLICT' && error.statusCode === 409,
  );
});

test('supplier update supports nullable contact fields without changing status', async () => {
  const calls = [];
  const repository = {
    async findSupplierForUpdate() { return supplierRow(); },
    async findPhoneConflict() { return null; },
    async findTaxCodeConflict() { return null; },
    async updateSupplier(supplierId, changes, receivedTransaction) {
      calls.push({ supplierId, changes, receivedTransaction });
    },
    async findSupplierById() {
      return supplierRow({ Email: null, DiaChi: null, MaSoThue: null });
    },
  };
  const service = new SupplierService({ supplierRepository: repository, transactionRunner });

  const result = await service.updateSupplier('C20SUP01', {
    email: '', address: null, taxCode: '',
  });

  assert.deepEqual(calls[0].changes, { email: null, address: null, taxCode: null });
  assert.equal(calls[0].receivedTransaction, transaction);
  assert.equal(result.email, null);
  assert.equal(result.taxCode, null);
  assert.equal(result.status, 'ACTIVE');
});

test('supplier status update rejects missing suppliers and only accepts schema statuses', async () => {
  const service = new SupplierService({
    transactionRunner,
    supplierRepository: {
      async findSupplierForUpdate() { return null; },
    },
  });

  await assert.rejects(
    service.updateSupplierStatus('C20SUP01', { status: 'ACTIVE' }),
    (error) => error.code === 'SUPPLIER_NOT_FOUND' && error.statusCode === 404,
  );
  await assert.rejects(
    service.updateSupplierStatus('C20SUP01', { status: 'DELETED' }),
    (error) => error.code === 'VALIDATION_ERROR' && error.statusCode === 400,
  );
});

test('supplier inputs reject invalid phone, email and pagination values', async () => {
  const service = new SupplierService({ supplierRepository: {} });
  const base = { supplierId: 'C20SUP01', name: 'C20 Supplier', phone: '0832000001' };

  await assert.rejects(
    service.createSupplier({ ...base, phone: 'not-a-phone' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  await assert.rejects(
    service.createSupplier({ ...base, email: 'not-an-email' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  await assert.rejects(
    service.listSuppliers({ page: '0' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  await assert.rejects(
    service.listSuppliers({ pageSize: '101' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});
