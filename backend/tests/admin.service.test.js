'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { AdminService } = require('../src/services/admin.service');

const manager = { accountId: 1, role: 'MANAGER' };
const transactionRunner = async (work) => work({ transaction: true });
const passwordHasher = {
  async hash(value) {
    return `hashed:${value}`;
  },
};
const settingsProvider = () => ({ bcryptRounds: 4 });

function employeeRow(overrides = {}) {
  return {
    MaNV: 'NVTEST001',
    HoTen: 'Test Employee',
    NgaySinh: new Date('1995-01-02T00:00:00.000Z'),
    GioiTinh: 'OTHER',
    SDT: '0900000011',
    Email: 'employee@example.test',
    DiaChi: 'Test address',
    NgayVaoLam: new Date('2026-01-01T00:00:00.000Z'),
    LuongCoBan: 5000000,
    TrangThai: 'ACTIVE',
    ...overrides,
  };
}

function accountRow(overrides = {}) {
  return {
    MaTK: 42,
    TenDangNhap: 'test.employee',
    MaVaiTro: 'CASHIER',
    TenVaiTro: 'Thu ngân',
    TrangThai: 'ACTIVE',
    LanDangNhapCuoi: null,
    NgayTao: new Date('2026-01-01T00:00:00.000Z'),
    LoaiChuSoHuu: 'EMPLOYEE',
    MaChuSoHuu: 'NVTEST001',
    TenChuSoHuu: 'Test Employee',
    TrangThaiChuSoHuu: 'ACTIVE',
    ...overrides,
  };
}

function customerRow(overrides = {}) {
  return {
    MaKH: 'KHTEST001',
    HoTen: 'Test Customer',
    SDT: '0900000022',
    Email: 'customer@example.test',
    DiaChi: 'Customer address',
    NgaySinh: new Date('1997-03-04T00:00:00.000Z'),
    DiemTichLuy: 250,
    HangThanhVien: 'GOLD',
    NgayDangKy: new Date('2026-02-01T10:00:00.000Z'),
    TrangThai: 'ACTIVE',
    MaTK: 43,
    TenDangNhap: 'test.customer',
    MaVaiTro: 'CUSTOMER',
    TrangThaiTaiKhoan: 'ACTIVE',
    LanDangNhapCuoi: null,
    NgayTao: new Date('2026-02-01T10:00:00.000Z'),
    ...overrides,
  };
}

test('employee list normalizes filters and never exposes database-only fields', async () => {
  let receivedFilters;
  const service = new AdminService({
    adminRepository: {
      async listEmployees(filters) {
        receivedFilters = filters;
        return { items: [employeeRow({ MatKhauHash: 'not-an-employee-field' })], totalItems: 1 };
      },
    },
  });

  const result = await service.listEmployees({ page: '2', pageSize: '5', search: '50%_off', status: 'active' });

  assert.equal(receivedFilters.page, 2);
  assert.equal(receivedFilters.pageSize, 5);
  assert.equal(receivedFilters.searchPattern, '%50~%~_off%');
  assert.equal(receivedFilters.status, 'ACTIVE');
  assert.equal(result.items[0].employeeId, 'NVTEST001');
  assert.equal(Object.hasOwn(result.items[0], 'MatKhauHash'), false);
  assert.deepEqual(result.pagination, { page: 2, pageSize: 5, totalItems: 1, totalPages: 1 });
});

test('employee creation validates identifiers and writes an audit in the same transaction', async () => {
  const calls = [];
  const service = new AdminService({
    adminRepository: {
      async findEmployeeIdentifierConflicts(employee, transaction) {
        calls.push(['conflicts', employee.employeeId, transaction]);
        return { emailExists: false, phoneExists: false };
      },
      async createEmployee(employee, transaction) {
        calls.push(['create', transaction]);
        return employeeRow({
          MaNV: employee.employeeId,
          HoTen: employee.fullName,
          SDT: employee.phone,
          Email: employee.email,
          LuongCoBan: employee.baseSalary,
        });
      },
      async writeAudit(audit, transaction) {
        calls.push(['audit', audit, transaction]);
      },
    },
    employeeIdGenerator: () => 'NVC11UNIT',
    transactionRunner,
  });

  const result = await service.createEmployee(manager, {
    fullName: '  Unit   Employee ',
    phone: '0900000011',
    email: 'EMPLOYEE@EXAMPLE.TEST',
    baseSalary: 5000000,
  }, '127.0.0.1');

  assert.equal(result.employeeId, 'NVC11UNIT');
  assert.equal(result.fullName, 'Unit Employee');
  assert.equal(calls[2][1].action, 'EMPLOYEE_CREATED');
  assert.equal(calls[2][1].actorAccountId, manager.accountId);
  assert.deepEqual(calls[0][2], calls[1][1]);
  assert.deepEqual(calls[1][1], calls[2][2]);
});

test('employee update uses status instead of deletion and audits before/after values', async () => {
  let updateChanges;
  let auditRecord;
  const service = new AdminService({
    adminRepository: {
      async findEmployeeById() {
        return employeeRow();
      },
      async findEmployeeIdentifierConflicts() {
        return { emailExists: false, phoneExists: false };
      },
      async updateEmployee(_employeeId, changes) {
        updateChanges = changes;
        return employeeRow({ HoTen: changes.fullName, TrangThai: changes.status });
      },
      async writeAudit(audit) {
        auditRecord = audit;
      },
    },
    transactionRunner,
  });

  const result = await service.updateEmployee(manager, 'NVTEST001', {
    fullName: 'Updated Employee',
    status: 'INACTIVE',
  });

  assert.deepEqual(updateChanges, { fullName: 'Updated Employee', status: 'INACTIVE' });
  assert.equal(result.status, 'INACTIVE');
  assert.equal(auditRecord.action, 'EMPLOYEE_UPDATED');
  assert.equal(JSON.parse(auditRecord.oldData).status, 'ACTIVE');
  assert.equal(JSON.parse(auditRecord.newData).status, 'INACTIVE');
});

test('manager customer list supports member filters without exposing account secrets', async () => {
  let receivedFilters;
  const service = new AdminService({
    adminRepository: {
      async listCustomers(filters) {
        receivedFilters = filters;
        return {
          items: [customerRow({ MatKhauHash: 'must-never-leak' })],
          totalItems: 1,
        };
      },
    },
  });

  const result = await service.listCustomers({
    membershipTier: 'gold', page: '2', pageSize: '5', search: '50%_member', status: 'active',
  });

  assert.equal(receivedFilters.membershipTier, 'GOLD');
  assert.equal(receivedFilters.searchPattern, '%50~%~_member%');
  assert.equal(receivedFilters.status, 'ACTIVE');
  assert.equal(result.items[0].customerId, 'KHTEST001');
  assert.equal(result.items[0].account.status, 'ACTIVE');
  assert.equal(JSON.stringify(result).includes('must-never-leak'), false);
  assert.deepEqual(result.pagination, { page: 2, pageSize: 5, totalItems: 1, totalPages: 1 });
});

test('manager customer detail and history use explicit customer id rather than self ownership', async () => {
  const customerRepositoryCalls = [];
  const service = new AdminService({
    adminRepository: {
      async findCustomerById(customerId) {
        assert.equal(customerId, 'KHTEST001');
        return customerRow();
      },
    },
    customerRepository: {
      async listInvoices(filters) {
        customerRepositoryCalls.push(filters);
        return {
          items: [{
            MaHD: 'HDTEST001',
            NgayLap: new Date('2026-03-01T09:00:00.000Z'),
            TongThanhToan: 120000,
            TrangThai: 'PAID',
          }],
          totalItems: 1,
        };
      },
      async findInvoiceDetail(customerId, invoiceId) {
        assert.equal(customerId, 'KHTEST001');
        assert.equal(invoiceId, 'HDTEST001');
        return {
          invoice: {
            MaHD: invoiceId,
            NgayLap: new Date('2026-03-01T09:00:00.000Z'),
            TongTienHang: 120000,
            TongGiamGia: 0,
            TongThanhToan: 120000,
            TrangThai: 'PAID',
          },
          items: [{
            MaSP: 'SPTEST001', TenSP: 'Test product', SoLuong: 2,
            DonGiaBan: 60000, TienGiam: 0, ThanhTien: 120000,
          }],
        };
      },
    },
  });

  const detail = await service.getCustomer('KHTEST001');
  const history = await service.listCustomerInvoices('KHTEST001', {
    page: '1', pageSize: '10', from: '2026-03-01', to: '2026-03-31',
  });
  const invoice = await service.getCustomerInvoiceDetail('KHTEST001', 'HDTEST001');

  assert.equal(detail.loyaltyPoints, 250);
  assert.equal(customerRepositoryCalls[0].customerId, 'KHTEST001');
  assert.equal(history.items[0].invoiceId, 'HDTEST001');
  assert.equal(invoice.items[0].productId, 'SPTEST001');
});

test('customer account lock uses shared status rules and writes a secret-free audit', async () => {
  let updatedStatus;
  let audit;
  const service = new AdminService({
    adminRepository: {
      async findCustomerAccountForUpdate(customerId) {
        assert.equal(customerId, 'KHTEST001');
        return accountRow({
          MaTK: 43,
          MaVaiTro: 'CUSTOMER',
          LoaiChuSoHuu: 'CUSTOMER',
          MaChuSoHuu: 'KHTEST001',
          TenChuSoHuu: 'Test Customer',
        });
      },
      async updateAccountStatus(_accountId, status) { updatedStatus = status; },
      async writeAudit(value) { audit = value; },
      async findAccountById() {
        return accountRow({
          MaTK: 43,
          MaVaiTro: 'CUSTOMER',
          LoaiChuSoHuu: 'CUSTOMER',
          MaChuSoHuu: 'KHTEST001',
          TenChuSoHuu: 'Test Customer',
          TrangThai: 'LOCKED',
        });
      },
    },
    transactionRunner,
  });

  const result = await service.updateCustomerAccountStatus(
    manager,
    'KHTEST001',
    { status: 'LOCKED' },
    '127.0.0.1',
  );

  assert.equal(updatedStatus, 'LOCKED');
  assert.equal(result.status, 'LOCKED');
  assert.equal(audit.action, 'ACCOUNT_LOCKED');
  assert.equal(audit.recordId, 43);
  assert.equal(JSON.stringify(audit).toLowerCase().includes('password'), false);
});

test('manager customer API rejects unsupported tiers and missing customer accounts', async () => {
  const service = new AdminService({
    adminRepository: {
      async findCustomerAccountForUpdate() { return null; },
    },
    transactionRunner,
  });

  await assert.rejects(
    service.listCustomers({ membershipTier: 'PLATINUM' }),
    (error) => error.code === 'VALIDATION_ERROR' && error.statusCode === 400,
  );
  await assert.rejects(
    service.updateCustomerAccountStatus(manager, 'KHTEST001', { status: 'LOCKED' }),
    (error) => error.code === 'CUSTOMER_ACCOUNT_NOT_FOUND' && error.statusCode === 404,
  );
});

test('account creation supports either owner type while enforcing the owner-role invariant', async () => {
  const createdInputs = [];
  const repository = {
    async findOwner(ownerType, ownerId) {
      return { OwnerId: ownerId, TrangThai: 'ACTIVE', OwnerType: ownerType };
    },
    async usernameHasConflict() {
      return false;
    },
    async createAccount(input) {
      createdInputs.push(input);
      return createdInputs.length + 40;
    },
    async findAccountById(accountId) {
      const input = createdInputs[accountId - 41];
      return accountRow({
        MaTK: accountId,
        MaVaiTro: input.role,
        LoaiChuSoHuu: input.ownerType,
        MaChuSoHuu: input.ownerId,
        TenDangNhap: input.username,
      });
    },
    async writeAudit() {},
  };
  const service = new AdminService({
    adminRepository: repository,
    passwordHasher,
    settingsProvider,
    transactionRunner,
  });

  const employeeAccount = await service.createAccount(manager, {
    ownerType: 'EMPLOYEE', ownerId: 'NVTEST001', username: 'staff.user', role: 'WAREHOUSE',
    password: 'temporary-11', passwordConfirmation: 'temporary-11',
  });
  const customerAccount = await service.createAccount(manager, {
    ownerType: 'CUSTOMER', ownerId: 'KHTEST001', username: 'customer.user', role: 'CUSTOMER',
    password: 'temporary-12', passwordConfirmation: 'temporary-12',
  });

  assert.equal(employeeAccount.owner.type, 'EMPLOYEE');
  assert.equal(customerAccount.owner.type, 'CUSTOMER');
  assert.equal(createdInputs[0].passwordHash, 'hashed:temporary-11');

  await assert.rejects(
    service.createAccount(manager, {
      ownerType: 'CUSTOMER', ownerId: 'KHTEST001', username: 'bad.role', role: 'MANAGER',
      password: 'temporary-13', passwordConfirmation: 'temporary-13',
    }),
    (error) => error.code === 'VALIDATION_ERROR' && error.statusCode === 400,
  );
});

test('duplicate usernames return an explicit account conflict', async () => {
  const service = new AdminService({
    adminRepository: {
      async findOwner() { return { TrangThai: 'ACTIVE' }; },
      async usernameHasConflict() { return true; },
    },
    passwordHasher,
    settingsProvider,
    transactionRunner,
  });

  await assert.rejects(
    service.createAccount(manager, {
      ownerType: 'EMPLOYEE', ownerId: 'NVTEST001', username: 'duplicate', role: 'CASHIER',
      password: 'temporary-11', passwordConfirmation: 'temporary-11',
    }),
    (error) => error.code === 'ACCOUNT_CONFLICT' && error.statusCode === 409,
  );
});

test('lock, role change and employee password reset are audited without secret payloads', async () => {
  const audits = [];
  const updates = [];
  const repository = {
    async findAccountForUpdate() { return accountRow(); },
    async findAccountById() { return accountRow({ MaVaiTro: 'WAREHOUSE', TrangThai: 'LOCKED' }); },
    async updateAccountRole(_accountId, role) { updates.push(['role', role]); },
    async updateAccountStatus(_accountId, status) { updates.push(['status', status]); },
    async updateAccountPassword(_accountId, hash) { updates.push(['hash', hash]); },
    async writeAudit(audit) { audits.push(audit); },
  };
  const service = new AdminService({
    adminRepository: repository,
    passwordHasher,
    settingsProvider,
    transactionRunner,
  });

  await service.updateAccountRole(manager, '42', { role: 'WAREHOUSE' });
  await service.updateAccountStatus(manager, '42', { status: 'LOCKED' });
  await service.resetEmployeePassword(manager, '42', {
    newPassword: 'replacement-11',
    newPasswordConfirmation: 'replacement-11',
  });

  assert.deepEqual(updates, [
    ['role', 'WAREHOUSE'],
    ['status', 'LOCKED'],
    ['hash', 'hashed:replacement-11'],
  ]);
  assert.deepEqual(audits.map((audit) => audit.action), [
    'ACCOUNT_ROLE_CHANGED', 'ACCOUNT_LOCKED', 'EMPLOYEE_PASSWORD_RESET',
  ]);
  assert.equal(audits[2].oldData, null);
  assert.equal(audits[2].newData, null);
  assert.equal(JSON.stringify(audits).includes('replacement-11'), false);
});

test('manager reset rejects customer accounts before updating their stored hash', async () => {
  let passwordUpdated = false;
  const service = new AdminService({
    adminRepository: {
      async findAccountForUpdate() { return accountRow({ LoaiChuSoHuu: 'CUSTOMER' }); },
      async updateAccountPassword() { passwordUpdated = true; },
    },
    passwordHasher,
    settingsProvider,
    transactionRunner,
  });

  await assert.rejects(
    service.resetEmployeePassword(manager, '42', {
      newPassword: 'replacement-11',
      newPasswordConfirmation: 'replacement-11',
    }),
    (error) => error.code === 'VALIDATION_ERROR' && error.statusCode === 400,
  );
  assert.equal(passwordUpdated, false);
});
