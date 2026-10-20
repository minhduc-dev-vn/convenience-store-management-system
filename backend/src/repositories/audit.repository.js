'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { BaseRepository } = require('./base.repository');

class AuditRepository extends BaseRepository {
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

  async write(entry, transaction = null) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_NHAT_KY_HE_THONG_Ghi
          @MaTK = @ActorAccountId,
          @HanhDong = @Action,
          @TenBang = @TableName,
          @MaBanGhi = @RecordId,
          @DuLieuCu = @OldData,
          @DuLieuMoi = @NewData,
          @DiaChiIP = @IpAddress
      `,
      parameters: {
        Action: { type: this.sql.VarChar(50), value: entry.action },
        ActorAccountId: { type: this.sql.Int, value: entry.actorAccountId },
        IpAddress: { type: this.sql.VarChar(45), value: entry.ipAddress },
        NewData: { type: this.sql.NVarChar(this.sql.MAX), value: entry.newData },
        OldData: { type: this.sql.NVarChar(this.sql.MAX), value: entry.oldData },
        RecordId: { type: this.sql.VarChar(100), value: entry.recordId },
        TableName: { type: this.sql.VarChar(128), value: entry.tableName },
      },
      transaction,
    });
    return result.recordset?.[0] ?? null;
  }

  async list(filters) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_NHAT_KY_HE_THONG_TraCuu
          @TuNgay = @From,
          @DenNgay = @To,
          @TenDangNhap = @Username,
          @HanhDong = @Action,
          @TenBang = @TableName,
          @MaBanGhi = @RecordId,
          @SoTrang = @Page,
          @KichThuocTrang = @PageSize
      `,
      parameters: {
        Action: { type: this.sql.VarChar(50), value: filters.action },
        From: { type: this.sql.Date, value: filters.from },
        Page: { type: this.sql.Int, value: filters.page },
        PageSize: { type: this.sql.Int, value: filters.pageSize },
        RecordId: { type: this.sql.VarChar(100), value: filters.recordId },
        TableName: { type: this.sql.VarChar(128), value: filters.tableName },
        To: { type: this.sql.Date, value: filters.to },
        Username: { type: this.sql.VarChar(50), value: filters.username },
      },
    });
    return {
      items: result.recordset ?? [],
      totalItems: Number(result.recordset?.[0]?.TongSoBanGhi ?? 0),
    };
  }

  async findById(auditLogId) {
    const result = await this.query({
      text: `
        SELECT
          MaNhatKy, MaTK, TenDangNhap, MaVaiTro, TenVaiTro,
          LoaiChuSoHuu, MaChuSoHuu, TenChuSoHuu,
          HanhDong, TenBang, MaBanGhi, DuLieuCu, DuLieuMoi,
          DuLieuCuLaJson, DuLieuMoiLaJson, ThoiGian, DiaChiIP
        FROM dbo.vw_NHAT_KY_HE_THONG_CHI_TIET
        WHERE MaNhatKy = @AuditLogId
      `,
      parameters: {
        AuditLogId: { type: this.sql.BigInt, value: auditLogId },
      },
    });
    return result.recordset?.[0] ?? null;
  }
}

module.exports = {
  AuditRepository,
};
