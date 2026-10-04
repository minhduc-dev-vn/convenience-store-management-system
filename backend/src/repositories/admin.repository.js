'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { BaseRepository } = require('./base.repository');

class AdminRepository extends BaseRepository {
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

  async listEmployees({ page, pageSize, searchPattern, status }, transaction = null) {
    const result = await this.query({
      text: `
        SELECT
          employee.MaNV,
          employee.HoTen,
          employee.NgaySinh,
          employee.GioiTinh,
          employee.SDT,
          employee.Email,
          employee.DiaChi,
          employee.NgayVaoLam,
          employee.LuongCoBan,
          employee.TrangThai,
          COUNT_BIG(*) OVER () AS TotalItems
        FROM dbo.NHAN_VIEN AS employee
        WHERE (@Status IS NULL OR employee.TrangThai = @Status)
          AND (
            @SearchPattern IS NULL
            OR employee.MaNV LIKE @SearchPattern ESCAPE '~'
            OR employee.HoTen LIKE @SearchPattern ESCAPE '~'
            OR employee.SDT LIKE @SearchPattern ESCAPE '~'
            OR employee.Email LIKE @SearchPattern ESCAPE '~'
          )
        ORDER BY employee.MaNV
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `,
      parameters: {
        Offset: { type: this.sql.Int, value: (page - 1) * pageSize },
        PageSize: { type: this.sql.Int, value: pageSize },
        SearchPattern: { type: this.sql.NVarChar(210), value: searchPattern },
        Status: { type: this.sql.VarChar(20), value: status },
      },
      transaction,
    });

    return {
      items: result.recordset,
      totalItems: Number(result.recordset[0]?.TotalItems ?? 0),
    };
  }

  async listCustomers(
    { membershipTier, page, pageSize, searchPattern, status },
    transaction = null,
  ) {
    const result = await this.query({
      text: `
        SELECT
          customer.MaKH,
          customer.HoTen,
          customer.SDT,
          customer.Email,
          customer.DiaChi,
          customer.NgaySinh,
          customer.DiemTichLuy,
          customer.HangThanhVien,
          customer.NgayDangKy,
          customer.TrangThai,
          account.MaTK,
          account.TenDangNhap,
          account.MaVaiTro,
          account.TrangThai AS TrangThaiTaiKhoan,
          account.LanDangNhapCuoi,
          account.NgayTao,
          COUNT_BIG(*) OVER () AS TotalItems
        FROM dbo.KHACH_HANG AS customer
        LEFT JOIN dbo.TAI_KHOAN AS account ON account.MaKH = customer.MaKH
        WHERE (@MembershipTier IS NULL OR customer.HangThanhVien = @MembershipTier)
          AND (@Status IS NULL OR customer.TrangThai = @Status)
          AND (
            @SearchPattern IS NULL
            OR customer.MaKH LIKE @SearchPattern ESCAPE '~'
            OR customer.HoTen LIKE @SearchPattern ESCAPE '~'
            OR customer.SDT LIKE @SearchPattern ESCAPE '~'
            OR customer.Email LIKE @SearchPattern ESCAPE '~'
          )
        ORDER BY customer.NgayDangKy DESC, customer.MaKH
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `,
      parameters: {
        MembershipTier: { type: this.sql.VarChar(20), value: membershipTier },
        Offset: { type: this.sql.Int, value: (page - 1) * pageSize },
        PageSize: { type: this.sql.Int, value: pageSize },
        SearchPattern: { type: this.sql.NVarChar(210), value: searchPattern },
        Status: { type: this.sql.VarChar(20), value: status },
      },
      transaction,
    });

    return {
      items: result.recordset,
      totalItems: Number(result.recordset[0]?.TotalItems ?? 0),
    };
  }

  async findCustomerById(customerId, transaction = null) {
    const result = await this.query({
      text: `
        SELECT
          customer.MaKH,
          customer.HoTen,
          customer.SDT,
          customer.Email,
          customer.DiaChi,
          customer.NgaySinh,
          customer.DiemTichLuy,
          customer.HangThanhVien,
          customer.NgayDangKy,
          customer.TrangThai,
          account.MaTK,
          account.TenDangNhap,
          account.MaVaiTro,
          account.TrangThai AS TrangThaiTaiKhoan,
          account.LanDangNhapCuoi,
          account.NgayTao
        FROM dbo.KHACH_HANG AS customer
        LEFT JOIN dbo.TAI_KHOAN AS account ON account.MaKH = customer.MaKH
        WHERE customer.MaKH = @CustomerId
      `,
      parameters: {
        CustomerId: { type: this.sql.VarChar(10), value: customerId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findCustomerAccountForUpdate(customerId, transaction) {
    const result = await this.query({
      text: `
        SELECT
          account.MaTK,
          account.TenDangNhap,
          account.MaVaiTro,
          account.MaNV,
          account.MaKH,
          account.TrangThai,
          account.LanDangNhapCuoi,
          account.NgayTao,
          'CUSTOMER' AS LoaiChuSoHuu,
          customer.MaKH AS MaChuSoHuu,
          customer.HoTen AS TenChuSoHuu,
          customer.TrangThai AS TrangThaiChuSoHuu
        FROM dbo.TAI_KHOAN AS account WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.KHACH_HANG AS customer ON customer.MaKH = account.MaKH
        WHERE customer.MaKH = @CustomerId
          AND account.MaVaiTro = 'CUSTOMER'
      `,
      parameters: {
        CustomerId: { type: this.sql.VarChar(10), value: customerId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findEmployeeById(employeeId, transaction = null, { lock = false } = {}) {
    const lockHint = lock ? 'WITH (UPDLOCK, HOLDLOCK)' : '';
    const result = await this.query({
      text: `
        SELECT
          MaNV, HoTen, NgaySinh, GioiTinh, SDT, Email, DiaChi,
          NgayVaoLam, LuongCoBan, TrangThai
        FROM dbo.NHAN_VIEN ${lockHint}
        WHERE MaNV = @EmployeeId
      `,
      parameters: {
        EmployeeId: { type: this.sql.VarChar(10), value: employeeId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findEmployeeIdentifierConflicts(
    { email, employeeId = null, phone },
    transaction,
  ) {
    const result = await this.query({
      text: `
        SELECT
          CAST(CASE WHEN EXISTS (
            SELECT 1 FROM dbo.NHAN_VIEN WITH (UPDLOCK, HOLDLOCK)
            WHERE SDT = @Phone AND (@EmployeeId IS NULL OR MaNV <> @EmployeeId)
          ) OR EXISTS (
            SELECT 1 FROM dbo.KHACH_HANG WITH (UPDLOCK, HOLDLOCK)
            WHERE SDT = @Phone
          ) OR EXISTS (
            SELECT 1 FROM dbo.TAI_KHOAN WITH (UPDLOCK, HOLDLOCK)
            WHERE TenDangNhap = @Phone
              AND (@EmployeeId IS NULL OR MaNV IS NULL OR MaNV <> @EmployeeId)
          ) THEN 1 ELSE 0 END AS BIT) AS PhoneExists,
          CAST(CASE WHEN @Email IS NOT NULL AND (
            EXISTS (
              SELECT 1 FROM dbo.NHAN_VIEN WITH (UPDLOCK, HOLDLOCK)
              WHERE Email = @Email AND (@EmployeeId IS NULL OR MaNV <> @EmployeeId)
            ) OR EXISTS (
              SELECT 1 FROM dbo.KHACH_HANG WITH (UPDLOCK, HOLDLOCK)
              WHERE Email = @Email
            ) OR EXISTS (
              SELECT 1 FROM dbo.TAI_KHOAN WITH (UPDLOCK, HOLDLOCK)
              WHERE TenDangNhap = @Email
                AND (@EmployeeId IS NULL OR MaNV IS NULL OR MaNV <> @EmployeeId)
            )
          ) THEN 1 ELSE 0 END AS BIT) AS EmailExists
      `,
      parameters: {
        Email: { type: this.sql.VarChar(100), value: email },
        EmployeeId: { type: this.sql.VarChar(10), value: employeeId },
        Phone: { type: this.sql.VarChar(15), value: phone },
      },
      transaction,
    });
    return {
      emailExists: Boolean(result.recordset[0].EmailExists),
      phoneExists: Boolean(result.recordset[0].PhoneExists),
    };
  }

  async createEmployee(employee, transaction) {
    const result = await this.query({
      text: `
        INSERT INTO dbo.NHAN_VIEN (
          MaNV, HoTen, NgaySinh, GioiTinh, SDT, Email, DiaChi,
          NgayVaoLam, LuongCoBan, TrangThai
        )
        OUTPUT
          inserted.MaNV, inserted.HoTen, inserted.NgaySinh, inserted.GioiTinh,
          inserted.SDT, inserted.Email, inserted.DiaChi, inserted.NgayVaoLam,
          inserted.LuongCoBan, inserted.TrangThai
        VALUES (
          @EmployeeId, @FullName, @DateOfBirth, @Gender, @Phone, @Email, @Address,
          @StartDate, @BaseSalary, @Status
        )
      `,
      parameters: {
        Address: { type: this.sql.NVarChar(255), value: employee.address },
        BaseSalary: { type: this.sql.Decimal(18, 2), value: employee.baseSalary },
        DateOfBirth: { type: this.sql.Date, value: employee.dateOfBirth },
        Email: { type: this.sql.VarChar(100), value: employee.email },
        EmployeeId: { type: this.sql.VarChar(10), value: employee.employeeId },
        FullName: { type: this.sql.NVarChar(100), value: employee.fullName },
        Gender: { type: this.sql.VarChar(10), value: employee.gender },
        Phone: { type: this.sql.VarChar(15), value: employee.phone },
        StartDate: { type: this.sql.Date, value: employee.startDate },
        Status: { type: this.sql.VarChar(20), value: employee.status },
      },
      transaction,
    });
    return result.recordset[0];
  }

  async updateEmployee(employeeId, changes, transaction) {
    const result = await this.query({
      text: `
        UPDATE dbo.NHAN_VIEN
        SET
          HoTen = CASE WHEN @SetFullName = 1 THEN @FullName ELSE HoTen END,
          NgaySinh = CASE WHEN @SetDateOfBirth = 1 THEN @DateOfBirth ELSE NgaySinh END,
          GioiTinh = CASE WHEN @SetGender = 1 THEN @Gender ELSE GioiTinh END,
          SDT = CASE WHEN @SetPhone = 1 THEN @Phone ELSE SDT END,
          Email = CASE WHEN @SetEmail = 1 THEN @Email ELSE Email END,
          DiaChi = CASE WHEN @SetAddress = 1 THEN @Address ELSE DiaChi END,
          NgayVaoLam = CASE WHEN @SetStartDate = 1 THEN @StartDate ELSE NgayVaoLam END,
          LuongCoBan = CASE WHEN @SetBaseSalary = 1 THEN @BaseSalary ELSE LuongCoBan END,
          TrangThai = CASE WHEN @SetStatus = 1 THEN @Status ELSE TrangThai END
        OUTPUT
          inserted.MaNV, inserted.HoTen, inserted.NgaySinh, inserted.GioiTinh,
          inserted.SDT, inserted.Email, inserted.DiaChi, inserted.NgayVaoLam,
          inserted.LuongCoBan, inserted.TrangThai
        WHERE MaNV = @EmployeeId
      `,
      parameters: {
        Address: { type: this.sql.NVarChar(255), value: changes.address ?? null },
        BaseSalary: { type: this.sql.Decimal(18, 2), value: changes.baseSalary ?? null },
        DateOfBirth: { type: this.sql.Date, value: changes.dateOfBirth ?? null },
        Email: { type: this.sql.VarChar(100), value: changes.email ?? null },
        EmployeeId: { type: this.sql.VarChar(10), value: employeeId },
        FullName: { type: this.sql.NVarChar(100), value: changes.fullName ?? null },
        Gender: { type: this.sql.VarChar(10), value: changes.gender ?? null },
        Phone: { type: this.sql.VarChar(15), value: changes.phone ?? null },
        SetAddress: { type: this.sql.Bit, value: Object.hasOwn(changes, 'address') },
        SetBaseSalary: { type: this.sql.Bit, value: Object.hasOwn(changes, 'baseSalary') },
        SetDateOfBirth: { type: this.sql.Bit, value: Object.hasOwn(changes, 'dateOfBirth') },
        SetEmail: { type: this.sql.Bit, value: Object.hasOwn(changes, 'email') },
        SetFullName: { type: this.sql.Bit, value: Object.hasOwn(changes, 'fullName') },
        SetGender: { type: this.sql.Bit, value: Object.hasOwn(changes, 'gender') },
        SetPhone: { type: this.sql.Bit, value: Object.hasOwn(changes, 'phone') },
        SetStartDate: { type: this.sql.Bit, value: Object.hasOwn(changes, 'startDate') },
        SetStatus: { type: this.sql.Bit, value: Object.hasOwn(changes, 'status') },
        StartDate: { type: this.sql.Date, value: changes.startDate ?? null },
        Status: { type: this.sql.VarChar(20), value: changes.status ?? null },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async listAccounts(
    { ownerType, page, pageSize, role, searchPattern, status },
    transaction = null,
  ) {
    const result = await this.query({
      text: `
        SELECT
          account.MaTK,
          account.TenDangNhap,
          account.MaVaiTro,
          account.TenVaiTro,
          account.TrangThai,
          account.LanDangNhapCuoi,
          account.NgayTao,
          account.LoaiChuSoHuu,
          account.MaChuSoHuu,
          account.TenChuSoHuu,
          account.TrangThaiChuSoHuu,
          COUNT_BIG(*) OVER () AS TotalItems
        FROM dbo.vw_TAI_KHOAN_VAI_TRO AS account
        WHERE (@OwnerType IS NULL OR account.LoaiChuSoHuu = @OwnerType)
          AND (@Role IS NULL OR account.MaVaiTro = @Role)
          AND (@Status IS NULL OR account.TrangThai = @Status)
          AND (
            @SearchPattern IS NULL
            OR account.TenDangNhap LIKE @SearchPattern ESCAPE '~'
            OR account.MaChuSoHuu LIKE @SearchPattern ESCAPE '~'
            OR account.TenChuSoHuu LIKE @SearchPattern ESCAPE '~'
          )
        ORDER BY account.MaTK
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `,
      parameters: {
        Offset: { type: this.sql.Int, value: (page - 1) * pageSize },
        OwnerType: { type: this.sql.VarChar(20), value: ownerType },
        PageSize: { type: this.sql.Int, value: pageSize },
        Role: { type: this.sql.VarChar(20), value: role },
        SearchPattern: { type: this.sql.NVarChar(210), value: searchPattern },
        Status: { type: this.sql.VarChar(20), value: status },
      },
      transaction,
    });
    return {
      items: result.recordset,
      totalItems: Number(result.recordset[0]?.TotalItems ?? 0),
    };
  }

  async findAccountById(accountId, transaction = null) {
    const result = await this.query({
      text: `
        SELECT
          MaTK, TenDangNhap, MaVaiTro, TenVaiTro, TrangThai,
          LanDangNhapCuoi, NgayTao, LoaiChuSoHuu, MaChuSoHuu,
          TenChuSoHuu, TrangThaiChuSoHuu
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

  async findAccountForUpdate(accountId, transaction) {
    const result = await this.query({
      text: `
        SELECT
          account.MaTK, account.TenDangNhap, account.MaVaiTro, account.MaNV,
          account.MaKH, account.TrangThai, account.LanDangNhapCuoi, account.NgayTao,
          CASE WHEN account.MaKH IS NOT NULL THEN 'CUSTOMER' ELSE 'EMPLOYEE' END AS LoaiChuSoHuu,
          COALESCE(account.MaKH, account.MaNV) AS MaChuSoHuu,
          COALESCE(customer.HoTen, employee.HoTen) AS TenChuSoHuu,
          COALESCE(customer.TrangThai, employee.TrangThai) AS TrangThaiChuSoHuu
        FROM dbo.TAI_KHOAN AS account WITH (UPDLOCK, HOLDLOCK)
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

  async findOwner(ownerType, ownerId, transaction) {
    const isCustomer = ownerType === 'CUSTOMER';
    const ownerQuery = isCustomer
      ? `
        SELECT MaKH AS OwnerId, HoTen AS OwnerName, SDT, Email, TrangThai
        FROM dbo.KHACH_HANG WITH (UPDLOCK, HOLDLOCK)
        WHERE MaKH = @OwnerId
      `
      : `
        SELECT MaNV AS OwnerId, HoTen AS OwnerName, SDT, Email, TrangThai
        FROM dbo.NHAN_VIEN WITH (UPDLOCK, HOLDLOCK)
        WHERE MaNV = @OwnerId
      `;
    const result = await this.query({
      text: ownerQuery,
      parameters: {
        OwnerId: { type: this.sql.VarChar(10), value: ownerId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async usernameHasConflict({ ownerId, ownerType, username }, transaction) {
    const result = await this.query({
      text: `
        SELECT CAST(CASE WHEN EXISTS (
          SELECT 1 FROM dbo.TAI_KHOAN WITH (UPDLOCK, HOLDLOCK)
          WHERE TenDangNhap = @Username
        ) OR EXISTS (
          SELECT 1 FROM dbo.NHAN_VIEN WITH (UPDLOCK, HOLDLOCK)
          WHERE (SDT = @Username OR Email = @Username)
            AND (@OwnerType <> 'EMPLOYEE' OR MaNV <> @OwnerId)
        ) OR EXISTS (
          SELECT 1 FROM dbo.KHACH_HANG WITH (UPDLOCK, HOLDLOCK)
          WHERE (SDT = @Username OR Email = @Username)
            AND (@OwnerType <> 'CUSTOMER' OR MaKH <> @OwnerId)
        ) THEN 1 ELSE 0 END AS BIT) AS HasConflict
      `,
      parameters: {
        OwnerId: { type: this.sql.VarChar(10), value: ownerId },
        OwnerType: { type: this.sql.VarChar(20), value: ownerType },
        Username: { type: this.sql.VarChar(50), value: username },
      },
      transaction,
    });
    return Boolean(result.recordset[0].HasConflict);
  }

  async createAccount({ ownerId, ownerType, passwordHash, role, username }, transaction) {
    const result = await this.query({
      text: `
        INSERT INTO dbo.TAI_KHOAN (
          TenDangNhap, MatKhauHash, MaVaiTro, MaNV, MaKH
        )
        OUTPUT inserted.MaTK
        VALUES (
          @Username, @PasswordHash, @Role,
          CASE WHEN @OwnerType = 'EMPLOYEE' THEN @OwnerId ELSE NULL END,
          CASE WHEN @OwnerType = 'CUSTOMER' THEN @OwnerId ELSE NULL END
        )
      `,
      parameters: {
        OwnerId: { type: this.sql.VarChar(10), value: ownerId },
        OwnerType: { type: this.sql.VarChar(20), value: ownerType },
        PasswordHash: { type: this.sql.VarChar(255), value: passwordHash },
        Role: { type: this.sql.VarChar(20), value: role },
        Username: { type: this.sql.VarChar(50), value: username },
      },
      transaction,
    });
    return Number(result.recordset[0].MaTK);
  }

  async updateAccountRole(accountId, role, transaction) {
    await this.query({
      text: 'UPDATE dbo.TAI_KHOAN SET MaVaiTro = @Role WHERE MaTK = @AccountId',
      parameters: {
        AccountId: { type: this.sql.Int, value: accountId },
        Role: { type: this.sql.VarChar(20), value: role },
      },
      transaction,
    });
  }

  async updateAccountStatus(accountId, status, transaction) {
    await this.query({
      text: 'UPDATE dbo.TAI_KHOAN SET TrangThai = @Status WHERE MaTK = @AccountId',
      parameters: {
        AccountId: { type: this.sql.Int, value: accountId },
        Status: { type: this.sql.VarChar(20), value: status },
      },
      transaction,
    });
  }

  async updateAccountPassword(accountId, passwordHash, transaction) {
    await this.query({
      text: 'UPDATE dbo.TAI_KHOAN SET MatKhauHash = @PasswordHash WHERE MaTK = @AccountId',
      parameters: {
        AccountId: { type: this.sql.Int, value: accountId },
        PasswordHash: { type: this.sql.VarChar(255), value: passwordHash },
      },
      transaction,
    });
  }

}

module.exports = {
  AdminRepository,
};
