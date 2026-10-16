'use strict';

const bcrypt = require('bcrypt');
const { getAuthSettings } = require('../src/config/auth.config');
const { getDatabaseSettings } = require('../src/config/database.config');
const { getSqlDriver } = require('../src/config/database.driver');
const { closePool, getPool } = require('../src/config/database.pool');
const { normalizePassword } = require('../src/utils/input-validation');

const EXPECTED_DATABASE = 'ConvenienceStore_DBMS';
const RESET_PASSWORD = process.argv.includes('--reset-password');
const LOCAL_HOSTS = new Set(['.', '(local)', 'localhost', '127.0.0.1']);

const DEMO_IDENTITIES = Object.freeze([
  {
    role: 'MANAGER',
    username: 'dbms_manager',
    ownerType: 'EMPLOYEE',
    ownerId: 'D7MGR001',
    fullName: 'DBMS Demo Manager',
    phone: '0707000001',
    email: 'dbms.manager@demo.invalid',
    passwordEnvironmentVariable: 'DBMS_DEMO_MANAGER_PASSWORD',
  },
  {
    role: 'CASHIER',
    username: 'dbms_cashier',
    ownerType: 'EMPLOYEE',
    ownerId: 'D7CSH001',
    fullName: 'DBMS Demo Cashier',
    phone: '0707000002',
    email: 'dbms.cashier@demo.invalid',
    passwordEnvironmentVariable: 'DBMS_DEMO_CASHIER_PASSWORD',
  },
  {
    role: 'WAREHOUSE',
    username: 'dbms_warehouse',
    ownerType: 'EMPLOYEE',
    ownerId: 'D7WH001',
    fullName: 'DBMS Demo Warehouse',
    phone: '0707000003',
    email: 'dbms.warehouse@demo.invalid',
    passwordEnvironmentVariable: 'DBMS_DEMO_WAREHOUSE_PASSWORD',
  },
  {
    role: 'CUSTOMER',
    username: 'dbms_customer',
    ownerType: 'CUSTOMER',
    ownerId: 'D7CUS001',
    fullName: 'DBMS Demo Customer',
    phone: '0707000004',
    email: 'dbms.customer@demo.invalid',
    passwordEnvironmentVariable: 'DBMS_DEMO_CUSTOMER_PASSWORD',
  },
]);

function assertLocalDemoTarget(settings) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo account setup is disabled when NODE_ENV=production.');
  }
  if (settings.config.database !== EXPECTED_DATABASE) {
    throw new Error(`Demo account setup is restricted to ${EXPECTED_DATABASE}.`);
  }
  const configuredHost = process.env.DB_SERVER?.trim().toLowerCase();
  if (!LOCAL_HOSTS.has(configuredHost)) {
    throw new Error('Demo account setup requires an explicitly local DB_SERVER.');
  }
  if (settings.driver !== 'msnodesqlv8' || settings.config.options.trustedConnection !== true) {
    throw new Error('Demo account setup requires local Windows trusted authentication.');
  }
}

function readPasswords() {
  return new Map(DEMO_IDENTITIES.map((identity) => {
    const rawPassword = process.env[identity.passwordEnvironmentVariable];
    if (!rawPassword) {
      throw new Error(`${identity.passwordEnvironmentVariable} is required and is never stored by this script.`);
    }
    return [identity.role, normalizePassword(rawPassword, identity.passwordEnvironmentVariable)];
  }));
}

function bind(request, sql, name, type, value) {
  request.input(name, type, value);
  return request;
}

async function ensureOwner(transaction, sql, identity) {
  if (identity.ownerType === 'EMPLOYEE') {
    const request = new sql.Request(transaction);
    bind(request, sql, 'OwnerId', sql.VarChar(10), identity.ownerId);
    bind(request, sql, 'FullName', sql.NVarChar(100), identity.fullName);
    bind(request, sql, 'Phone', sql.VarChar(15), identity.phone);
    bind(request, sql, 'Email', sql.VarChar(100), identity.email);
    const result = await request.query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.NHAN_VIEN WITH (UPDLOCK, HOLDLOCK) WHERE MaNV = @OwnerId)
      BEGIN
        INSERT INTO dbo.NHAN_VIEN (
          MaNV, HoTen, SDT, Email, DiaChi, NgayVaoLam, LuongCoBan, TrangThai
        )
        VALUES (
          @OwnerId, @FullName, @Phone, @Email, N'Dữ liệu local Phase 7',
          CONVERT(DATE, '2026-01-01'), 0, 'ACTIVE'
        );
      END;

      SELECT MaNV AS OwnerId, HoTen, SDT, Email, TrangThai
      FROM dbo.NHAN_VIEN
      WHERE MaNV = @OwnerId;
    `);
    return result.recordset[0];
  }

  const request = new sql.Request(transaction);
  bind(request, sql, 'OwnerId', sql.VarChar(10), identity.ownerId);
  bind(request, sql, 'FullName', sql.NVarChar(100), identity.fullName);
  bind(request, sql, 'Phone', sql.VarChar(15), identity.phone);
  bind(request, sql, 'Email', sql.VarChar(100), identity.email);
  const result = await request.query(`
    IF NOT EXISTS (SELECT 1 FROM dbo.KHACH_HANG WITH (UPDLOCK, HOLDLOCK) WHERE MaKH = @OwnerId)
    BEGIN
      INSERT INTO dbo.KHACH_HANG (
        MaKH, HoTen, SDT, Email, DiaChi, DiemTichLuy, HangThanhVien, TrangThai
      )
      VALUES (
        @OwnerId, @FullName, @Phone, @Email, N'Dữ liệu local Phase 7',
        0, 'BRONZE', 'ACTIVE'
      );
    END;

    SELECT MaKH AS OwnerId, HoTen, SDT, Email, TrangThai
    FROM dbo.KHACH_HANG
    WHERE MaKH = @OwnerId;
  `);
  return result.recordset[0];
}

function assertOwnerMatches(identity, owner) {
  if (!owner
      || owner.OwnerId !== identity.ownerId
      || owner.HoTen !== identity.fullName
      || owner.SDT !== identity.phone
      || owner.Email !== identity.email) {
    throw new Error(`Reserved demo owner ${identity.ownerId} exists with unexpected data; refusing to overwrite it.`);
  }
  if (owner.TrangThai !== 'ACTIVE') {
    throw new Error(`Demo owner ${identity.ownerId} is ${owner.TrangThai}; reactivate it explicitly before setup.`);
  }
}

async function ensureAccount(transaction, sql, identity, passwordHash) {
  const request = new sql.Request(transaction);
  bind(request, sql, 'Username', sql.VarChar(50), identity.username);
  bind(request, sql, 'PasswordHash', sql.VarChar(255), passwordHash);
  bind(request, sql, 'Role', sql.VarChar(20), identity.role);
  bind(request, sql, 'OwnerId', sql.VarChar(10), identity.ownerId);
  bind(request, sql, 'OwnerType', sql.VarChar(20), identity.ownerType);
  bind(request, sql, 'ResetPassword', sql.Bit, RESET_PASSWORD);

  const result = await request.query(`
    DECLARE @ExistingAccountId INT = (
      SELECT MaTK
      FROM dbo.TAI_KHOAN WITH (UPDLOCK, HOLDLOCK)
      WHERE TenDangNhap = @Username
    );

    IF @ExistingAccountId IS NULL
    BEGIN
      IF EXISTS (
        SELECT 1 FROM dbo.TAI_KHOAN
        WHERE (@OwnerType = 'EMPLOYEE' AND MaNV = @OwnerId)
           OR (@OwnerType = 'CUSTOMER' AND MaKH = @OwnerId)
      )
        THROW 53701, 'The reserved demo owner is already attached to another account.', 1;

      INSERT INTO dbo.TAI_KHOAN (TenDangNhap, MatKhauHash, MaVaiTro, MaNV, MaKH)
      VALUES (
        @Username, @PasswordHash, @Role,
        CASE WHEN @OwnerType = 'EMPLOYEE' THEN @OwnerId ELSE NULL END,
        CASE WHEN @OwnerType = 'CUSTOMER' THEN @OwnerId ELSE NULL END
      );
    END
    ELSE
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM dbo.TAI_KHOAN
        WHERE MaTK = @ExistingAccountId
          AND MaVaiTro = @Role
          AND ((@OwnerType = 'EMPLOYEE' AND MaNV = @OwnerId AND MaKH IS NULL)
            OR (@OwnerType = 'CUSTOMER' AND MaKH = @OwnerId AND MaNV IS NULL))
      )
        THROW 53702, 'The reserved demo username exists with a different role or owner.', 1;

      IF @ResetPassword = 1
        UPDATE dbo.TAI_KHOAN SET MatKhauHash = @PasswordHash WHERE MaTK = @ExistingAccountId;
    END;

    SELECT MaTK, TenDangNhap, MaVaiTro, TrangThai,
           CASE WHEN MaKH IS NOT NULL THEN MaKH ELSE MaNV END AS OwnerId
    FROM dbo.TAI_KHOAN
    WHERE TenDangNhap = @Username;
  `);
  return result.recordset[0];
}

async function main() {
  const settings = getDatabaseSettings();
  assertLocalDemoTarget(settings);
  const passwords = readPasswords();
  const { bcryptRounds } = getAuthSettings();
  const sql = getSqlDriver(settings.driver);
  const hashes = new Map();

  for (const identity of DEMO_IDENTITIES) {
    hashes.set(identity.role, await bcrypt.hash(passwords.get(identity.role), bcryptRounds));
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const roleResult = await new sql.Request(transaction).query(`
      SELECT MaVaiTro FROM dbo.VAI_TRO
      WHERE MaVaiTro IN ('CUSTOMER', 'CASHIER', 'WAREHOUSE', 'MANAGER');
    `);
    if (roleResult.recordset.length !== 4) {
      throw new Error('The four canonical application roles must exist before demo setup.');
    }

    const summaries = [];
    for (const identity of DEMO_IDENTITIES) {
      const owner = await ensureOwner(transaction, sql, identity);
      assertOwnerMatches(identity, owner);
      const account = await ensureAccount(transaction, sql, identity, hashes.get(identity.role));
      summaries.push({
        role: account.MaVaiTro,
        username: account.TenDangNhap,
        ownerId: account.OwnerId,
        status: account.TrangThai,
        passwordChanged: RESET_PASSWORD,
      });
    }

    await transaction.commit();
    console.table(summaries);
    console.log('Local DBMS application demo accounts are ready. Password values were not logged.');
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(`Demo account setup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
