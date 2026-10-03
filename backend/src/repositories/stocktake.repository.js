'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { BaseRepository } = require('./base.repository');

const WORKFLOW_ACTIONS_SQL = `
  'STOCKTAKE_PROPOSED',
  'STOCKTAKE_RECOUNT_REQUESTED',
  'STOCKTAKE_APPROVED'
`;

class StocktakeRepository extends BaseRepository {
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

  async listStocktakes(filters, transaction = null) {
    const result = await this.query({
      text: `
        WITH StocktakeRows AS (
          SELECT
            stocktake.MaKK,
            stocktake.NgayKiemKe,
            stocktake.MaNV,
            employee.HoTen AS TenNhanVien,
            stocktake.TrangThai,
            stocktake.GhiChu,
            summary.TongSoDong,
            summary.SoDongChenhLech,
            summary.TongChenhLechTuyetDoi,
            workflow.HanhDong AS HanhDongQuyTrinh,
            workflow.DuLieuMoi AS DuLieuQuyTrinh,
            workflow.ThoiGian AS ThoiGianQuyTrinh,
            CASE
              WHEN stocktake.TrangThai = 'APPROVED' THEN 'APPROVED'
              WHEN stocktake.TrangThai = 'CANCELLED' THEN 'CANCELLED'
              WHEN workflow.HanhDong = 'STOCKTAKE_PROPOSED' THEN 'PENDING_APPROVAL'
              WHEN workflow.HanhDong = 'STOCKTAKE_RECOUNT_REQUESTED' THEN 'RECOUNT_REQUIRED'
              ELSE 'DRAFT'
            END AS TrangThaiQuyTrinh
          FROM dbo.KIEM_KE AS stocktake
          JOIN dbo.NHAN_VIEN AS employee
            ON employee.MaNV = stocktake.MaNV
          CROSS APPLY (
            SELECT
              COUNT_BIG(*) AS TongSoDong,
              COALESCE(SUM(CASE WHEN detail.ChenhLech <> 0 THEN 1 ELSE 0 END), 0) AS SoDongChenhLech,
              COALESCE(SUM(ABS(CONVERT(BIGINT, detail.ChenhLech))), 0) AS TongChenhLechTuyetDoi
            FROM dbo.CHI_TIET_KIEM_KE AS detail
            WHERE detail.MaKK = stocktake.MaKK
          ) AS summary
          OUTER APPLY (
            SELECT TOP (1)
              audit_log.HanhDong,
              audit_log.DuLieuMoi,
              audit_log.ThoiGian
            FROM dbo.NHAT_KY_HE_THONG AS audit_log
            WHERE audit_log.TenBang = 'KIEM_KE'
              AND audit_log.MaBanGhi = stocktake.MaKK
              AND audit_log.HanhDong IN (${WORKFLOW_ACTIONS_SQL})
            ORDER BY audit_log.MaNhatKy DESC
          ) AS workflow
          WHERE (@EmployeeId IS NULL OR stocktake.MaNV = @EmployeeId)
            AND (@Status IS NULL OR stocktake.TrangThai = @Status)
            AND (
              @SearchPattern IS NULL
              OR stocktake.MaKK LIKE @SearchPattern ESCAPE '~'
              OR employee.HoTen LIKE @SearchPattern ESCAPE '~'
              OR stocktake.GhiChu LIKE @SearchPattern ESCAPE '~'
            )
        ), FilteredRows AS (
          SELECT *
          FROM StocktakeRows
          WHERE @WorkflowState IS NULL OR TrangThaiQuyTrinh = @WorkflowState
        )
        SELECT *, COUNT_BIG(*) OVER () AS TongSoBanGhi
        FROM FilteredRows
        ORDER BY NgayKiemKe DESC, MaKK DESC
        OFFSET (@Page - 1) * @PageSize ROWS
        FETCH NEXT @PageSize ROWS ONLY;
      `,
      parameters: {
        EmployeeId: { type: this.sql.VarChar(10), value: filters.employeeId },
        Page: { type: this.sql.Int, value: filters.page },
        PageSize: { type: this.sql.Int, value: filters.pageSize },
        SearchPattern: { type: this.sql.NVarChar(610), value: filters.searchPattern },
        Status: { type: this.sql.VarChar(20), value: filters.status },
        WorkflowState: { type: this.sql.VarChar(30), value: filters.workflowState },
      },
      transaction,
    });

    return {
      items: result.recordset,
      totalItems: Number(result.recordset[0]?.TongSoBanGhi ?? 0),
    };
  }

  async getStocktake(stocktakeId, { employeeId = null, lock = false, transaction = null } = {}) {
    const lockHint = lock ? 'WITH (UPDLOCK, HOLDLOCK)' : '';
    const result = await this.query({
      text: `
        SELECT
          stocktake.MaKK,
          stocktake.NgayKiemKe,
          stocktake.MaNV,
          employee.HoTen AS TenNhanVien,
          stocktake.TrangThai,
          stocktake.GhiChu,
          summary.TongSoDong,
          summary.SoDongChenhLech,
          summary.TongChenhLechTuyetDoi,
          workflow.HanhDong AS HanhDongQuyTrinh,
          workflow.DuLieuMoi AS DuLieuQuyTrinh,
          workflow.ThoiGian AS ThoiGianQuyTrinh,
          CASE
            WHEN stocktake.TrangThai = 'APPROVED' THEN 'APPROVED'
            WHEN stocktake.TrangThai = 'CANCELLED' THEN 'CANCELLED'
            WHEN workflow.HanhDong = 'STOCKTAKE_PROPOSED' THEN 'PENDING_APPROVAL'
            WHEN workflow.HanhDong = 'STOCKTAKE_RECOUNT_REQUESTED' THEN 'RECOUNT_REQUIRED'
            ELSE 'DRAFT'
          END AS TrangThaiQuyTrinh
        FROM dbo.KIEM_KE AS stocktake ${lockHint}
        JOIN dbo.NHAN_VIEN AS employee
          ON employee.MaNV = stocktake.MaNV
        CROSS APPLY (
          SELECT
            COUNT_BIG(*) AS TongSoDong,
            COALESCE(SUM(CASE WHEN detail.ChenhLech <> 0 THEN 1 ELSE 0 END), 0) AS SoDongChenhLech,
            COALESCE(SUM(ABS(CONVERT(BIGINT, detail.ChenhLech))), 0) AS TongChenhLechTuyetDoi
          FROM dbo.CHI_TIET_KIEM_KE AS detail
          WHERE detail.MaKK = stocktake.MaKK
        ) AS summary
        OUTER APPLY (
          SELECT TOP (1)
            audit_log.HanhDong,
            audit_log.DuLieuMoi,
            audit_log.ThoiGian
          FROM dbo.NHAT_KY_HE_THONG AS audit_log
          WHERE audit_log.TenBang = 'KIEM_KE'
            AND audit_log.MaBanGhi = stocktake.MaKK
            AND audit_log.HanhDong IN (${WORKFLOW_ACTIONS_SQL})
          ORDER BY audit_log.MaNhatKy DESC
        ) AS workflow
        WHERE stocktake.MaKK = @StocktakeId
          AND (@EmployeeId IS NULL OR stocktake.MaNV = @EmployeeId);

        SELECT *
        FROM dbo.vw_KIEM_KE_CHI_TIET
        WHERE MaKK = @StocktakeId
          AND (@EmployeeId IS NULL OR MaNV = @EmployeeId)
        ORDER BY MaSP, MaLo;
      `,
      parameters: {
        EmployeeId: { type: this.sql.VarChar(10), value: employeeId },
        StocktakeId: { type: this.sql.VarChar(15), value: stocktakeId },
      },
      transaction,
    });
    return {
      header: result.recordsets?.[0]?.[0] ?? null,
      details: result.recordsets?.[1] ?? [],
    };
  }

  async createStocktake(input, transaction = null) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_KIEM_KE_Tao
          @MaKK = @StocktakeId,
          @MaNV = @EmployeeId,
          @NgayKiemKe = NULL,
          @GhiChu = @Note
      `,
      parameters: {
        EmployeeId: { type: this.sql.VarChar(10), value: input.employeeId },
        Note: { type: this.sql.NVarChar(255), value: input.note },
        StocktakeId: { type: this.sql.VarChar(15), value: input.stocktakeId },
      },
      transaction,
    });
    return {
      header: result.recordsets?.[0]?.[0] ?? null,
      details: result.recordsets?.[1] ?? [],
    };
  }

  async recordCount(input, transaction) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_CHI_TIET_KIEM_KE_GhiNhan
          @MaKK = @StocktakeId,
          @MaLo = @LotId,
          @SoLuongThucTe = @ActualQuantity,
          @LyDo = @Reason
      `,
      parameters: {
        ActualQuantity: { type: this.sql.Int, value: input.actualQuantity },
        LotId: { type: this.sql.VarChar(20), value: input.lotId },
        Reason: { type: this.sql.NVarChar(255), value: input.reason },
        StocktakeId: { type: this.sql.VarChar(15), value: input.stocktakeId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async approveStocktake(input, transaction) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_KIEM_KE_PheDuyetDieuChinh
          @MaKK = @StocktakeId,
          @MaNV = @EmployeeId
      `,
      parameters: {
        EmployeeId: { type: this.sql.VarChar(10), value: input.employeeId },
        StocktakeId: { type: this.sql.VarChar(15), value: input.stocktakeId },
      },
      transaction,
    });
    return {
      header: result.recordsets?.[0]?.[0] ?? null,
      details: result.recordsets?.[1] ?? [],
    };
  }

  async writeWorkflowAudit({ action, actorAccountId, ipAddress, newData, oldData, stocktakeId }, transaction) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_NHAT_KY_HE_THONG_Ghi
          @MaTK = @ActorAccountId,
          @HanhDong = @Action,
          @TenBang = 'KIEM_KE',
          @MaBanGhi = @StocktakeId,
          @DuLieuCu = @OldData,
          @DuLieuMoi = @NewData,
          @DiaChiIP = @IpAddress
      `,
      parameters: {
        Action: { type: this.sql.VarChar(50), value: action },
        ActorAccountId: { type: this.sql.Int, value: actorAccountId },
        IpAddress: { type: this.sql.VarChar(45), value: ipAddress },
        NewData: { type: this.sql.NVarChar(this.sql.MAX), value: newData },
        OldData: { type: this.sql.NVarChar(this.sql.MAX), value: oldData },
        StocktakeId: { type: this.sql.VarChar(100), value: stocktakeId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }
}

module.exports = {
  StocktakeRepository,
};
