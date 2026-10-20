'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { BaseRepository } = require('./base.repository');

class SupplierRepository extends BaseRepository {
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

  async listSuppliers({ page, pageSize, search, status }, transaction = null) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_NHA_CUNG_CAP_TraCuu
          @TuKhoa = @Search,
          @TrangThai = @Status,
          @SoTrang = @Page,
          @KichThuocTrang = @PageSize
      `,
      parameters: {
        Page: { type: this.sql.Int, value: page },
        PageSize: { type: this.sql.Int, value: pageSize },
        Search: { type: this.sql.NVarChar(150), value: search },
        Status: { type: this.sql.VarChar(20), value: status },
      },
      transaction,
    });
    return {
      items: result.recordset,
      totalItems: Number(result.recordset[0]?.TongSoBanGhi ?? 0),
    };
  }

  async findSupplierById(supplierId, transaction = null) {
    const result = await this.query({
      text: `
        SELECT MaNCC, TenNCC, SDT, Email, DiaChi, MaSoThue, TrangThai
        FROM dbo.NHA_CUNG_CAP
        WHERE MaNCC = @SupplierId
      `,
      parameters: {
        SupplierId: { type: this.sql.VarChar(10), value: supplierId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findSupplierForUpdate(supplierId, transaction) {
    const result = await this.query({
      text: `
        SELECT MaNCC, TenNCC, SDT, Email, DiaChi, MaSoThue, TrangThai
        FROM dbo.NHA_CUNG_CAP WITH (UPDLOCK, HOLDLOCK)
        WHERE MaNCC = @SupplierId
      `,
      parameters: {
        SupplierId: { type: this.sql.VarChar(10), value: supplierId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findPhoneConflict(phone, supplierId = null, transaction = null) {
    const result = await this.query({
      text: `
        SELECT MaNCC
        FROM dbo.NHA_CUNG_CAP WITH (UPDLOCK, HOLDLOCK)
        WHERE SDT = @Phone
          AND (@SupplierId IS NULL OR MaNCC <> @SupplierId)
      `,
      parameters: {
        Phone: { type: this.sql.VarChar(15), value: phone },
        SupplierId: { type: this.sql.VarChar(10), value: supplierId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findTaxCodeConflict(taxCode, supplierId = null, transaction = null) {
    if (taxCode === null) return null;
    const result = await this.query({
      text: `
        SELECT MaNCC
        FROM dbo.NHA_CUNG_CAP WITH (UPDLOCK, HOLDLOCK)
        WHERE MaSoThue = @TaxCode
          AND (@SupplierId IS NULL OR MaNCC <> @SupplierId)
      `,
      parameters: {
        SupplierId: { type: this.sql.VarChar(10), value: supplierId },
        TaxCode: { type: this.sql.VarChar(20), value: taxCode },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async createSupplier(supplier, transaction) {
    await this.query({
      text: `
        INSERT INTO dbo.NHA_CUNG_CAP (
          MaNCC, TenNCC, SDT, Email, DiaChi, MaSoThue, TrangThai
        ) VALUES (
          @SupplierId, @Name, @Phone, @Email, @Address, @TaxCode, @Status
        )
      `,
      parameters: {
        Address: { type: this.sql.NVarChar(255), value: supplier.address },
        Email: { type: this.sql.VarChar(100), value: supplier.email },
        Name: { type: this.sql.NVarChar(150), value: supplier.name },
        Phone: { type: this.sql.VarChar(15), value: supplier.phone },
        Status: { type: this.sql.VarChar(20), value: supplier.status },
        SupplierId: { type: this.sql.VarChar(10), value: supplier.supplierId },
        TaxCode: { type: this.sql.VarChar(20), value: supplier.taxCode },
      },
      transaction,
    });
  }

  async updateSupplier(supplierId, changes, transaction) {
    await this.query({
      text: `
        UPDATE dbo.NHA_CUNG_CAP
        SET TenNCC = CASE WHEN @SetName = 1 THEN @Name ELSE TenNCC END,
            SDT = CASE WHEN @SetPhone = 1 THEN @Phone ELSE SDT END,
            Email = CASE WHEN @SetEmail = 1 THEN @Email ELSE Email END,
            DiaChi = CASE WHEN @SetAddress = 1 THEN @Address ELSE DiaChi END,
            MaSoThue = CASE WHEN @SetTaxCode = 1 THEN @TaxCode ELSE MaSoThue END
        WHERE MaNCC = @SupplierId
      `,
      parameters: {
        Address: { type: this.sql.NVarChar(255), value: changes.address ?? null },
        Email: { type: this.sql.VarChar(100), value: changes.email ?? null },
        Name: { type: this.sql.NVarChar(150), value: changes.name ?? null },
        Phone: { type: this.sql.VarChar(15), value: changes.phone ?? null },
        SetAddress: { type: this.sql.Bit, value: Object.hasOwn(changes, 'address') },
        SetEmail: { type: this.sql.Bit, value: Object.hasOwn(changes, 'email') },
        SetName: { type: this.sql.Bit, value: Object.hasOwn(changes, 'name') },
        SetPhone: { type: this.sql.Bit, value: Object.hasOwn(changes, 'phone') },
        SetTaxCode: { type: this.sql.Bit, value: Object.hasOwn(changes, 'taxCode') },
        SupplierId: { type: this.sql.VarChar(10), value: supplierId },
        TaxCode: { type: this.sql.VarChar(20), value: changes.taxCode ?? null },
      },
      transaction,
    });
  }

  async updateSupplierStatus(supplierId, status, transaction) {
    await this.query({
      text: `
        UPDATE dbo.NHA_CUNG_CAP
        SET TrangThai = @Status
        WHERE MaNCC = @SupplierId
      `,
      parameters: {
        Status: { type: this.sql.VarChar(20), value: status },
        SupplierId: { type: this.sql.VarChar(10), value: supplierId },
      },
      transaction,
    });
  }
}

module.exports = {
  SupplierRepository,
};
