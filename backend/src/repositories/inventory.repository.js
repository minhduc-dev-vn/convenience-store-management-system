'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { BaseRepository } = require('./base.repository');

class InventoryRepository extends BaseRepository {
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

  async listProducts(filters, transaction = null) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_TON_KHO_SAN_PHAM_TraCuu
          @TuKhoa = @Search,
          @MaLoai = @CategoryId,
          @CheDo = @Mode,
          @NgayThamChieu = @ReferenceDate,
          @NguongCanHanNgay = @NearExpiryDays,
          @SoTrang = @Page,
          @KichThuocTrang = @PageSize
      `,
      parameters: {
        CategoryId: { type: this.sql.VarChar(10), value: filters.categoryId },
        Mode: { type: this.sql.VarChar(20), value: filters.mode },
        NearExpiryDays: { type: this.sql.Int, value: filters.nearExpiryDays },
        Page: { type: this.sql.Int, value: filters.page },
        PageSize: { type: this.sql.Int, value: filters.pageSize },
        ReferenceDate: { type: this.sql.Date, value: filters.referenceDate },
        Search: { type: this.sql.NVarChar(150), value: filters.search },
      },
      transaction,
    });
    return {
      items: result.recordset,
      totalItems: Number(result.recordset[0]?.TongSoBanGhi ?? 0),
    };
  }

  async listLots(filters, transaction = null) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_LO_HANG_TraCuu
          @MaSP = @ProductId,
          @TuKhoa = @Search,
          @MaLoai = @CategoryId,
          @TinhTrangHanDung = @ExpiryStatus,
          @TrangThaiLo = @LotStatus,
          @NgayThamChieu = @ReferenceDate,
          @NguongCanHanNgay = @NearExpiryDays,
          @SoTrang = @Page,
          @KichThuocTrang = @PageSize
      `,
      parameters: {
        CategoryId: { type: this.sql.VarChar(10), value: filters.categoryId },
        ExpiryStatus: { type: this.sql.VarChar(20), value: filters.expiryStatus },
        LotStatus: { type: this.sql.VarChar(20), value: filters.lotStatus },
        NearExpiryDays: { type: this.sql.Int, value: filters.nearExpiryDays },
        Page: { type: this.sql.Int, value: filters.page },
        PageSize: { type: this.sql.Int, value: filters.pageSize },
        ProductId: { type: this.sql.VarChar(10), value: filters.productId },
        ReferenceDate: { type: this.sql.Date, value: filters.referenceDate },
        Search: { type: this.sql.NVarChar(150), value: filters.search },
      },
      transaction,
    });
    return {
      items: result.recordset,
      totalItems: Number(result.recordset[0]?.TongSoBanGhi ?? 0),
    };
  }
}

module.exports = {
  InventoryRepository,
};
