'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { BaseRepository } = require('./base.repository');

class CustomerRepository extends BaseRepository {
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

  async findById(customerId, transaction = null) {
    const result = await this.query({
      text: `
        SELECT
          MaKH,
          HoTen,
          SDT,
          Email,
          DiaChi,
          NgaySinh,
          DiemTichLuy,
          HangThanhVien,
          NgayDangKy,
          TrangThai
        FROM dbo.KHACH_HANG
        WHERE MaKH = @CustomerId
      `,
      parameters: {
        CustomerId: { type: this.sql.VarChar(10), value: customerId },
      },
      transaction,
    });

    return result.recordset[0] ?? null;
  }

  async emailExistsForAnotherOwner(email, customerId, transaction) {
    if (!email) return false;

    const result = await this.query({
      text: `
        SELECT CAST(CASE WHEN EXISTS (
          SELECT 1 FROM dbo.TAI_KHOAN WITH (UPDLOCK, HOLDLOCK)
          WHERE TenDangNhap = @Email
            AND (MaKH IS NULL OR MaKH <> @CustomerId)
        ) OR EXISTS (
          SELECT 1 FROM dbo.KHACH_HANG WITH (UPDLOCK, HOLDLOCK)
          WHERE Email = @Email AND MaKH <> @CustomerId
        ) OR EXISTS (
          SELECT 1 FROM dbo.NHAN_VIEN WITH (UPDLOCK, HOLDLOCK)
          WHERE Email = @Email
        ) THEN 1 ELSE 0 END AS BIT) AS EmailExists
      `,
      parameters: {
        CustomerId: { type: this.sql.VarChar(10), value: customerId },
        Email: { type: this.sql.VarChar(100), value: email },
      },
      transaction,
    });

    return Boolean(result.recordset[0].EmailExists);
  }

  async updateProfile(customerId, changes, transaction) {
    const result = await this.query({
      text: `
        UPDATE dbo.KHACH_HANG
        SET
          HoTen = CASE WHEN @SetFullName = 1 THEN @FullName ELSE HoTen END,
          Email = CASE WHEN @SetEmail = 1 THEN @Email ELSE Email END,
          DiaChi = CASE WHEN @SetAddress = 1 THEN @Address ELSE DiaChi END
        WHERE MaKH = @CustomerId
          AND TrangThai = 'ACTIVE';

        SELECT
          MaKH,
          HoTen,
          SDT,
          Email,
          DiaChi,
          NgaySinh,
          DiemTichLuy,
          HangThanhVien,
          NgayDangKy,
          TrangThai
        FROM dbo.KHACH_HANG
        WHERE MaKH = @CustomerId;
      `,
      parameters: {
        Address: { type: this.sql.NVarChar(255), value: changes.address ?? null },
        CustomerId: { type: this.sql.VarChar(10), value: customerId },
        Email: { type: this.sql.VarChar(100), value: changes.email ?? null },
        FullName: { type: this.sql.NVarChar(100), value: changes.fullName ?? null },
        SetAddress: { type: this.sql.Bit, value: Object.hasOwn(changes, 'address') },
        SetEmail: { type: this.sql.Bit, value: Object.hasOwn(changes, 'email') },
        SetFullName: { type: this.sql.Bit, value: Object.hasOwn(changes, 'fullName') },
      },
      transaction,
    });

    return result.recordset[0] ?? null;
  }
}

module.exports = {
  CustomerRepository,
};
