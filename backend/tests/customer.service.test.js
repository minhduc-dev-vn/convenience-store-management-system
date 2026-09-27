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
