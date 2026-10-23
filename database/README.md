# Cơ sở dữ liệu SQL Server

Thư mục này là gói triển khai cơ sở dữ liệu của hệ thống quản lý cửa hàng tiện lợi. Gói gồm lược đồ 23 bảng cốt lõi, ràng buộc, index, view, stored procedure, 5 inline TVF, 5 trigger, seed development tối thiểu, bộ test toàn vẹn/nghiệp vụ và kịch bản full backup/restore. Không có credential, JWT hoặc file backup nhị phân trong repository.

## Yêu cầu

- Microsoft SQL Server 2016 trở lên; tài khoản chạy backup/restore cần quyền SQL Server tương ứng.
- `sqlcmd` có thể kết nối tới một database do người chạy lựa chọn.
- Database đích không phải `master`, `model`, `msdb` hoặc `tempdb`.

## Thứ tự script

`init.schema.sql` gom các include schema dùng chung. `init.sql` và `init.production.sql` gọi runner này thay vì sao chép các script business. Thứ tự dependency là:

1. `schema/00_drop_core_schema.sql`: xóa đúng 23 bảng core theo thứ tự FK ngược và reset `dbo.SCHEMA_MIGRATIONS` trong clean-build flow.
2. `schema/01_identity.sql`: vai trò, nhân viên, khách hàng, tài khoản.
3. `schema/02_catalog.sql`: loại sản phẩm, sản phẩm, khuyến mãi và nhà cung cấp.
4. `schema/03_inventory.sql`: ca làm việc, nhập hàng, lô, kiểm kê và giao dịch kho ở baseline pre-003; migration 003 loại bỏ `GIAO_DICH_KHO.MaSP` ở trạng thái cuối.
5. `schema/04_sales_returns_audit.sql`: hóa đơn, thanh toán, trả hàng và nhật ký.
6. `constraints/01_enforce_and_validate.sql`: bật, trust và xác minh các constraint/default quan trọng.
7. `constraints/02_auth_account_audit.sql`: buộc account gắn đúng loại chủ sở hữu/role và chặn dữ liệu xác thực nhạy cảm trong audit payload.
8. `indexes/01_lookup_indexes.sql`: tạo các index lookup/filter dùng chung.
9. `indexes/02_auth_audit_indexes.sql`: tạo covering index đăng nhập và index tra cứu audit theo bản ghi.
10. Toàn bộ script còn lại trong `indexes/`, sau đó `views/` và `procedures/`, theo thứ tự dependency của catalog, nhập hàng, tồn kho, FEFO, đổi trả, kiểm kê, audit và báo cáo. Các object ghi giao dịch kho tại đây tương thích baseline pre-003 để migration lịch sử 002 có thể chạy.
11. `seed/01_roles.sql`: seed bốn vai trò chuẩn.
12. `seed/02_development_data.sql`: seed tối thiểu một nhân viên, danh mục, sản phẩm, nhà cung cấp và lô hàng development.
13. `functions/`: source trình bày của 5 UDF, mỗi file chứa đúng một lệnh `CREATE OR ALTER FUNCTION`; clean init không include thư mục này vì migration 004 là nguồn triển khai authoritative.
14. `triggers/`: source trình bày của 5 trigger, mỗi file chứa đúng một lệnh `CREATE OR ALTER TRIGGER`. Clean init chỉ include trigger audit baseline; bốn business trigger còn lại được migration 005 áp dụng.

Sau các bước trên, Node migration runner áp dụng 000–006. Migration 004 tạo 5 inline TVF; migration 005 tạo 4 business trigger để tổng cộng đúng 5 trigger; migration 006 tạo 4 database role least-privilege. Không có SQL seed nào tạo hoặc ghi `SCHEMA_MIGRATIONS`.

### Quy ước tổ chức source SQL

- `schema/` chỉ khai báo bảng và constraint gắn trực tiếp với bảng; standalone index nằm duy nhất trong `indexes/`.
- `indexes/` chỉ chứa session setting cần thiết và DDL `DROP INDEX IF EXISTS` / `CREATE INDEX`; truy vấn kiểm chứng nằm trong `tests/`.
- `functions/` và `triggers/` dùng một object mỗi file, viết trực tiếp bằng `CREATE OR ALTER`, không bọc bằng `EXEC sys.sp_executesql`.
- `views/` và `procedures/` dùng một object mỗi file; transaction nghiệp vụ được đóng gói trong stored procedure tương ứng.
- `migrations/` là lịch sử triển khai bất biến. Cách đóng gói trong migration có thể khác source trình bày để đáp ứng batch rule và checksum của runner.

> `init.sql` dựng lại toàn bộ 23 bảng core ở trạng thái trung gian pre-003, reset migration history và sẽ xóa dữ liệu hiện có. Chỉ chạy trên database development/test đã được chọn rõ ràng; script này có development seed. Database chỉ hoàn chỉnh sau khi migration runner báo tất cả migration `APPLIED`.

`init.production.sql` chỉ dùng một lần trên production database mới hoàn toàn. Script từ chối database đã có bảng `dbo`, dựng đúng 23 bảng/object ở baseline pre-003 và seed đúng bốn role chuẩn, nhưng không chạy development seed. Ngay sau đó phải chạy Node migration runner; chưa được phục vụ traffic ở trạng thái chỉ-init. Bảng `dbo.SCHEMA_MIGRATIONS` chỉ do runner tạo và ghi, là metadata hạ tầng nên không làm thay đổi số lượng 23 bảng core trong thiết kế nghiệp vụ.

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

Sau khi khởi tạo database mới, chuyển sang `backend/`. Status đầu tiên phải cho thấy 000–006 đều `PENDING`; runner thực thi và ghi nhận từng migration:

```powershell
npm run db:migrate:status
$env:ALLOW_DB_MIGRATIONS='true'
npm run db:migrate
npm run db:migrate:status
```

Sau lần chạy đầu, cả 000–006 phải là `APPLIED`; lần chạy thứ hai sẽ `SKIPPED` chúng. Không dùng `sqlcmd` để chạy từng file trong `migrations/`; runner Node là entry point authoritative duy nhất cho ordering, checksum, lock, transaction và migration history. Hướng dẫn production/Azure SQL và rollback nằm trong [`migrations/README.md`](migrations/README.md).

Migration checksum dùng canonical UTF-8 text: bỏ BOM đầu file và chuẩn hóa `CRLF`/`CR` thành LF nhưng giữ nguyên mọi whitespace khác. `.gitattributes` đồng thời ép `*.sql` checkout với LF để kết quả ổn định giữa Windows, GitHub và Linux/Render.

### Production bootstrap lần đầu

Chỉ trên Azure SQL database mới, rỗng và từ thư mục `database/`:

```powershell
sqlcmd -S "<server>.database.windows.net" -d "ConvenienceStore" `
  -G -N -I -b -f 65001 -i ".\init.production.sql"
```

Ví dụ dùng Microsoft Entra authentication để không đặt credential trong command hoặc repository; chọn cơ chế xác thực an toàn phù hợp môi trường triển khai. Sau bootstrap, chạy `npm run db:migrate:status`, áp dụng toàn bộ migration `PENDING`, rồi xác minh lại tất cả là `APPLIED`. Không chạy lại init script trên production đã có dữ liệu.

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

Local/test `init.sql` seed đúng bốn role `CUSTOMER`, `CASHIER`, `WAREHOUSE`, `MANAGER` và một bộ dữ liệu có mã chứa `DEV` để smoke test lookup. Production `init.production.sql` chỉ seed bốn role và không tạo `NVDEV001`, `LDEV001`, `SPDEV001`, `NCCDEV001` hoặc `LODEV001`. Cả hai flow đều không tạo tài khoản demo, password/hash hoặc production secret.

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

Runner chạy lần lượt 14 bộ test và dừng ngay khi có lỗi:

- Authentication/account/audit và append-only audit.
- Catalog, promotion, supplier, inventory và expiry alerts.
- Nhập hàng: success, validation, duplicate confirm và forced rollback.
- Bán hàng: multi-lot FEFO, bỏ qua lô hết hạn, insufficient stock và forced rollback.
- Đổi trả: partial/repeated/over-return, `RESALABLE`/`DAMAGED` và rollback.
- Kiểm kê: snapshot, count, signed `ADJUSTMENT`, approval và rollback.
- Báo cáo: doanh thu/refund, hàng hóa, tồn, nhập hàng, nhân viên/ca và performance smoke.
- User-defined function: đúng 5 inline TVF, happy path, boundary, `NULL`, input không hợp lệ và application-facing result.
- Trigger: đúng 5 trigger enabled, direct-DML guard, multi-row atomicity và regression cho receiving/checkout/return.
- SQL security: đúng 4 custom database role, membership, GRANT/DENY/REVOKE và ranh giới quyền trên table/view/procedure.
- Index inventory: đúng 43 standalone index và đúng key/include/filter của 5 index dùng làm benchmark Phase 6; không kiểm tra ngưỡng thời gian dễ flaky.
- Toàn vẹn cuối: đúng 23 bảng, 23 PK, 30 FK, 56 CHECK, 41 DEFAULT, 5 UDF, 5 trigger, role/seed chuẩn và negative test cho PK/FK/UNIQUE/CHECK. `GIAO_DICH_KHO` suy ra sản phẩm qua `LO_HANG.MaSP` thay vì lưu FK sản phẩm dư thừa.

Các fixture test được rollback hoặc dọn dẹp sau khi kiểm tra. Chuỗi nhạy cảm trong negative test chỉ là marker tổng hợp, không phải credential thật.

Bootstrap E2E nằm trong backend migration suite và cần opt-in riêng vì test tạo/xóa database. Cấu hình `RUN_DB_BOOTSTRAP_TESTS=true` cùng hai tên `DB_BOOTSTRAP_LOCAL_TEST_NAME` và `DB_BOOTSTRAP_PRODUCTION_TEST_NAME` kết thúc bằng `Test`; xem [`migrations/README.md`](migrations/README.md) để biết command và guard đầy đủ. Test xác minh trạng thái pre-003/pre-004/pre-005/pre-006 không có tracking table, UDF hay custom database role và chỉ có trigger audit; runner thực thi 000–006, schema cuối normalized có đúng 5 UDF/5 trigger/4 custom role, DEV seed chỉ có ở local và lần chạy thứ hai idempotent.

Thiết kế role, ma trận quyền và cách tạo bốn SQL login local nằm trong [`docs/dbms/SECURITY.md`](../docs/dbms/SECURITY.md) và [`security/README.md`](security/README.md).

## Benchmark index

Phase 6 dùng database disposable `ConvenienceStoreIndexBenchmarkTest` để đo before/after cho 5 standalone non-PK index; Main DB chỉ được đọc metadata và health. Bộ script sinh dữ liệu, runner 1 warmup + 5 lần đo, actual `.sqlplan`, output `STATISTICS IO/TIME`, kết quả CSV/JSON/Markdown và cleanup nằm trong [`benchmarks/README.md`](benchmarks/README.md). Tài liệu thiết kế và phân tích trade-off nằm tại [`docs/dbms/INDEXES.md`](../docs/dbms/INDEXES.md).

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
