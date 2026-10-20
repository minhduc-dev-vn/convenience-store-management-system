'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { BaseRepository } = require('./base.repository');

class ReceivingRepository extends BaseRepository {
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

  async listReceipts({ page, pageSize, searchPattern, status }, transaction = null) {
    const result = await this.query({
      text: `
        WITH ReceiptSummary AS (
          SELECT
            receipt.MaPN,
            receipt.NgayNhap,
            receipt.MaNV,
            employee.HoTen AS TenNhanVien,
            receipt.MaNCC,
            supplier.TenNCC,
            receipt.TongTien,
            receipt.TrangThai,
            receipt.NgayXacNhan,
            receipt.GhiChu,
            COUNT_BIG(detail.MaCTPN) AS SoDong
          FROM dbo.PHIEU_NHAP AS receipt
          JOIN dbo.NHAN_VIEN AS employee ON employee.MaNV = receipt.MaNV
          JOIN dbo.NHA_CUNG_CAP AS supplier ON supplier.MaNCC = receipt.MaNCC
          LEFT JOIN dbo.CHI_TIET_PHIEU_NHAP AS detail ON detail.MaPN = receipt.MaPN
          WHERE receipt.TrangThai = @Status
            AND (
              @SearchPattern IS NULL
              OR receipt.MaPN LIKE @SearchPattern ESCAPE N'~'
              OR supplier.TenNCC LIKE @SearchPattern ESCAPE N'~'
            )
          GROUP BY
            receipt.MaPN, receipt.NgayNhap, receipt.MaNV, employee.HoTen,
            receipt.MaNCC, supplier.TenNCC, receipt.TongTien,
            receipt.TrangThai, receipt.NgayXacNhan, receipt.GhiChu
        )
        SELECT *, COUNT_BIG(*) OVER () AS TongSoBanGhi
        FROM ReceiptSummary
        ORDER BY NgayNhap DESC, MaPN DESC
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `,
      parameters: {
        Offset: { type: this.sql.Int, value: (page - 1) * pageSize },
        PageSize: { type: this.sql.Int, value: pageSize },
        SearchPattern: { type: this.sql.NVarChar(154), value: searchPattern },
        Status: { type: this.sql.VarChar(20), value: status },
      },
      transaction,
    });
    return {
      items: result.recordset,
      totalItems: Number(result.recordset[0]?.TongSoBanGhi ?? 0),
    };
  }

  async findReceiptById(receiptId, transaction = null) {
    const result = await this.query({
      text: `
        SELECT
          receipt.MaPN,
          receipt.NgayNhap,
          receipt.MaNV,
          employee.HoTen AS TenNhanVien,
          receipt.MaNCC,
          supplier.TenNCC,
          receipt.TongTien,
          receipt.TrangThai,
          receipt.NgayXacNhan,
          receipt.GhiChu,
          COUNT_BIG(detail.MaCTPN) AS SoDong
        FROM dbo.PHIEU_NHAP AS receipt
        JOIN dbo.NHAN_VIEN AS employee ON employee.MaNV = receipt.MaNV
        JOIN dbo.NHA_CUNG_CAP AS supplier ON supplier.MaNCC = receipt.MaNCC
        LEFT JOIN dbo.CHI_TIET_PHIEU_NHAP AS detail ON detail.MaPN = receipt.MaPN
        WHERE receipt.MaPN = @ReceiptId
        GROUP BY
          receipt.MaPN, receipt.NgayNhap, receipt.MaNV, employee.HoTen,
          receipt.MaNCC, supplier.TenNCC, receipt.TongTien,
          receipt.TrangThai, receipt.NgayXacNhan, receipt.GhiChu
      `,
      parameters: {
        ReceiptId: { type: this.sql.VarChar(15), value: receiptId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findReceiptForUpdate(receiptId, transaction) {
    const result = await this.query({
      text: `
        SELECT MaPN, NgayNhap, MaNV, MaNCC, TongTien, TrangThai, NgayXacNhan, GhiChu
        FROM dbo.PHIEU_NHAP WITH (UPDLOCK, HOLDLOCK)
        WHERE MaPN = @ReceiptId
      `,
      parameters: {
        ReceiptId: { type: this.sql.VarChar(15), value: receiptId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async listReceiptLines(receiptId, transaction = null) {
    const result = await this.query({
      text: `
        SELECT
          detail.MaCTPN,
          detail.MaPN,
          detail.MaLo,
          lot.MaSP,
          product.TenSP,
          lot.SoLo,
          lot.NgaySanXuat,
          lot.HanSuDung,
          detail.SoLuong,
          detail.DonGiaNhap,
          detail.ThanhTien
        FROM dbo.CHI_TIET_PHIEU_NHAP AS detail
        JOIN dbo.LO_HANG AS lot ON lot.MaLo = detail.MaLo
        JOIN dbo.SAN_PHAM AS product ON product.MaSP = lot.MaSP
        WHERE detail.MaPN = @ReceiptId
        ORDER BY detail.MaCTPN
      `,
      parameters: {
        ReceiptId: { type: this.sql.VarChar(15), value: receiptId },
      },
      transaction,
    });
    return result.recordset;
  }

  async findLineForUpdate(receiptId, detailId, transaction) {
    const result = await this.query({
      text: `
        SELECT
          detail.MaCTPN,
          detail.MaPN,
          detail.MaLo,
          lot.MaSP,
          product.TenSP,
          lot.SoLo,
          lot.NgaySanXuat,
          lot.HanSuDung,
          lot.SoLuongTon,
          detail.SoLuong,
          detail.DonGiaNhap,
          detail.ThanhTien
        FROM dbo.CHI_TIET_PHIEU_NHAP AS detail WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.LO_HANG AS lot WITH (UPDLOCK, HOLDLOCK) ON lot.MaLo = detail.MaLo
        JOIN dbo.SAN_PHAM AS product ON product.MaSP = lot.MaSP
        WHERE detail.MaPN = @ReceiptId
          AND detail.MaCTPN = @DetailId
      `,
      parameters: {
        DetailId: { type: this.sql.BigInt, value: detailId },
        ReceiptId: { type: this.sql.VarChar(15), value: receiptId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findLineByLot(receiptId, lotId, transaction) {
    const result = await this.query({
      text: `
        SELECT MaCTPN
        FROM dbo.CHI_TIET_PHIEU_NHAP WITH (UPDLOCK, HOLDLOCK)
        WHERE MaPN = @ReceiptId
          AND MaLo = @LotId
      `,
      parameters: {
        LotId: { type: this.sql.VarChar(20), value: lotId },
        ReceiptId: { type: this.sql.VarChar(15), value: receiptId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findLotByProductAndNumber(productId, manufacturerLot, transaction) {
    const result = await this.query({
      text: `
        SELECT MaLo, MaSP, SoLo, NgaySanXuat, HanSuDung, GiaNhap, SoLuongTon, TrangThai
        FROM dbo.LO_HANG WITH (UPDLOCK, HOLDLOCK)
        WHERE MaSP = @ProductId
          AND SoLo = @ManufacturerLot
      `,
      parameters: {
        ManufacturerLot: { type: this.sql.VarChar(50), value: manufacturerLot },
        ProductId: { type: this.sql.VarChar(10), value: productId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findProductForReceiving(productId, transaction) {
    const result = await this.query({
      text: `
        SELECT MaSP
        FROM dbo.SAN_PHAM WITH (UPDLOCK, HOLDLOCK)
        WHERE MaSP = @ProductId
      `,
      parameters: {
        ProductId: { type: this.sql.VarChar(10), value: productId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findLotByIdForUpdate(lotId, transaction) {
    const result = await this.query({
      text: `
        SELECT MaLo
        FROM dbo.LO_HANG WITH (UPDLOCK, HOLDLOCK)
        WHERE MaLo = @LotId
      `,
      parameters: {
        LotId: { type: this.sql.VarChar(20), value: lotId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async updateDraftLotDefinition(lotId, detailId, lot, transaction) {
    const result = await this.query({
      text: `
        UPDATE existing_lot
        SET MaSP = @ProductId,
            SoLo = @ManufacturerLot,
            NgaySanXuat = @ManufactureDate,
            HanSuDung = @ExpiryDate
        FROM dbo.LO_HANG AS existing_lot
        WHERE existing_lot.MaLo = @LotId
          AND existing_lot.SoLuongTon = 0
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_PHIEU_NHAP AS other_detail
            WHERE other_detail.MaLo = existing_lot.MaLo
              AND other_detail.MaCTPN <> @DetailId
          )
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.CHI_TIET_PHIEU_NHAP AS confirmed_detail
            JOIN dbo.PHIEU_NHAP AS confirmed_receipt
              ON confirmed_receipt.MaPN = confirmed_detail.MaPN
            WHERE confirmed_detail.MaLo = existing_lot.MaLo
              AND confirmed_receipt.TrangThai = 'CONFIRMED'
          )
      `,
      parameters: {
        DetailId: { type: this.sql.BigInt, value: detailId },
        ExpiryDate: { type: this.sql.Date, value: lot.expiryDate },
        LotId: { type: this.sql.VarChar(20), value: lotId },
        ManufactureDate: { type: this.sql.Date, value: lot.manufactureDate },
        ManufacturerLot: { type: this.sql.VarChar(50), value: lot.manufacturerLot },
        ProductId: { type: this.sql.VarChar(10), value: lot.productId },
      },
      transaction,
    });
    return result.rowsAffected[0] === 1;
  }

  async saveDraft(draft, transaction) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_PHIEU_NHAP_LuuNhap
          @MaPN = @ReceiptId,
          @MaNV = @EmployeeId,
          @MaNCC = @SupplierId,
          @NgayNhap = @ReceivedAt,
          @GhiChu = @Note
      `,
      parameters: {
        EmployeeId: { type: this.sql.VarChar(10), value: draft.employeeId },
        Note: { type: this.sql.NVarChar(255), value: draft.note },
        ReceiptId: { type: this.sql.VarChar(15), value: draft.receiptId },
        ReceivedAt: { type: this.sql.DateTime2(0), value: draft.receivedAt },
        SupplierId: { type: this.sql.VarChar(10), value: draft.supplierId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async saveLine(receiptId, lotId, line, transaction) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_CHI_TIET_PHIEU_NHAP_LuuNhap
          @MaPN = @ReceiptId,
          @MaLo = @LotId,
          @MaSP = @ProductId,
          @SoLo = @ManufacturerLot,
          @NgaySanXuat = @ManufactureDate,
          @HanSuDung = @ExpiryDate,
          @SoLuong = @Quantity,
          @DonGiaNhap = @UnitCost
      `,
      parameters: {
        ExpiryDate: { type: this.sql.Date, value: line.expiryDate },
        LotId: { type: this.sql.VarChar(20), value: lotId },
        ManufactureDate: { type: this.sql.Date, value: line.manufactureDate },
        ManufacturerLot: { type: this.sql.VarChar(50), value: line.manufacturerLot },
        ProductId: { type: this.sql.VarChar(10), value: line.productId },
        Quantity: { type: this.sql.Int, value: line.quantity },
        ReceiptId: { type: this.sql.VarChar(15), value: receiptId },
        UnitCost: { type: this.sql.Decimal(18, 2), value: line.unitCost },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async deleteLine(receiptId, detailId, transaction) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_CHI_TIET_PHIEU_NHAP_Xoa
          @MaPN = @ReceiptId,
          @MaCTPN = @DetailId
      `,
      parameters: {
        DetailId: { type: this.sql.BigInt, value: detailId },
        ReceiptId: { type: this.sql.VarChar(15), value: receiptId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async cancelReceipt(receiptId, transaction) {
    const result = await this.query({
      text: 'EXEC dbo.usp_PHIEU_NHAP_Huy @MaPN = @ReceiptId',
      parameters: {
        ReceiptId: { type: this.sql.VarChar(15), value: receiptId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async confirmReceipt(receiptId, transaction) {
    const result = await this.query({
      text: 'EXEC dbo.usp_PHIEU_NHAP_XacNhan @MaPN = @ReceiptId',
      parameters: {
        ReceiptId: { type: this.sql.VarChar(15), value: receiptId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async listActiveSuppliers({ page, pageSize, search }, transaction = null) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_NHA_CUNG_CAP_TraCuu
          @TuKhoa = @Search,
          @TrangThai = 'ACTIVE',
          @SoTrang = @Page,
          @KichThuocTrang = @PageSize
      `,
      parameters: {
        Page: { type: this.sql.Int, value: page },
        PageSize: { type: this.sql.Int, value: pageSize },
        Search: { type: this.sql.NVarChar(150), value: search },
      },
      transaction,
    });
    return {
      items: result.recordset,
      totalItems: Number(result.recordset[0]?.TongSoBanGhi ?? 0),
    };
  }

  async listActiveProducts({ page, pageSize, search }, transaction = null) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_SAN_PHAM_TraCuu
          @TuKhoa = @Search,
          @MaLoai = NULL,
          @TrangThai = 'ACTIVE',
          @SoTrang = @Page,
          @KichThuocTrang = @PageSize
      `,
      parameters: {
        Page: { type: this.sql.Int, value: page },
        PageSize: { type: this.sql.Int, value: pageSize },
        Search: { type: this.sql.NVarChar(150), value: search },
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
  ReceivingRepository,
};
