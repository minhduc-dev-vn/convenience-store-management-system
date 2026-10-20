'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ReportingService,
  mapReportingError,
  normalizeDateRange,
  normalizePagination,
} = require('../src/services/reporting.service');

const manager = { accountId: 46, role: 'MANAGER' };

test('revenue and product reports preserve C45 totals and map presentation fields', async () => {
  const received = {};
  const service = new ReportingService({
    reportingRepository: {
      async getRevenue(filters) {
        received.revenue = filters;
        return {
          summary: {
            TuNgay: new Date('2026-09-01T00:00:00Z'),
            DenNgay: new Date('2026-09-02T00:00:00Z'),
            SoHoaDonHoanTat: 3,
            DoanhThuGop: 360,
            TienHoanTra: 90,
            DoanhThuThuan: 270,
          },
          trend: [{
            Ngay: new Date('2026-09-02T00:00:00Z'),
            SoHoaDonHoanTat: 1,
            DoanhThuGop: 100,
            TienHoanTra: 90,
            DoanhThuThuan: 10,
          }],
        };
      },
      async getProducts(filters) {
        received.products = filters;
        const product = {
          XepHang: 1,
          MaSP: 'C45P001',
          TenSP: 'Best product',
          MaLoai: 'C45CAT01',
          TenLoai: 'Category',
          DonViTinh: 'Unit',
          TrangThaiSanPham: 'ACTIVE',
          SoLuongBan: 3,
          SoLuongTra: 1,
          SoLuongBanThuan: 2,
          DoanhThuGop: 280,
          TienHoanTra: 90,
          DoanhThuThuan: 190,
          TongTon: 6,
        };
        return {
          categories: [{
            MaLoai: 'C45CAT01', TenLoai: 'Category', SoLuongBan: 4,
            SoLuongTra: 1, SoLuongBanThuan: 3, DoanhThuGop: 360,
            TienHoanTra: 90, DoanhThuThuan: 270, TyTrongDoanhThuThuan: 100,
          }],
          bestProducts: [product],
          slowProducts: [{ ...product, MaSP: 'C45P003', SoLuongBanThuan: 0 }],
        };
      },
    },
  });

  const revenue = await service.getRevenue(manager, { from: '2026-09-01', to: '2026-09-02' });
  const products = await service.getProducts(manager, {
    from: '2026-09-01', to: '2026-09-02', limit: '15',
  });

  assert.deepEqual(received.revenue, { from: '2026-09-01', to: '2026-09-02' });
  assert.deepEqual(received.products, {
    from: '2026-09-01', to: '2026-09-02', limit: 15,
  });
  assert.deepEqual(revenue.summary, {
    from: '2026-09-01', to: '2026-09-02', completedInvoiceCount: 3,
    grossRevenue: 360, refundAmount: 90, netRevenue: 270,
  });
  assert.equal(revenue.trend[0].netRevenue, 10);
  assert.equal(products.categories[0].netRevenueSharePercent, 100);
  assert.equal(products.bestProducts[0].netRevenue, 190);
  assert.equal(products.slowProducts[0].netSoldQuantity, 0);
  assert.equal(Object.hasOwn(revenue.summary, 'estimatedProfit'), false);
});

test('inventory and period lists expose pagination without recomputing report values', async () => {
  const calls = {};
  const service = new ReportingService({
    reportingRepository: {
      async getInventory(filters) {
        calls.inventory = filters;
        return {
          summary: {
            TongSoSanPham: 2, TongTon: 15, TongTonCoTheBan: 15,
            TongTonBiKhoa: 0, TongTonHetHan: 0,
            TongGiaTriTonTheoGiaNhap: 450, TongSoLoConTon: 2,
          },
          items: [{
            MaSP: 'P1', TenSP: 'Product', DonViTinh: 'Unit', MaLoai: 'CAT',
            TenLoai: 'Category', MucTonToiThieu: 2, TrangThaiSanPham: 'ACTIVE',
            TongTon: 5, TonCoTheBan: 5, TonBiKhoa: 0, TonHetHan: 0,
            GiaTriTonTheoGiaNhap: 250, SoLoConTon: 1,
          }],
        };
      },
      async getReceiving(filters) {
        calls.receiving = filters;
        return {
          summary: {
            TuNgay: '2026-09-01', DenNgay: '2026-09-02', SoPhieuNhap: 1,
            SoNhaCungCap: 1, TongSoLuongNhap: 10, TongChiPhiNhap: 200,
          },
          totalItems: 1,
          items: [{
            MaNCC: 'NCC1', TenNCC: 'Supplier', SoPhieuNhap: 1,
            TongSoLuongNhap: 10, TongChiPhiNhap: 200,
          }],
        };
      },
      async getEmployees(filters) {
        calls.employees = filters;
        return {
          totalItems: 1,
          items: [{
            MaNV: 'NV1', TenNhanVien: 'Cashier', SoCaDaMo: 1,
            SoHoaDonHoanTat: 1, DoanhThuGop: 200, TienHoanTra: 100,
            DoanhThuThuan: 100,
          }],
        };
      },
      async getShifts(filters) {
        calls.shifts = filters;
        return {
          totalItems: 1,
          items: [{
            MaCa: 9, MaNV: 'NV1', TenNhanVien: 'Cashier',
            GioBatDau: new Date('2026-09-01T08:00:00Z'),
            GioKetThuc: new Date('2026-09-01T16:00:00Z'),
            TienDauCa: 100, TienCuoiCa: 300, TrangThai: 'CLOSED',
            SoHoaDonHoanTat: 1, DoanhThuGop: 200, TienHoanTra: 100,
            DoanhThuThuan: 100, DoanhThuTienMatGhiNhan: 200,
            ChenhLechTienMat: 0,
          }],
        };
      },
    },
  });

  const inventory = await service.getInventory(manager, { page: '2', pageSize: '1' });
  const periodQuery = { from: '2026-09-01', to: '2026-09-02', page: '1', pageSize: '5' };
  const receiving = await service.getReceiving(manager, periodQuery);
  const employees = await service.getEmployees(manager, periodQuery);
  const shifts = await service.getShifts(manager, periodQuery);

  assert.deepEqual(calls.inventory, { offset: 1, page: 2, pageSize: 1 });
  assert.deepEqual(calls.receiving, {
    from: '2026-09-01', to: '2026-09-02', offset: 0, page: 1, pageSize: 5,
  });
  assert.equal(inventory.summary.inventoryCostValue, 450);
  assert.deepEqual(inventory.pagination, { page: 2, pageSize: 1, totalItems: 2, totalPages: 2 });
  assert.equal(receiving.summary.receivingCost, 200);
  assert.equal(receiving.suppliers.items[0].supplierId, 'NCC1');
  assert.equal(employees.items[0].netRevenue, 100);
  assert.equal(shifts.items[0].cashDifference, 0);
  assert.deepEqual(shifts.pagination, { page: 1, pageSize: 5, totalItems: 1, totalPages: 1 });
});

test('report service rejects unauthorized callers and invalid date/pagination input', async () => {
  const service = new ReportingService({
    reportingRepository: { async getRevenue() { return {}; } },
  });
  await assert.rejects(
    service.getRevenue({ role: 'CASHIER' }, { from: '2026-09-01', to: '2026-09-02' }),
    (error) => error.code === 'FORBIDDEN' && error.statusCode === 403,
  );
  for (const query of [
    {},
    { from: '2026-02-30', to: '2026-09-02' },
    { from: '2026-09-03', to: '2026-09-02' },
  ]) {
    assert.throws(() => normalizeDateRange(query), (error) => error.code === 'VALIDATION_ERROR');
  }
  assert.throws(
    () => normalizePagination({ page: '0' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.throws(
    () => normalizePagination({ pageSize: '101' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('C45 SQL validation errors map to the public validation contract', () => {
  for (const number of [51910, 51911, 51912]) {
    const error = mapReportingError({ number });
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(error.statusCode, 400);
  }
  const original = new Error('unexpected');
  assert.equal(mapReportingError(original), original);
});
