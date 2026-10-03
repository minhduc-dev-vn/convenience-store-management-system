'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { BaseRepository } = require('./base.repository');

class ReturnRepository extends BaseRepository {
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

  async completeReturn(returnRequest, transaction) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_PHIEU_TRA_HoanTat
          @MaPT = @ReturnId,
          @MaHD = @InvoiceId,
          @MaNV = @EmployeeId,
          @LyDo = @Reason,
          @DanhSachHangTra = @ItemsJson
      `,
      parameters: {
        EmployeeId: { type: this.sql.VarChar(10), value: returnRequest.employeeId },
        InvoiceId: { type: this.sql.VarChar(15), value: returnRequest.invoiceId },
        ItemsJson: { type: this.sql.NVarChar(this.sql.MAX), value: returnRequest.itemsJson },
        Reason: { type: this.sql.NVarChar(255), value: returnRequest.reason },
        ReturnId: { type: this.sql.VarChar(15), value: returnRequest.returnId },
      },
      transaction,
    });

    return {
      header: result.recordsets?.[0]?.[0] ?? null,
      items: result.recordsets?.[1] ?? [],
    };
  }

  async writeReturnAudit({ actorAccountId, ipAddress, newData, returnId }, transaction) {
    await this.query({
      text: `
        EXEC dbo.usp_NHAT_KY_HE_THONG_Ghi
          @MaTK = @ActorAccountId,
          @HanhDong = 'RETURN_COMPLETED',
          @TenBang = 'PHIEU_TRA',
          @MaBanGhi = @ReturnId,
          @DuLieuCu = NULL,
          @DuLieuMoi = @NewData,
          @DiaChiIP = @IpAddress
      `,
      parameters: {
        ActorAccountId: { type: this.sql.Int, value: actorAccountId },
        IpAddress: { type: this.sql.VarChar(45), value: ipAddress },
        NewData: { type: this.sql.NVarChar(this.sql.MAX), value: newData },
        ReturnId: { type: this.sql.VarChar(100), value: returnId },
      },
      transaction,
    });
  }
}

module.exports = {
  ReturnRepository,
};
