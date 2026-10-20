'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { BaseRepository } = require('./base.repository');

class ReportingRepository extends BaseRepository {
  constructor(options = {}) {
    super(options);
    this.sqlDriver = options.sqlDriver || null;
  }

  get sql() {
    if (!this.sqlDriver) {
      this.sqlDriver = getSqlDriver(getDatabaseSettings().driver);
    }
    return this.sqlDriver;
  }

  dateParameters(filters) {
    return {
      From: { type: this.sql.Date, value: filters.from },
      To: { type: this.sql.Date, value: filters.to },
    };
  }

  pagingParameters(filters) {
    return {
      Offset: { type: this.sql.Int, value: filters.offset },
      PageSize: { type: this.sql.Int, value: filters.pageSize },
    };
  }

  async getRevenue(filters) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_BAO_CAO_DoanhThuTongQuan @TuNgay = @From, @DenNgay = @To;
        EXEC dbo.usp_BAO_CAO_XuHuongDoanhThu @TuNgay = @From, @DenNgay = @To;
      `,
      parameters: this.dateParameters(filters),
    });
    return {
      summary: result.recordsets?.[0]?.[0] ?? null,
      trend: result.recordsets?.[1] ?? [],
    };
  }

  async getProducts(filters) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_BAO_CAO_DoanhThuTheoNganhHang @TuNgay = @From, @DenNgay = @To;
        EXEC dbo.usp_BAO_CAO_XepHangSanPham
          @TuNgay = @From, @DenNgay = @To, @Kieu = 'BEST', @SoLuong = @Limit;
        EXEC dbo.usp_BAO_CAO_XepHangSanPham
          @TuNgay = @From, @DenNgay = @To, @Kieu = 'SLOW', @SoLuong = @Limit;
      `,
      parameters: {
        ...this.dateParameters(filters),
        Limit: { type: this.sql.Int, value: filters.limit },
      },
    });
    return {
      categories: result.recordsets?.[0] ?? [],
      bestProducts: result.recordsets?.[1] ?? [],
      slowProducts: result.recordsets?.[2] ?? [],
    };
  }

  async getInventory(filters) {
    const result = await this.query({
      text: `
        SELECT
          COUNT_BIG(*) AS TongSoSanPham,
          COALESCE(SUM(TongTon), 0) AS TongTon,
          COALESCE(SUM(TonCoTheBan), 0) AS TongTonCoTheBan,
          COALESCE(SUM(TonBiKhoa), 0) AS TongTonBiKhoa,
          COALESCE(SUM(TonHetHan), 0) AS TongTonHetHan,
          COALESCE(SUM(GiaTriTonTheoGiaNhap), 0) AS TongGiaTriTonTheoGiaNhap,
          COALESCE(SUM(SoLoConTon), 0) AS TongSoLoConTon
        FROM dbo.vw_BAO_CAO_TON_KHO_HIEN_TAI;

        SELECT
          MaSP, TenSP, DonViTinh, MaLoai, TenLoai, MucTonToiThieu,
          TrangThaiSanPham, TongTon, TonCoTheBan, TonBiKhoa, TonHetHan,
          GiaTriTonTheoGiaNhap, SoLoConTon
        FROM dbo.vw_BAO_CAO_TON_KHO_HIEN_TAI
        ORDER BY GiaTriTonTheoGiaNhap DESC, MaSP
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
      `,
      parameters: this.pagingParameters(filters),
    });
    return {
      summary: result.recordsets?.[0]?.[0] ?? null,
      items: result.recordsets?.[1] ?? [],
    };
  }

  async getReceiving(filters) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_BAO_CAO_NhapHangTongQuan @TuNgay = @From, @DenNgay = @To;

        CREATE TABLE #SupplierReceiving (
          MaNCC VARCHAR(10) NOT NULL,
          TenNCC NVARCHAR(150) NOT NULL,
          SoPhieuNhap BIGINT NOT NULL,
          TongSoLuongNhap BIGINT NOT NULL,
          TongChiPhiNhap DECIMAL(38,2) NOT NULL
        );
        INSERT INTO #SupplierReceiving
        EXEC dbo.usp_BAO_CAO_NhapHangTheoNhaCungCap @TuNgay = @From, @DenNgay = @To;

        SELECT COUNT_BIG(*) AS TongSoBanGhi FROM #SupplierReceiving;
        SELECT MaNCC, TenNCC, SoPhieuNhap, TongSoLuongNhap, TongChiPhiNhap
        FROM #SupplierReceiving
        ORDER BY TongChiPhiNhap DESC, MaNCC
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
      `,
      parameters: {
        ...this.dateParameters(filters),
        ...this.pagingParameters(filters),
      },
    });
    return {
      summary: result.recordsets?.[0]?.[0] ?? null,
      totalItems: Number(result.recordsets?.[1]?.[0]?.TongSoBanGhi ?? 0),
      items: result.recordsets?.[2] ?? [],
    };
  }

  async getEmployees(filters) {
    const result = await this.query({
      text: `
        CREATE TABLE #EmployeeRevenue (
          MaNV VARCHAR(10) NOT NULL,
          TenNhanVien NVARCHAR(100) NOT NULL,
          SoCaDaMo BIGINT NOT NULL,
          SoHoaDonHoanTat BIGINT NOT NULL,
          DoanhThuGop DECIMAL(38,2) NOT NULL,
          TienHoanTra DECIMAL(38,2) NOT NULL,
          DoanhThuThuan DECIMAL(38,2) NOT NULL
        );
        INSERT INTO #EmployeeRevenue
        EXEC dbo.usp_BAO_CAO_DoanhThuNhanVien @TuNgay = @From, @DenNgay = @To;

        SELECT COUNT_BIG(*) AS TongSoBanGhi FROM #EmployeeRevenue;
        SELECT MaNV, TenNhanVien, SoCaDaMo, SoHoaDonHoanTat,
               DoanhThuGop, TienHoanTra, DoanhThuThuan
        FROM #EmployeeRevenue
        ORDER BY DoanhThuThuan DESC, MaNV
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
      `,
      parameters: {
        ...this.dateParameters(filters),
        ...this.pagingParameters(filters),
      },
    });
    return {
      totalItems: Number(result.recordsets?.[0]?.[0]?.TongSoBanGhi ?? 0),
      items: result.recordsets?.[1] ?? [],
    };
  }

  async getShifts(filters) {
    const result = await this.query({
      text: `
        CREATE TABLE #ShiftRevenue (
          MaCa BIGINT NOT NULL,
          MaNV VARCHAR(10) NOT NULL,
          TenNhanVien NVARCHAR(100) NOT NULL,
          GioBatDau DATETIME2(0) NOT NULL,
          GioKetThuc DATETIME2(0) NULL,
          TienDauCa DECIMAL(38,2) NOT NULL,
          TienCuoiCa DECIMAL(38,2) NULL,
          TrangThai VARCHAR(20) NOT NULL,
          SoHoaDonHoanTat BIGINT NOT NULL,
          DoanhThuGop DECIMAL(38,2) NOT NULL,
          TienHoanTra DECIMAL(38,2) NOT NULL,
          DoanhThuThuan DECIMAL(38,2) NOT NULL,
          DoanhThuTienMatGhiNhan DECIMAL(38,2) NOT NULL,
          ChenhLechTienMat DECIMAL(38,2) NULL
        );
        INSERT INTO #ShiftRevenue
        EXEC dbo.usp_BAO_CAO_CaLamViec @TuNgay = @From, @DenNgay = @To;

        SELECT COUNT_BIG(*) AS TongSoBanGhi FROM #ShiftRevenue;
        SELECT MaCa, MaNV, TenNhanVien, GioBatDau, GioKetThuc,
               TienDauCa, TienCuoiCa, TrangThai, SoHoaDonHoanTat,
               DoanhThuGop, TienHoanTra, DoanhThuThuan,
               DoanhThuTienMatGhiNhan, ChenhLechTienMat
        FROM #ShiftRevenue
        ORDER BY GioBatDau DESC, MaCa DESC
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
      `,
      parameters: {
        ...this.dateParameters(filters),
        ...this.pagingParameters(filters),
      },
    });
    return {
      totalItems: Number(result.recordsets?.[0]?.[0]?.TongSoBanGhi ?? 0),
      items: result.recordsets?.[1] ?? [],
    };
  }
}

module.exports = {
  ReportingRepository,
};
