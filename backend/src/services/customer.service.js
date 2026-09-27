'use strict';

const { CustomerRepository } = require('../repositories/customer.repository');
const { AppError } = require('../utils/app-error');
const {
  normalizeEmail,
  normalizeFullName,
  normalizeOptionalText,
} = require('../utils/input-validation');
const { withTransaction } = require('../utils/transaction');

function serializeCustomer(row) {
  return {
    address: row.DiaChi,
    customerId: row.MaKH,
    dateOfBirth: row.NgaySinh instanceof Date
      ? row.NgaySinh.toISOString().slice(0, 10)
      : row.NgaySinh,
    email: row.Email,
    fullName: row.HoTen,
    loyaltyPoints: row.DiemTichLuy,
    membershipTier: row.HangThanhVien,
    phone: row.SDT,
    registeredAt: row.NgayDangKy,
    status: row.TrangThai,
  };
}

class CustomerService {
  constructor({
    customerRepository = new CustomerRepository(),
    transactionRunner = withTransaction,
  } = {}) {
    this.customerRepository = customerRepository;
    this.transactionRunner = transactionRunner;
  }

  async getOwnProfile(identity) {
    const customer = await this.customerRepository.findById(identity.customerId);
    if (!customer || customer.TrangThai !== 'ACTIVE') {
      throw new AppError('The customer profile is unavailable', {
        code: 'CUSTOMER_PROFILE_UNAVAILABLE',
        statusCode: 403,
      });
    }

    return serializeCustomer(customer);
  }

  async updateOwnProfile(identity, input) {
    const changes = {};
    if (Object.hasOwn(input, 'fullName')) changes.fullName = normalizeFullName(input.fullName);
    if (Object.hasOwn(input, 'email')) changes.email = normalizeEmail(input.email);
    if (Object.hasOwn(input, 'address')) {
      changes.address = normalizeOptionalText(input.address, 'address', 255);
    }

    return this.transactionRunner(async (transaction) => {
      if (Object.hasOwn(changes, 'email')) {
        const emailExists = await this.customerRepository.emailExistsForAnotherOwner(
          changes.email,
          identity.customerId,
          transaction,
        );
        if (emailExists) {
          throw new AppError('The email address is already registered', {
            code: 'PROFILE_CONFLICT',
            statusCode: 409,
          });
        }
      }

      const customer = await this.customerRepository.updateProfile(
        identity.customerId,
        changes,
        transaction,
      );
      if (!customer || customer.TrangThai !== 'ACTIVE') {
        throw new AppError('The customer profile is unavailable', {
          code: 'CUSTOMER_PROFILE_UNAVAILABLE',
          statusCode: 403,
        });
      }

      return serializeCustomer(customer);
    });
  }
}

module.exports = {
  CustomerService,
  serializeCustomer,
};
