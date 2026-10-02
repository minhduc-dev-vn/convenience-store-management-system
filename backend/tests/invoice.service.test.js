'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  InvoiceService,
  normalizeInvoiceQuery,
  serializeInvoiceDetail,
} = require('../src/services/invoice.service');

const cashierIdentity = { employeeId: 'C34CASH', role: 'CASHIER' };
const managerIdentity = { employeeId: 'C34MGR', role: 'MANAGER' };

function headerRow(overrides = {}) {
  return {
    MaHD: 'C34INV001',
    NgayLap: new Date('2026-10-02T08:00:00.000Z'),
    MaCa: 34,
    MaNV: 'C34CASH',
    TenNhanVien: 'C34 Cashier',
    MaKH: 'C34CUST',
    TenKhachHang: 'C34 Customer',
    SDTKhachHang: '0833400001',
    TongTienHang: 50000,
    TongGiamGia: 5000,
    TongThanhToan: 45000,
    DiemSuDung: 0,
    DiemTichLuy: 4,
    TrangThai: 'PAID',
    GhiChu: null,
    ...overrides,
  };
}

test('invoice query validates inclusive date filters and stable pagination', () => {
  assert.deepEqual(normalizeInvoiceQuery({
    cashierId: ' C34CASH ',
    from: '2026-10-01',
    invoiceId: ' C34INV001 ',
    page: '2',
    pageSize: '10',
    to: '2026-10-02',
  }), {
    cashierId: 'C34CASH',
    from: '2026-10-01',
    invoiceId: 'C34INV001',
    page: 2,
    pageSize: 10,
    to: '2026-10-02',
  });
  for (const query of [
    { page: '0' },
    { pageSize: '101' },
    { from: '2026-02-30' },
    { from: '2026-10-03', to: '2026-10-02' },
  ]) {
    assert.throws(
      () => normalizeInvoiceQuery(query),
      (error) => error.code === 'VALIDATION_ERROR',
    );
  }
});

test('CASHIER and MANAGER can search invoices while other roles are rejected', async () => {
  let received;
  const service = new InvoiceService({
    invoiceRepository: {
      async listInvoices(filters) {
        received = filters;
        return { items: [headerRow()], totalItems: 21 };
      },
    },
  });
  const result = await service.listInvoices(cashierIdentity, {
    invoiceId: 'C34INV001', page: '2', pageSize: '10',
  });
  assert.equal(received.invoiceId, 'C34INV001');
  assert.equal(result.items[0].cashier.employeeId, 'C34CASH');
  assert.equal(result.items[0].customer.phone, '0833400001');
  assert.deepEqual(result.pagination, {
    page: 2, pageSize: 10, totalItems: 21, totalPages: 3,
  });
  await service.listInvoices(managerIdentity, {});
  for (const identity of [
    { role: 'CUSTOMER', customerId: 'C34CUST' },
    { role: 'WAREHOUSE', employeeId: 'C34WARE' },
    { role: 'CASHIER' },
  ]) {
    await assert.rejects(
      service.listInvoices(identity, {}),
      (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
    );
  }
});

test('invoice detail exposes payment and returnable quantities by original lot', () => {
  const invoice = serializeInvoiceDetail({
    header: headerRow(),
    items: [{
      MaCTHD: 3401,
      MaSP: 'C34P001',
      TenSP: 'C34 Product',
      MaVach: 'C340001',
      DonViTinh: 'Cai',
      SoLuong: 3,
      DonGiaBan: 10000,
      TienGiam: 0,
      ThanhTien: 30000,
      MaKM: null,
      TenKM: null,
      SoLuongDaTra: 1,
      SoLuongConLaiCoTheTra: 2,
    }],
    payments: [{
      MaThanhToan: 34,
      PhuongThuc: 'CASH',
      SoTien: 45000,
      ThoiGian: new Date('2026-10-02T08:01:00.000Z'),
      MaGiaoDichNgoai: null,
      TrangThai: 'SUCCESS',
    }],
    lotAllocations: [{
      MaCTHD: 3401,
      MaLo: 'C34LOT001',
      SoLo: 'BATCH-34',
      SoLuongXuat: 3,
      SoLuongDaTra: 1,
      SoLuongConLaiCoTheTra: 2,
    }],
    returns: [{
      MaPT: 'C34RET001',
      NgayTra: new Date('2026-10-02T09:00:00.000Z'),
      MaNV: 'C34CASH',
      TenNhanVien: 'C34 Cashier',
      LyDo: 'Return fixture',
      TongTienHoan: 10000,
      TrangThai: 'COMPLETED',
    }],
  });
  assert.equal(invoice.items[0].quantityReturnable, 2);
  assert.deepEqual(invoice.items[0].lotAllocations[0], {
    lotId: 'C34LOT001',
    manufacturerLot: 'BATCH-34',
    quantityReturned: 1,
    quantityReturnable: 2,
    quantitySold: 3,
  });
  assert.equal(invoice.payments[0].status, 'SUCCESS');
  assert.equal(invoice.returns[0].returnId, 'C34RET001');
});

test('invoice detail returns a stable not-found error', async () => {
  const service = new InvoiceService({
    invoiceRepository: {
      async findInvoiceDetail() {
        return { header: null, items: [], payments: [], lotAllocations: [], returns: [] };
      },
    },
  });
  await assert.rejects(
    service.getInvoice(managerIdentity, 'C34MISSING'),
    (error) => error.code === 'INVOICE_NOT_FOUND' && error.statusCode === 404,
  );
});
