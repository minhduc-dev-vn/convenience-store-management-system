'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { BaseRepository } = require('./base.repository');

const SELLABLE_PRODUCT_CTE = `
  WITH SellableProducts AS (
    SELECT
      product.MaSP,
      product.TenSP,
      product.MaVach,
      product.DonViTinh,
      product.GiaBan,
      product.MaLoai,
      category.TenLoai,
      SUM(CONVERT(BIGINT, lot.SoLuongTon)) AS TonKhaDung
    FROM dbo.SAN_PHAM AS product
    JOIN dbo.LOAI_SAN_PHAM AS category
      ON category.MaLoai = product.MaLoai
     AND category.TrangThai = 'ACTIVE'
    JOIN dbo.LO_HANG AS lot
      ON lot.MaSP = product.MaSP
     AND lot.TrangThai = 'ACTIVE'
     AND lot.SoLuongTon > 0
     AND (lot.HanSuDung IS NULL OR lot.HanSuDung > CONVERT(DATE, SYSDATETIME()))
    WHERE product.TrangThai = 'ACTIVE'
    GROUP BY
      product.MaSP, product.TenSP, product.MaVach, product.DonViTinh,
      product.GiaBan, product.MaLoai, category.TenLoai
  )
`;

class PosRepository extends BaseRepository {
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

  async findCurrentOpenShift(employeeId, transaction = null) {
    const result = await this.query({
      text: `
        SELECT TOP (1)
          work_shift.MaCa,
          work_shift.MaNV,
          employee.HoTen AS TenNhanVien,
          work_shift.GioBatDau,
          work_shift.TienDauCa,
          work_shift.TrangThai,
          work_shift.GhiChu
        FROM dbo.CA_LAM_VIEC AS work_shift
        JOIN dbo.NHAN_VIEN AS employee ON employee.MaNV = work_shift.MaNV
        WHERE work_shift.MaNV = @EmployeeId
          AND work_shift.TrangThai = 'OPEN'
        ORDER BY work_shift.GioBatDau DESC, work_shift.MaCa DESC
      `,
      parameters: {
        EmployeeId: { type: this.sql.VarChar(10), value: employeeId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async openShift({ employeeId, note, openingCash }, transaction = null) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_CA_LAM_VIEC_Mo
          @MaNV = @EmployeeId,
          @TienDauCa = @OpeningCash,
          @GhiChu = @Note
      `,
      parameters: {
        EmployeeId: { type: this.sql.VarChar(10), value: employeeId },
        Note: { type: this.sql.NVarChar(255), value: note },
        OpeningCash: { type: this.sql.Decimal(18, 2), value: openingCash },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async searchSellableProducts({ page, pageSize, search, searchPattern }, transaction = null) {
    const result = await this.query({
      text: `
        ${SELLABLE_PRODUCT_CTE}
        SELECT
          sellable.*,
          COUNT_BIG(*) OVER () AS TongSoBanGhi
        FROM SellableProducts AS sellable
        WHERE @Search IS NULL
           OR sellable.MaSP LIKE @SearchPattern ESCAPE N'~'
           OR sellable.TenSP LIKE @SearchPattern ESCAPE N'~'
           OR sellable.MaVach = @Search
        ORDER BY
          CASE
            WHEN sellable.MaSP = @Search THEN 0
            WHEN sellable.MaVach = @Search THEN 1
            ELSE 2
          END,
          sellable.TenSP,
          sellable.MaSP
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `,
      parameters: {
        Offset: { type: this.sql.Int, value: (page - 1) * pageSize },
        PageSize: { type: this.sql.Int, value: pageSize },
        Search: { type: this.sql.NVarChar(150), value: search },
        SearchPattern: { type: this.sql.NVarChar(304), value: searchPattern },
      },
      transaction,
    });
    return {
      items: result.recordset,
      totalItems: Number(result.recordset[0]?.TongSoBanGhi ?? 0),
    };
  }

  async findSellableProductByBarcode(barcode, transaction = null) {
    const result = await this.query({
      text: `
        ${SELLABLE_PRODUCT_CTE}
        SELECT TOP (1) *
        FROM SellableProducts
        WHERE MaVach = @Barcode
      `,
      parameters: {
        Barcode: { type: this.sql.VarChar(30), value: barcode },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }
}

module.exports = {
  PosRepository,
};
