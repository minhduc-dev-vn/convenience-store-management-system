'use strict';

const { CustomerRepository } = require('../repositories/customer.repository');
const { AppError } = require('../utils/app-error');
const {
  normalizeEmail,
  normalizeFullName,
  normalizeOptionalText,
  requireString,
  validationError,
} = require('../utils/input-validation');
const { withTransaction } = require('../utils/transaction');

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const SQL_INT_MAX = 2_147_483_647;

function serializeTimestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function parsePositiveInteger(value, fieldName, defaultValue, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw validationError(`${fieldName} must be a positive integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw validationError(`${fieldName} must be between 1 and ${maximum}`);
  }

  return parsed;
}

function parseDateFilter(value, fieldName) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError(`${fieldName} must use YYYY-MM-DD format`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day) {
    throw validationError(`${fieldName} must be a valid calendar date`);
  }

  return value;
}

function normalizeInvoiceListQuery(query) {
  const page = parsePositiveInteger(query.page, 'page', DEFAULT_PAGE, SQL_INT_MAX);
  const pageSize = parsePositiveInteger(
    query.pageSize,
    'pageSize',
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
  );
  const from = parseDateFilter(query.from, 'from');
  const to = parseDateFilter(query.to, 'to');

  if (from && to && from > to) {
    throw validationError('from must be earlier than or equal to to');
  }
  if ((page - 1) * pageSize > SQL_INT_MAX) {
    throw validationError('page is too large for the selected pageSize');
  }

  return { from, page, pageSize, to };
}

function serializeInvoiceSummary(row) {
  return {
    invoiceId: row.MaHD,
    purchasedAt: serializeTimestamp(row.NgayLap),
    status: row.TrangThai,
    totalAmount: Number(row.TongThanhToan),
  };
}

function serializeInvoiceDetail(result) {
  const { invoice } = result;
  return {
    discountAmount: Number(invoice.TongGiamGia),
    invoiceId: invoice.MaHD,
    items: result.items.map((item) => ({
      discountAmount: Number(item.TienGiam),
      lineTotal: Number(item.ThanhTien),
      productId: item.MaSP,
      productName: item.TenSP,
      quantity: item.SoLuong,
      unitPrice: Number(item.DonGiaBan),
    })),
    purchasedAt: serializeTimestamp(invoice.NgayLap),
    status: invoice.TrangThai,
    subtotal: Number(invoice.TongTienHang),
    totalAmount: Number(invoice.TongThanhToan),
  };
}

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

  async getOwnLoyalty(identity) {
    const customer = await this.customerRepository.findLoyaltyById(identity.customerId);
    if (!customer || customer.TrangThai !== 'ACTIVE') {
      throw new AppError('The customer profile is unavailable', {
        code: 'CUSTOMER_PROFILE_UNAVAILABLE',
        statusCode: 403,
      });
    }

    return {
      loyaltyPoints: customer.DiemTichLuy,
      membershipTier: customer.HangThanhVien,
    };
  }

  async listOwnInvoices(identity, query = {}) {
    const filters = normalizeInvoiceListQuery(query);
    const result = await this.customerRepository.listInvoices({
      customerId: identity.customerId,
      ...filters,
    });

    return {
      items: result.items.map(serializeInvoiceSummary),
      pagination: {
        page: filters.page,
        pageSize: filters.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / filters.pageSize),
      },
    };
  }

  async getOwnInvoiceDetail(identity, invoiceIdInput) {
    const invoiceId = requireString(invoiceIdInput, 'invoiceId', { maxLength: 15 });
    const result = await this.customerRepository.findInvoiceDetail(
      identity.customerId,
      invoiceId,
    );

    if (!result) {
      throw new AppError('The invoice was not found', {
        code: 'INVOICE_NOT_FOUND',
        statusCode: 404,
      });
    }

    return serializeInvoiceDetail(result);
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
  normalizeInvoiceListQuery,
  serializeCustomer,
  serializeInvoiceDetail,
  serializeInvoiceSummary,
};
