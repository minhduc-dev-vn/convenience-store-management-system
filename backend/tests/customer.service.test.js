'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { CustomerService } = require('../src/services/customer.service');

function customerRow(overrides = {}) {
  return {
    MaKH: 'KHC08OWN',
    HoTen: 'Owner Name',
    SDT: '0900000001',
    Email: 'owner@example.com',
    DiaChi: null,
    NgaySinh: null,
    DiemTichLuy: 25,
    HangThanhVien: 'BRONZE',
    NgayDangKy: new Date('2026-01-01T00:00:00Z'),
    TrangThai: 'ACTIVE',
    ...overrides,
  };
}

test('customer profile always uses the authenticated customer id', async () => {
  const requestedIds = [];
  const service = new CustomerService({
    customerRepository: {
      async findById(customerId) {
        requestedIds.push(customerId);
        return customerRow({ MaKH: customerId });
      },
    },
  });

  const profile = await service.getOwnProfile({ customerId: 'KHC08OWN' });
  assert.deepEqual(requestedIds, ['KHC08OWN']);
  assert.equal(profile.customerId, 'KHC08OWN');
  assert.equal(profile.loyaltyPoints, 25);
});

test('profile update changes only allowed fields and preserves protected values', async () => {
  let updateCall;
  const service = new CustomerService({
    customerRepository: {
      async emailExistsForAnotherOwner() {
        return false;
      },
      async updateProfile(customerId, changes) {
        updateCall = { customerId, changes };
        return customerRow({
          MaKH: customerId,
          HoTen: changes.fullName,
          Email: changes.email,
          DiaChi: changes.address,
        });
      },
    },
    transactionRunner: async (work) => work({ id: 'tx' }),
  });

  const profile = await service.updateOwnProfile(
    { customerId: 'KHC08OWN' },
    {
      fullName: 'Updated Name',
      email: 'updated@example.com',
      address: 'Updated address',
    },
  );

  assert.deepEqual(updateCall, {
    customerId: 'KHC08OWN',
    changes: {
      fullName: 'Updated Name',
      email: 'updated@example.com',
      address: 'Updated address',
    },
  });
  assert.equal(profile.loyaltyPoints, 25);
  assert.equal(profile.phone, '0900000001');
});

test('purchase history uses authenticated ownership with pagination and date filters', async () => {
  let receivedQuery;
  const service = new CustomerService({
    customerRepository: {
      async listInvoices(query) {
        receivedQuery = query;
        return {
          items: [
            {
              MaHD: 'HD-C09-001',
              NgayLap: new Date('2026-02-15T08:30:00Z'),
              TongThanhToan: 42500,
              TrangThai: 'PAID',
            },
          ],
          totalItems: 3,
        };
      },
    },
  });

  const result = await service.listOwnInvoices(
    { customerId: 'KHC09OWN' },
    { page: '2', pageSize: '1', from: '2026-02-01', to: '2026-02-28' },
  );

  assert.deepEqual(receivedQuery, {
    customerId: 'KHC09OWN',
    from: '2026-02-01',
    page: 2,
    pageSize: 1,
    to: '2026-02-28',
  });
  assert.deepEqual(result.pagination, {
    page: 2,
    pageSize: 1,
    totalItems: 3,
    totalPages: 3,
  });
  assert.deepEqual(result.items[0], {
    invoiceId: 'HD-C09-001',
    purchasedAt: '2026-02-15T08:30:00.000Z',
    status: 'PAID',
    totalAmount: 42500,
  });
});

test('purchase history rejects invalid pagination and date ranges', async () => {
  const service = new CustomerService({ customerRepository: {} });
  const invalidQueries = [
    { page: '0' },
    { page: '1.5' },
    { pageSize: '101' },
    { page: '2147483647', pageSize: '100' },
    { from: '2026-02-30' },
    { from: '2026-03-01', to: '2026-02-28' },
  ];

  for (const query of invalidQueries) {
    await assert.rejects(
      service.listOwnInvoices({ customerId: 'KHC09OWN' }, query),
      (error) => error.statusCode === 400 && error.code === 'VALIDATION_ERROR',
    );
  }
});

test('invoice detail is owner-scoped and exposes product lines without inventory data', async () => {
  const calls = [];
  const repository = {
    async findInvoiceDetail(customerId, invoiceId) {
      calls.push({ customerId, invoiceId });
      if (invoiceId === 'HD-FOREIGN') return null;
      return {
        invoice: {
          MaHD: invoiceId,
          NgayLap: new Date('2026-02-15T08:30:00Z'),
          TongTienHang: 50000,
          TongGiamGia: 5000,
          TongThanhToan: 45000,
          TrangThai: 'REFUNDED',
        },
        items: [
          {
            MaSP: 'SP01',
            TenSP: 'Test product',
            SoLuong: 2,
            DonGiaBan: 25000,
            TienGiam: 5000,
            ThanhTien: 45000,
          },
        ],
      };
    },
  };
  const service = new CustomerService({ customerRepository: repository });

  const detail = await service.getOwnInvoiceDetail({ customerId: 'KHC09OWN' }, 'HD-C09-001');
  assert.equal(detail.invoiceId, 'HD-C09-001');
  assert.deepEqual(detail.items[0], {
    discountAmount: 5000,
    lineTotal: 45000,
    productId: 'SP01',
    productName: 'Test product',
    quantity: 2,
    unitPrice: 25000,
  });
  assert.equal(Object.hasOwn(detail.items[0], 'lot'), false);
  assert.equal(Object.hasOwn(detail.items[0], 'stock'), false);

  await assert.rejects(
    service.getOwnInvoiceDetail({ customerId: 'KHC09OWN' }, 'HD-FOREIGN'),
    (error) => error.statusCode === 404 && error.code === 'INVOICE_NOT_FOUND',
  );
  assert.deepEqual(calls, [
    { customerId: 'KHC09OWN', invoiceId: 'HD-C09-001' },
    { customerId: 'KHC09OWN', invoiceId: 'HD-FOREIGN' },
  ]);
});

test('loyalty is read from the authenticated customer only', async () => {
  const requestedIds = [];
  const service = new CustomerService({
    customerRepository: {
      async findLoyaltyById(customerId) {
        requestedIds.push(customerId);
        return {
          MaKH: customerId,
          DiemTichLuy: 87,
          HangThanhVien: 'SILVER',
          TrangThai: 'ACTIVE',
        };
      },
    },
  });

  const result = await service.getOwnLoyalty({ customerId: 'KHC09OWN' });
  assert.deepEqual(requestedIds, ['KHC09OWN']);
  assert.deepEqual(result, { loyaltyPoints: 87, membershipTier: 'SILVER' });
});
