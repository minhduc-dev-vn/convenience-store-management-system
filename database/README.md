# Cơ sở dữ liệu SQL Server

Thư mục này là gói triển khai cơ sở dữ liệu của hệ thống quản lý cửa hàng tiện lợi. Gói gồm lược đồ 23 bảng cốt lõi, ràng buộc, index, view, stored procedure, seed development tối thiểu, bộ test toàn vẹn/nghiệp vụ và kịch bản full backup/restore. Không có credential, JWT hoặc file backup nhị phân trong repository.

## Yêu cầu

- Microsoft SQL Server 2016 trở lên; tài khoản chạy backup/restore cần quyền SQL Server tương ứng.
- `sqlcmd` có thể kết nối tới một database do người chạy lựa chọn.
- Database đích không phải `master`, `model`, `msdb` hoặc `tempdb`.

## Thứ tự script

`init.sql` chạy các file theo đúng dependency:

1. `schema/00_drop_core_schema.sql`: xóa đúng 23 bảng core theo thứ tự FK ngược.
2. `schema/01_identity.sql`: vai trò, nhân viên, khách hàng, tài khoản.
3. `schema/02_catalog.sql`: loại sản phẩm, sản phẩm, khuyến mãi và nhà cung cấp.
4. `schema/03_inventory.sql`: ca làm việc, nhập hàng, lô, kiểm kê và giao dịch kho.
5. `schema/04_sales_returns_audit.sql`: hóa đơn, thanh toán, trả hàng và nhật ký.
6. `constraints/01_enforce_and_validate.sql`: bật, trust và xác minh các constraint/default quan trọng.
7. `constraints/02_auth_account_audit.sql`: buộc account gắn đúng loại chủ sở hữu/role và chặn dữ liệu xác thực nhạy cảm trong audit payload.
8. `indexes/01_lookup_indexes.sql`: bổ sung index lookup/filter và xác minh unique index nền.
9. `indexes/02_auth_audit_indexes.sql`: xác minh covering index login và thêm index tra cứu audit theo bản ghi.
10. Toàn bộ script trong `indexes/`, `views/` và `procedures/` theo thứ tự dependency của catalog, nhập hàng, tồn kho, FEFO, đổi trả, kiểm kê, audit và báo cáo.
11. `seed/01_roles.sql`: seed bốn vai trò chuẩn.
12. `seed/02_development_data.sql`: seed tối thiểu một nhân viên, danh mục, sản phẩm, nhà cung cấp và lô hàng development.

> `init.sql` dựng lại toàn bộ 23 bảng core và sẽ xóa dữ liệu hiện có trong các bảng này. Chỉ chạy trên database rỗng hoặc database development/test đã được chọn rõ ràng.

`init.sql` không phải công cụ nâng cấp production. Sau lần dựng baseline, mọi thay đổi schema phải đi qua các file gia tăng trong [`migrations/`](migrations/) và Node runner ở `backend/scripts/db-migrate.js`. Bảng `dbo.SCHEMA_MIGRATIONS` do runner quản lý là metadata hạ tầng, không làm thay đổi số lượng 23 bảng core trong thiết kế nghiệp vụ.

## Tạo cơ sở dữ liệu

Nếu cơ sở dữ liệu chưa tồn tại trên SQL Server, chạy script `create_database.sql`:

```powershell
sqlcmd -S "localhost" -E -C -i ".\create_database.sql"
```

*(Hoặc `-S ".\SQLEXPRESS"` nếu dùng SQL Server Express).*

## Khởi tạo schema

Mở terminal tại thư mục `database/`, sau đó chạy:

```powershell
sqlcmd -S "localhost" -E -C -I -d "ConvenienceStore" -b -f 65001 -i ".\init.sql"
```

Thay server và database bằng môi trường của bạn. Tùy chọn `-C` dùng cho mã hóa tin cậy trên ODBC Driver 18 trở lên; `-I` bật `QUOTED_IDENTIFIER`, cần thiết khi thao tác với filtered index; `-b` trả exit code khác 0 khi SQL lỗi. Credential không được lưu trong repository; nếu không dùng Windows Authentication, hãy truyền thông tin kết nối bằng cơ chế bảo mật của môi trường triển khai.

Sau khi khởi tạo database mới, chuyển sang `backend/` và ghi nhận baseline bằng migration runner:

```powershell
npm run db:migrate:status
$env:ALLOW_DB_MIGRATIONS='true'
npm run db:migrate
npm run db:migrate:status
```

Không dùng `sqlcmd` để chạy từng file trong `migrations/`; runner Node là entry point authoritative cho ordering, checksum, lock và transaction. Hướng dẫn production/Azure SQL và rollback nằm trong [`migrations/README.md`](migrations/README.md).

## Kiểm tra số bảng

Kết quả mong đợi là `23`:

```sql
SELECT COUNT(*) AS CoreTableCount
FROM sys.tables
WHERE schema_id = SCHEMA_ID('dbo')
  AND name IN (
      'VAI_TRO', 'NHAN_VIEN', 'KHACH_HANG', 'TAI_KHOAN', 'CA_LAM_VIEC',
      'LOAI_SAN_PHAM', 'SAN_PHAM', 'KHUYEN_MAI', 'KHUYEN_MAI_SAN_PHAM',
      'NHA_CUNG_CAP', 'PHIEU_NHAP', 'LO_HANG', 'CHI_TIET_PHIEU_NHAP',
      'KIEM_KE', 'CHI_TIET_KIEM_KE', 'GIAO_DICH_KHO', 'HOA_DON',
      'CHI_TIET_HOA_DON', 'CHI_TIET_XUAT_LO', 'THANH_TOAN', 'PHIEU_TRA',
      'CHI_TIET_PHIEU_TRA', 'NHAT_KY_HE_THONG'
  );
```

## Kiểm tra khóa ngoại

Liệt kê FK để đối chiếu bảng con, cột con, bảng cha và cột cha:

```sql
SELECT
    fk.name AS ForeignKeyName,
    OBJECT_NAME(fk.parent_object_id) AS ChildTable,
    child_column.name AS ChildColumn,
    OBJECT_NAME(fk.referenced_object_id) AS ParentTable,
    parent_column.name AS ParentColumn
FROM sys.foreign_keys AS fk
JOIN sys.foreign_key_columns AS fkc
    ON fkc.constraint_object_id = fk.object_id
JOIN sys.columns AS child_column
    ON child_column.object_id = fkc.parent_object_id
   AND child_column.column_id = fkc.parent_column_id
JOIN sys.columns AS parent_column
    ON parent_column.object_id = fkc.referenced_object_id
   AND parent_column.column_id = fkc.referenced_column_id
WHERE OBJECT_SCHEMA_NAME(fk.parent_object_id) = 'dbo'
ORDER BY ChildTable, ForeignKeyName, fkc.constraint_column_id;
```

Không có bảng `LICH_SU_GIA` hoặc `DON_VI_TINH`; `DonViTinh` là thuộc tính của `SAN_PHAM`.

## Baseline seed

Runner seed đúng bốn role `CUSTOMER`, `CASHIER`, `WAREHOUSE`, `MANAGER` và một bộ dữ liệu có mã chứa `DEV` để smoke test lookup. Seed không tạo tài khoản demo, không chứa password/hash hoặc production secret.

Có thể kiểm tra nhanh sau khi chạy init:

```sql
SELECT MaVaiTro, TenVaiTro FROM dbo.VAI_TRO ORDER BY MaVaiTro;
SELECT MaSP, TenSP, MaVach, GiaBan FROM dbo.SAN_PHAM WHERE MaSP = 'SPDEV001';
SELECT MaLo, MaSP, SoLo, HanSuDung, SoLuongTon FROM dbo.LO_HANG WHERE MaLo = 'LODEV001';
```

## Authentication và audit support

- `dbo.vw_TAI_KHOAN_VAI_TRO` phục vụ tra cứu account/role/owner nhưng cố ý không trả `MatKhauHash`.
- `dbo.usp_TAI_KHOAN_LayTheoTenDangNhap` là lookup parameterized dành cho luồng đăng nhập và có trả hash để backend kiểm tra mật khẩu.
- `dbo.usp_NHAT_KY_HE_THONG_Ghi` ghi audit dùng chung; procedure và CHECK constraint đều từ chối payload có tên trường password/token/secret/JWT.
- JWT được tạo và xác minh tại backend, không được lưu hoặc xử lý trong SQL Server.

## Chạy toàn bộ kiểm thử database

Luôn dùng database test đã dựng bằng `init.sql`; không chạy test trên database production. Từ thư mục `database/`:

```powershell
sqlcmd -S ".\SQLEXPRESS" -E -C -I -d "ConvenienceStoreTest" -b -f 65001 -i ".\tests\run_all.sql"
```

Runner chạy lần lượt 10 bộ test và dừng ngay khi có lỗi:

- Authentication/account/audit và append-only audit.
- Catalog, promotion, supplier, inventory và expiry alerts.
- Nhập hàng: success, validation, duplicate confirm và forced rollback.
- Bán hàng: multi-lot FEFO, bỏ qua lô hết hạn, insufficient stock và forced rollback.
- Đổi trả: partial/repeated/over-return, `RESALABLE`/`DAMAGED` và rollback.
- Kiểm kê: snapshot, count, signed `ADJUSTMENT`, approval và rollback.
- Báo cáo: doanh thu/refund, hàng hóa, tồn, nhập hàng, nhân viên/ca và performance smoke.
- Toàn vẹn cuối: đúng 23 bảng, 23 PK, 31 FK, 56 CHECK, 41 DEFAULT, role/seed chuẩn và negative test cho PK/FK/UNIQUE/CHECK.

Các fixture test được rollback hoặc dọn dẹp sau khi kiểm tra. Chuỗi nhạy cảm trong negative test chỉ là marker tổng hợp, không phải credential thật.

## Full backup và restore smoke

`maintenance/backup_restore_test.sql` thực hiện liên tiếp:

1. `BACKUP DATABASE ... WITH COPY_ONLY, CHECKSUM`.
2. `RESTORE VERIFYONLY`.
3. Restore sang một database test **khác tên và chưa tồn tại**.
4. `DBCC CHECKDB` trên bản restore.
5. Xác minh 23 bảng, bốn role, seed development và các FK/CHECK đều enabled/trusted.

Script từ chối database hệ thống, từ chối restore cùng tên source và không ghi đè database đã tồn tại. Mặc định file `.bak` được ghi vào `InstanceDefaultBackupPath` của SQL Server; có thể truyền `BackupFile` nếu SQL Server service đã được cấp quyền với một đường dẫn khác.

Ví dụ chạy từ thư mục `database/`:

```powershell
sqlcmd -S ".\SQLEXPRESS" -E -C -I -d "master" -b -f 65001 `
  -v SourceDatabase="ConvenienceStoreTest" RestoreDatabase="ConvenienceStoreRestoreTest" `
  -i ".\maintenance\backup_restore_test.sql"
```

Sau khi đối chiếu kết quả, xóa database restore test bằng công cụ quản trị SQL Server và xóa file `.bak` theo chính sách lưu trữ của môi trường. Không đưa file `.bak` vào Git.

## Quy trình đóng gói/xác minh cuối

Trên một database test mới:

1. Tạo database rỗng.
2. Chạy `init.sql` để dựng schema, stored objects và seed.
3. Chạy `tests/run_all.sql`.
4. Chạy `maintenance/backup_restore_test.sql` với một tên restore test chưa tồn tại.
5. Chạy lại `init.sql` trên database source test và `tests/run_all.sql` để xác nhận runner có thể dựng lại sạch.

`init.sql` có tính phá hủy đối với 23 bảng core trong database được chọn; luôn kiểm tra đúng server và tên database test trước khi chạy.
