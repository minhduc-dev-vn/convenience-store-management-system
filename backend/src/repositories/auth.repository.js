'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { BaseRepository } = require('./base.repository');

class AuthRepository extends BaseRepository {
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

  async findByUsername(username, transaction = null) {
    if (username.length > 50) return null;

    const result = await this.query({
      text: 'EXEC dbo.usp_TAI_KHOAN_LayTheoTenDangNhap @TenDangNhap = @Username',
      parameters: {
        Username: { type: this.sql.VarChar(50), value: username },
      },
      transaction,
    });

    return result.recordset[0] ?? null;
  }

  async findByContact(identifier, transaction = null) {
    const result = await this.query({
      text: `
        SELECT TOP (2)
          account.MaTK,
          account.TenDangNhap,
          account.MatKhauHash,
          account.MaVaiTro,
          role.TenVaiTro,
          account.TrangThai,
          CASE WHEN account.MaKH IS NOT NULL THEN 'CUSTOMER' ELSE 'EMPLOYEE' END AS LoaiChuSoHuu,
          COALESCE(account.MaKH, account.MaNV) AS MaChuSoHuu,
          COALESCE(customer.HoTen, employee.HoTen) AS TenChuSoHuu,
          COALESCE(customer.TrangThai, employee.TrangThai) AS TrangThaiChuSoHuu
        FROM dbo.TAI_KHOAN AS account
        JOIN dbo.VAI_TRO AS role ON role.MaVaiTro = account.MaVaiTro
        LEFT JOIN dbo.KHACH_HANG AS customer ON customer.MaKH = account.MaKH
        LEFT JOIN dbo.NHAN_VIEN AS employee ON employee.MaNV = account.MaNV
        WHERE customer.SDT = @Identifier
           OR customer.Email = @Identifier
           OR employee.SDT = @Identifier
           OR employee.Email = @Identifier
        ORDER BY account.MaTK
      `,
      parameters: {
        Identifier: { type: this.sql.VarChar(100), value: identifier },
      },
      transaction,
    });

    return result.recordset.length === 1 ? result.recordset[0] : null;
  }

  async findForAuthentication(identifier, transaction = null) {
    return (await this.findByUsername(identifier, transaction))
      ?? this.findByContact(identifier, transaction);
  }

  async findIdentityById(accountId, transaction = null) {
    const result = await this.query({
      text: `
        SELECT
          MaTK,
          TenDangNhap,
          MaVaiTro,
          TenVaiTro,
          TrangThai,
          LoaiChuSoHuu,
          MaChuSoHuu,
          TenChuSoHuu,
          TrangThaiChuSoHuu
        FROM dbo.vw_TAI_KHOAN_VAI_TRO
        WHERE MaTK = @AccountId
      `,
      parameters: {
        AccountId: { type: this.sql.Int, value: accountId },
      },
      transaction,
    });

    return result.recordset[0] ?? null;
  }

  async findSecretById(accountId, transaction = null, { lock = false } = {}) {
    const lockHint = lock ? 'WITH (UPDLOCK, HOLDLOCK)' : '';
    const result = await this.query({
      text: `
        SELECT
          account.MaTK,
          account.MatKhauHash,
          account.MaVaiTro,
          account.MaNV,
          account.MaKH,
          account.TrangThai,
          COALESCE(customer.TrangThai, employee.TrangThai) AS TrangThaiChuSoHuu
        FROM dbo.TAI_KHOAN AS account ${lockHint}
        LEFT JOIN dbo.KHACH_HANG AS customer ON customer.MaKH = account.MaKH
        LEFT JOIN dbo.NHAN_VIEN AS employee ON employee.MaNV = account.MaNV
        WHERE account.MaTK = @AccountId
      `,
      parameters: {
        AccountId: { type: this.sql.Int, value: accountId },
      },
      transaction,
    });

    return result.recordset[0] ?? null;
  }

  async findRegistrationConflict({ email, phone }, transaction) {
    const result = await this.query({
      text: `
        SELECT
          CAST(CASE WHEN EXISTS (
            SELECT 1 FROM dbo.TAI_KHOAN WITH (UPDLOCK, HOLDLOCK)
            WHERE TenDangNhap = @Phone
          ) OR EXISTS (
            SELECT 1 FROM dbo.KHACH_HANG WITH (UPDLOCK, HOLDLOCK)
            WHERE SDT = @Phone
          ) OR EXISTS (
            SELECT 1 FROM dbo.NHAN_VIEN WITH (UPDLOCK, HOLDLOCK)
            WHERE SDT = @Phone
          ) THEN 1 ELSE 0 END AS BIT) AS PhoneExists,
          CAST(CASE WHEN @Email IS NOT NULL AND (
            EXISTS (
              SELECT 1 FROM dbo.TAI_KHOAN WITH (UPDLOCK, HOLDLOCK)
              WHERE TenDangNhap = @Email
            ) OR EXISTS (
              SELECT 1 FROM dbo.KHACH_HANG WITH (UPDLOCK, HOLDLOCK)
              WHERE Email = @Email
            ) OR EXISTS (
              SELECT 1 FROM dbo.NHAN_VIEN WITH (UPDLOCK, HOLDLOCK)
              WHERE Email = @Email
            )
          ) THEN 1 ELSE 0 END AS BIT) AS EmailExists
      `,
      parameters: {
        Email: { type: this.sql.VarChar(100), value: email },
        Phone: { type: this.sql.VarChar(15), value: phone },
      },
      transaction,
    });

    return {
      emailExists: Boolean(result.recordset[0].EmailExists),
      phoneExists: Boolean(result.recordset[0].PhoneExists),
    };
  }

  async createCustomer(customer, transaction) {
    const result = await this.query({
      text: `
        INSERT INTO dbo.KHACH_HANG (MaKH, HoTen, SDT, Email, NgaySinh)
        OUTPUT
          inserted.MaKH,
          inserted.HoTen,
          inserted.SDT,
          inserted.Email,
          inserted.NgaySinh,
          inserted.DiemTichLuy,
          inserted.HangThanhVien,
          inserted.NgayDangKy,
          inserted.TrangThai
        VALUES (@CustomerId, @FullName, @Phone, @Email, @DateOfBirth)
      `,
      parameters: {
        CustomerId: { type: this.sql.VarChar(10), value: customer.customerId },
        DateOfBirth: { type: this.sql.Date, value: customer.dateOfBirth },
        Email: { type: this.sql.VarChar(100), value: customer.email },
        FullName: { type: this.sql.NVarChar(100), value: customer.fullName },
        Phone: { type: this.sql.VarChar(15), value: customer.phone },
      },
      transaction,
    });

    return result.recordset[0];
  }

  async createCustomerAccount({ customerId, passwordHash, username }, transaction) {
    const result = await this.query({
      text: `
        INSERT INTO dbo.TAI_KHOAN (TenDangNhap, MatKhauHash, MaVaiTro, MaKH)
        OUTPUT
          inserted.MaTK,
          inserted.TenDangNhap,
          inserted.MaVaiTro,
          inserted.TrangThai,
          inserted.NgayTao
        VALUES (@Username, @PasswordHash, 'CUSTOMER', @CustomerId)
      `,
      parameters: {
        CustomerId: { type: this.sql.VarChar(10), value: customerId },
        PasswordHash: { type: this.sql.VarChar(255), value: passwordHash },
        Username: { type: this.sql.VarChar(50), value: username },
      },
      transaction,
    });

    return result.recordset[0];
  }

  async updateLastLogin(accountId, transaction = null) {
    await this.query({
      text: `
        UPDATE dbo.TAI_KHOAN
        SET LanDangNhapCuoi = SYSDATETIME()
        WHERE MaTK = @AccountId
      `,
      parameters: {
        AccountId: { type: this.sql.Int, value: accountId },
      },
      transaction,
    });
  }

  async updatePassword(accountId, passwordHash, transaction) {
    await this.query({
      text: `
        UPDATE dbo.TAI_KHOAN
        SET MatKhauHash = @PasswordHash
        WHERE MaTK = @AccountId
      `,
      parameters: {
        AccountId: { type: this.sql.Int, value: accountId },
        PasswordHash: { type: this.sql.VarChar(255), value: passwordHash },
      },
      transaction,
    });
  }

}

module.exports = {
  AuthRepository,
};
