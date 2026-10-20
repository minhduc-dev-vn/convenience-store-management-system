'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AuditService,
  normalizeListQuery,
  serializeAuditData,
} = require('../src/services/audit.service');

const manager = { accountId: 43, role: 'MANAGER' };

test('central audit writer normalizes metadata, serializes payload and reuses the transaction', async () => {
  let captured;
  const transaction = { id: 'audit-transaction' };
  const service = new AuditService({
    auditRepository: {
      async write(entry, receivedTransaction) {
        captured = { entry, receivedTransaction };
        return { MaNhatKy: 1, ThoiGian: new Date('2026-10-03T00:00:00Z') };
      },
    },
  });

  await service.record({
    action: 'account_locked',
    actorAccountId: 43,
    ipAddress: ' 127.0.0.1 ',
    newData: { status: 'LOCKED' },
    oldData: { status: 'ACTIVE' },
    recordId: 7,
    tableName: 'tai_khoan',
  }, transaction);

  assert.equal(captured.receivedTransaction, transaction);
  assert.deepEqual(captured.entry, {
    action: 'ACCOUNT_LOCKED',
    actorAccountId: 43,
    ipAddress: '127.0.0.1',
    newData: '{"status":"LOCKED"}',
    oldData: '{"status":"ACTIVE"}',
    recordId: '7',
    tableName: 'TAI_KHOAN',
  });
});

test('central audit writer rejects sensitive keys before repository access', async () => {
  let wrote = false;
  const service = new AuditService({
    auditRepository: { async write() { wrote = true; } },
  });
  await assert.rejects(
    service.record({
      action: 'ACCOUNT_UPDATED',
      actorAccountId: 43,
      newData: { profile: { passwordHash: 'must-not-log' } },
      recordId: 7,
      tableName: 'TAI_KHOAN',
    }),
    (error) => error.code === 'AUDIT_SENSITIVE_DATA' && error.statusCode === 500,
  );
  assert.equal(wrote, false);
  assert.throws(
    () => serializeAuditData({ authorization: 'Bearer value' }),
    (error) => error.code === 'AUDIT_SENSITIVE_DATA',
  );
  assert.throws(
    () => serializeAuditData('{"passwordHash":"must-not-log"}'),
    (error) => error.code === 'AUDIT_SENSITIVE_DATA',
  );
});

test('audit list validates filters and serializes safe actor/change data', async () => {
  let captured;
  const service = new AuditService({
    auditRepository: {
      async list(filters) {
        captured = filters;
        return {
          totalItems: 1,
          items: [{
            MaNhatKy: 9,
            MaTK: 43,
            TenDangNhap: 'manager',
            MaVaiTro: 'MANAGER',
            TenVaiTro: 'Quan ly',
            LoaiChuSoHuu: 'EMPLOYEE',
            MaChuSoHuu: 'NV043',
            TenChuSoHuu: 'Manager',
            HanhDong: 'UPDATE_PRICE',
            TenBang: 'SAN_PHAM',
            MaBanGhi: 'SP001',
            DuLieuCu: '{"price":10000}',
            DuLieuMoi: '{"price":12000}',
            DuLieuCuLaJson: true,
            DuLieuMoiLaJson: true,
            ThoiGian: new Date('2026-10-03T01:02:03Z'),
            DiaChiIP: '127.0.0.1',
          }],
        };
      },
    },
  });

  const result = await service.list(manager, {
    action: 'update_price', from: '2026-10-01', page: '2', pageSize: '5',
    recordId: 'SP001', table: 'san_pham', to: '2026-10-03', username: 'manager',
  });
  assert.deepEqual(captured, {
    action: 'UPDATE_PRICE', from: '2026-10-01', page: 2, pageSize: 5,
    recordId: 'SP001', tableName: 'SAN_PHAM', to: '2026-10-03', username: 'manager',
  });
  assert.equal(result.items[0].changes.before.price, 10000);
  assert.equal(result.items[0].actor.username, 'manager');
  assert.deepEqual(result.pagination, { page: 2, pageSize: 5, totalItems: 1, totalPages: 1 });
});

test('audit read is manager-only and rejects invalid ranges and identifiers', async () => {
  const service = new AuditService({
    auditRepository: { async findById() { return null; }, async list() { return {}; } },
  });
  await assert.rejects(
    service.list({ role: 'CASHIER' }),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
  assert.throws(
    () => normalizeListQuery({ from: '2026-10-04', to: '2026-10-03' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  await assert.rejects(
    service.getById(manager, '0'),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  await assert.rejects(
    service.getById(manager, '999'),
    (error) => error.code === 'AUDIT_LOG_NOT_FOUND' && error.statusCode === 404,
  );
});
