'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  StocktakeService,
  normalizeCountInput,
  normalizeListQuery,
} = require('../src/services/stocktake.service');

const warehouse = { accountId: 41, employeeId: 'NVK001', role: 'WAREHOUSE' };
const manager = { accountId: 42, employeeId: 'QL001', role: 'MANAGER' };

function detail(overrides = {}) {
  return {
    ChenhLech: 2,
    DonViTinh: 'Cai',
    LyDo: 'Dem lech',
    MaLo: 'LO001',
    MaSP: 'SP001',
    SnapshotDaThayDoi: false,
    SoLo: 'BATCH-1',
    SoLuongHeThong: 5,
    SoLuongThucTe: 7,
    SoLuongTonHienTai: 5,
    TenNhanVien: 'Nhan vien kho',
    TenSP: 'San pham',
    ...overrides,
  };
}

function header(overrides = {}) {
  return {
    DuLieuQuyTrinh: null,
    GhiChu: null,
    HanhDongQuyTrinh: null,
    MaKK: 'KK001',
    MaNV: 'NVK001',
    NgayKiemKe: new Date('2026-10-03T01:00:00Z'),
    SoDongChenhLech: 1,
    TenNhanVien: 'Nhan vien kho',
    ThoiGianQuyTrinh: null,
    TongChenhLechTuyetDoi: 2,
    TongSoDong: 1,
    TrangThai: 'DRAFT',
    TrangThaiQuyTrinh: 'DRAFT',
    ...overrides,
  };
}

function serviceWith(repository) {
  return new StocktakeService({
    auditService: {
      async record(input) {
        if (repository.writeWorkflowAudit) return repository.writeWorkflowAudit(input);
        return null;
      },
    },
    stocktakeIdGenerator: () => 'KK001',
    stocktakeRepository: repository,
    transactionRunner: (work) => work({ id: 'tx' }),
  });
}

test('normalizers reject client stock fields and invalid quantities through their API contracts', () => {
  assert.deepEqual(normalizeCountInput({ actualQuantity: 0 }), {
    actualQuantity: 0,
    reason: null,
  });
  assert.throws(
    () => normalizeCountInput({ actualQuantity: -1 }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.deepEqual(normalizeListQuery({ page: '2', pageSize: '5', workflowState: 'pending_approval' }), {
    page: 2,
    pageSize: 5,
    searchPattern: null,
    status: null,
    workflowState: 'PENDING_APPROVAL',
  });
});

test('warehouse create uses authenticated employee and serializes the C39 snapshot', async () => {
  let captured;
  const service = serviceWith({
    async createStocktake(input) {
      captured = input;
      return {
        header: { MaKK: 'KK001', MaNV: 'NVK001', NgayKiemKe: new Date(), TrangThai: 'DRAFT' },
        details: [detail({ ChenhLech: 0, LyDo: null, SoLuongThucTe: 5 })],
      };
    },
  });
  const result = await service.createStocktake(warehouse, { note: 'Kiem ke dinh ky' });
  assert.equal(captured.employeeId, 'NVK001');
  assert.equal(captured.stocktakeId, 'KK001');
  assert.equal(result.stocktake.schemaStatus, 'DRAFT');
  assert.equal(result.stocktake.workflow.state, 'DRAFT');
  assert.equal(result.lines[0].systemQuantity, 5);
});

test('warehouse list is owner-scoped while manager list is not', async () => {
  const seen = [];
  const service = serviceWith({
    async listStocktakes(filters) {
      seen.push(filters.employeeId);
      return { items: [header()], totalItems: 1 };
    },
  });
  await service.listWarehouseStocktakes(warehouse);
  await service.listManagerStocktakes(manager);
  assert.deepEqual(seen, ['NVK001', null]);
});

test('warehouse cannot edit a proposal pending manager approval', async () => {
  let recorded = false;
  const service = serviceWith({
    async getStocktake() {
      return { header: header({ TrangThaiQuyTrinh: 'PENDING_APPROVAL' }), details: [detail()] };
    },
    async recordCount() { recorded = true; },
  });
  await assert.rejects(
    service.recordCount(warehouse, 'KK001', 'LO001', { actualQuantity: 6, reason: 'Lech' }),
    (error) => error.code === 'STOCKTAKE_PENDING_APPROVAL' && error.statusCode === 409,
  );
  assert.equal(recorded, false);
});

test('proposal requires a discrepancy and reason, then writes an append-only workflow audit', async () => {
  const audits = [];
  const repository = {
    async getStocktake() {
      return { header: header(), details: [detail()] };
    },
    async writeWorkflowAudit(input) { audits.push(input); },
  };
  const service = serviceWith(repository);
  const result = await service.proposeStocktake(
    warehouse,
    'KK001',
    { comment: 'Da kiem dem hai lan' },
    '127.0.0.1',
  );
  assert.equal(result.workflow.state, 'PENDING_APPROVAL');
  assert.equal(audits[0].action, 'STOCKTAKE_PROPOSED');
  assert.equal(audits[0].actorAccountId, 41);
  assert.equal(audits[0].newData.workflowState, 'PENDING_APPROVAL');

  repository.getStocktake = async () => ({
    header: header(),
    details: [detail({ LyDo: null })],
  });
  await assert.rejects(
    service.proposeStocktake(warehouse, 'KK001', {}),
    (error) => error.code === 'STOCKTAKE_REASON_REQUIRED',
  );
});

test('manager approval requires a proposal, calls C39 and writes audit in one transaction', async () => {
  const calls = [];
  const service = serviceWith({
    async getStocktake() {
      calls.push('lock');
      return {
        header: header({ TrangThaiQuyTrinh: 'PENDING_APPROVAL' }),
        details: [detail()],
      };
    },
    async approveStocktake() {
      calls.push('approve');
      return {
        header: { MaKK: 'KK001', MaNV: 'NVK001', NgayKiemKe: new Date(), TrangThai: 'APPROVED' },
        details: [detail({ SoLuongTonHienTai: 7 })],
      };
    },
    async writeWorkflowAudit(input) {
      calls.push(input.action);
    },
  });
  const result = await service.approveStocktake(manager, 'KK001', { comment: 'Dong y' });
  assert.deepEqual(calls, ['lock', 'approve', 'STOCKTAKE_APPROVED']);
  assert.equal(result.stocktake.schemaStatus, 'APPROVED');
  assert.equal(result.stocktake.workflow.state, 'APPROVED');
});

test('manager rejection records a recount request without changing the schema status', async () => {
  let audit;
  const service = serviceWith({
    async getStocktake() {
      return {
        header: header({ TrangThaiQuyTrinh: 'PENDING_APPROVAL' }),
        details: [detail()],
      };
    },
    async writeWorkflowAudit(input) { audit = input; },
  });
  const result = await service.rejectStocktake(manager, 'KK001', { comment: 'Kiem dem lai lo nay' });
  assert.equal(audit.action, 'STOCKTAKE_RECOUNT_REQUESTED');
  assert.equal(result.workflow.state, 'RECOUNT_REQUIRED');
  assert.equal(audit.newData.managerComment, 'Kiem dem lai lo nay');
});

test('RBAC is enforced again inside the service boundary', async () => {
  const service = serviceWith({});
  await assert.rejects(
    service.createStocktake(manager, {}),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
  await assert.rejects(
    service.approveStocktake(warehouse, 'KK001', {}),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
});
