'use strict';

process.env.JWT_SECRET = 'c43-audit-integration-secret-with-32-bytes';
process.env.JWT_EXPIRES_IN = '15m';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const { AuthRepository } = require('../src/repositories/auth.repository');
const { AuditRepository } = require('../src/repositories/audit.repository');

AuthRepository.prototype.findIdentityById = async function findIdentityById(accountId) {
  const manager = accountId === 43;
  return {
    MaTK: accountId,
    TenDangNhap: manager ? 'c43.manager' : 'c43.cashier',
    MaVaiTro: manager ? 'MANAGER' : 'CASHIER',
    TenVaiTro: manager ? 'Quan ly' : 'Thu ngan',
    LoaiChuSoHuu: 'EMPLOYEE',
    MaChuSoHuu: manager ? 'C43MGR' : 'C43CASH',
    TenChuSoHuu: manager ? 'C43 Manager' : 'C43 Cashier',
    TrangThai: 'ACTIVE',
    TrangThaiChuSoHuu: 'ACTIVE',
  };
};

let capturedFilters;
const auditRow = {
  MaNhatKy: 4301,
  MaTK: 43,
  TenDangNhap: 'c43.manager',
  MaVaiTro: 'MANAGER',
  TenVaiTro: 'Quan ly',
  LoaiChuSoHuu: 'EMPLOYEE',
  MaChuSoHuu: 'C43MGR',
  TenChuSoHuu: 'C43 Manager',
  HanhDong: 'ACCOUNT_LOCKED',
  TenBang: 'TAI_KHOAN',
  MaBanGhi: '12',
  DuLieuCu: '{"status":"ACTIVE"}',
  DuLieuMoi: '{"status":"LOCKED"}',
  DuLieuCuLaJson: true,
  DuLieuMoiLaJson: true,
  ThoiGian: new Date('2026-10-03T02:00:00Z'),
  DiaChiIP: '127.0.0.1',
};
AuditRepository.prototype.list = async function list(filters) {
  capturedFilters = filters;
  return { items: [auditRow], totalItems: 1 };
};
AuditRepository.prototype.findById = async function findById(id) {
  return id === 4301 ? auditRow : null;
};

const app = require('../src/app');

async function startServer(context) {
  const server = app.listen(0);
  await once(server, 'listening');
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

function token(accountId) {
  return jwt.sign({ sub: String(accountId) }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

async function getJson(baseUrl, path, accessToken) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  return { response, payload: await response.json() };
}

test('manager audit API supports filters, pagination and detail while RBAC blocks cashier', async (context) => {
  const baseUrl = await startServer(context);
  const managerToken = token(43);
  const cashierToken = token(44);

  const list = await getJson(
    baseUrl,
    '/api/admin/audit-logs?page=2&pageSize=5&from=2026-10-01&to=2026-10-03&username=c43.manager&action=account_locked&table=tai_khoan&recordId=12',
    managerToken,
  );
  assert.equal(list.response.status, 200);
  assert.equal(list.payload.data.items[0].changes.after.status, 'LOCKED');
  assert.equal(list.payload.data.pagination.page, 2);
  assert.deepEqual(capturedFilters, {
    action: 'ACCOUNT_LOCKED', from: '2026-10-01', page: 2, pageSize: 5,
    recordId: '12', tableName: 'TAI_KHOAN', to: '2026-10-03', username: 'c43.manager',
  });

  const detail = await getJson(baseUrl, '/api/admin/audit-logs/4301', managerToken);
  assert.equal(detail.response.status, 200);
  assert.equal(detail.payload.data.auditLogId, 4301);
  assert.equal(JSON.stringify(detail.payload).toLowerCase().includes('password'), false);

  const forbidden = await getJson(baseUrl, '/api/admin/audit-logs', cashierToken);
  assert.equal(forbidden.response.status, 403);
  assert.equal(forbidden.payload.error.code, 'FORBIDDEN');

  const unauthenticated = await getJson(baseUrl, '/api/admin/audit-logs');
  assert.equal(unauthenticated.response.status, 401);
  assert.equal(unauthenticated.payload.error.code, 'AUTHENTICATION_REQUIRED');
});
