# SQL Server database migrations

Thư mục này chứa các thay đổi schema gia tăng dùng sau khi database đã được khởi tạo. `database/init.sql` là runner phá hủy dành cho development/test; `database/init.production.sql` chỉ bootstrap một database production mới, rỗng đúng một lần. Tuyệt đối không dùng bất kỳ init script nào để nâng cấp production đang có dữ liệu.

## Quy ước file

- Tên file bắt buộc khớp `NNN_lowercase_name.sql`, ví dụ `001_add_invoice_reference.sql`.
- Mỗi sequence ba chữ số chỉ được dùng một lần. Runner sắp xếp theo tên file và từ chối sequence/id trùng.
- `_template.sql` chỉ là mẫu và luôn bị bỏ qua.
- Không dùng `GO`, `:r`, `:setvar` hoặc directive của `sqlcmd`. Mỗi file được gửi tới SQL Server như một batch và được runner bọc trong transaction.
- Không sửa, đổi tên hoặc xóa migration đã apply. Hãy thêm migration mới để tiến hoặc sửa schema.
- Migration không chứa credential, production data, absolute path hoặc logic seed.
- Repository ép file `*.sql` checkout với LF qua `.gitattributes`. Runner cũng canonicalize UTF-8 BOM và `CRLF`/`CR` thành LF trước khi thực thi và tính SHA-256; không trim hoặc xóa trailing whitespace, nên thay đổi nội dung thật vẫn bị phát hiện.

## Baseline 000

`000_baseline.sql` không tạo/xóa bảng và không thay đổi dữ liệu. File chỉ xác minh baseline hiện tại: đủ 23 bảng core theo Chương 4, không có `LICH_SU_GIA`/`DON_VI_TINH`, và các view/procedure authoritative quan trọng tồn tại.

## Migration hiện hành

- `000_baseline.sql`: xác minh và ghi nhận baseline production ban đầu; không được chỉnh sửa sau khi đã apply.
- `001_add_product_image_url.sql`: thêm nullable `SAN_PHAM.ImageUrl VARCHAR(500)` và cập nhật `vw_SAN_PHAM_DANH_MUC` để trả URL ảnh sản phẩm. Migration không seed URL và không lưu dữ liệu ảnh nhị phân.
- `002_fix_business_timezone.sql`: chuẩn hóa timestamp nghiệp vụ mới về UTC, chuyển khoảng ngày nghiệp vụ Việt Nam (`SE Asia Standard Time`) sang biên UTC trước khi lọc, và nhóm báo cáo theo ngày Việt Nam. Migration chỉ cập nhật default/module; không sửa timestamp lịch sử.
- `003_normalize_inventory_transaction_3nf.sql`: xác minh mọi cặp lô–sản phẩm lịch sử đang nhất quán, cập nhật bốn procedure ghi kho, rồi bỏ `GIAO_DICH_KHO.MaSP` và FK dư thừa. Sản phẩm của giao dịch được suy ra qua `LO_HANG.MaSP`; số bản ghi giao dịch không thay đổi.
- `004_add_dbms_user_defined_functions.sql`: tạo đúng 5 inline TVF read-only, tích hợp hai procedure tồn kho với UDF dùng chung và giữ nguyên output contract. POS/invoice repositories gọi trực tiếp các UDF final schema.
- `005_add_dbms_business_triggers.sql`: tạo 4 trigger bảo vệ ledger, workflow DRAFT và lịch sử lô; cùng trigger audit hiện hữu tạo thành đúng 5 trigger enabled mà không tự động mutation tồn kho hay ghi audit trùng.
- `006_add_dbms_database_roles.sql`: tạo 4 custom database role, cấp quyền object-level theo least privilege và DENY rõ dữ liệu xác thực, audit/stock ledger cùng migration history; login server-level được tách khỏi migration.

## Quy ước thời gian nghiệp vụ

- Các cột `DATETIME2` biểu diễn thời điểm được lưu theo UTC và API tuần tự hóa thành UTC ISO timestamp.
- Các cột `DATE` vẫn là giá trị ngày thuần túy, không tự gắn múi giờ.
- Khoảng ngày do người dùng nhập là ngày nghiệp vụ Việt Nam. Ví dụ `2026-10-10` tương ứng nửa khoảng UTC `[2026-10-09 17:00:00, 2026-10-10 17:00:00)`.
- SQL dùng timezone có tên `SE Asia Standard Time`; điều kiện `WHERE` so sánh trực tiếp cột UTC với biên UTC để giữ khả năng dùng index.
- Dữ liệu lịch sử không được viết lại. Dữ liệu Azure SQL hiện hữu được diễn giải theo UTC như cách API đã tuần tự hóa và frontend đang hiển thị.

Quy trình database development/test mới:

1. Tạo database rỗng riêng cho môi trường.
2. Chạy `database/init.sql` để dựng baseline trung gian pre-003/pre-004/pre-005/pre-006, bốn application role và seed development. Clean build này xóa 23 bảng core cùng `dbo.SCHEMA_MIGRATIONS` nhưng không tạo lại migration metadata; trạng thái này có 0 UDF, chỉ 1 trigger audit và 0 custom database role.
3. Từ `backend/`, chạy `npm run db:migrate:status` để xác minh 000–006 đều `PENDING`, rồi bật cờ an toàn và chạy `npm run db:migrate`. Chỉ sau khi tất cả là `APPLIED` database mới ở trạng thái ứng dụng hợp lệ với 5 UDF, 5 trigger và 4 custom database role.
4. Từ sau baseline, chỉ nâng cấp database bằng migration mới.

Quy trình production/Azure SQL mới:

1. Tạo Azure SQL database mới, không có bảng `dbo`.
2. Từ thư mục `database/`, chạy `init.production.sql` một lần bằng `sqlcmd` để dựng cùng baseline và chỉ seed bốn role chuẩn. Script từ chối database đã có bất kỳ bảng `dbo` nào và không chạy `seed/02_development_data.sql`.
3. Từ `backend/`, chạy `npm run db:migrate:status`, sau đó bật cờ an toàn và chạy `npm run db:migrate` để áp dụng 000–006. Không phục vụ traffic trước khi status cuối cùng là `APPLIED` cho tất cả migration.
4. Mọi release sau đó chỉ dùng `npm run db:migrate`; không chạy lại `init.production.sql` hoặc `init.sql`.

## Metadata và an toàn

Runner là thành phần duy nhất tạo và ghi `dbo.SCHEMA_MIGRATIONS` với `MigrationId`, `FileName`, SHA-256 `Checksum`, `AppliedAt` theo UTC và `ExecutionTimeMs`. Các init script không seed migration history. Checksum được tính trên canonical UTF-8 text độc lập với line ending Windows/Linux. Đây là bảng hạ tầng, không phải bảng core thứ 24.

Trước khi thay đổi schema, runner:

1. Từ chối `master`, `model`, `msdb`, `tempdb` và xác minh database thực tế khớp `DB_NAME`.
2. Yêu cầu `ALLOW_DB_MIGRATIONS=true`.
3. Giữ exclusive session lock `ConvenienceStore.DatabaseMigration` bằng `sp_getapplock` trên connection pool chuyên dụng chỉ có một connection.
4. Đối chiếu checksum tất cả migration đã apply. Sai khác dừng ngay với `APPLIED_MIGRATION_MODIFIED`.
5. Thực thi từng migration và ghi metadata trong cùng một transaction. Lỗi SQL rollback migration hiện tại, không ghi metadata, không chạy file tiếp theo và process thoát khác 0.

Lệnh `db:migrate:status` chỉ đọc metadata; nếu bảng tracking chưa có thì hiển thị toàn bộ migration là `PENDING` mà không tạo bảng.

## Lệnh vận hành

Từ thư mục `backend/`:

```powershell
npm run db:migrate:status
$env:ALLOW_DB_MIGRATIONS='true'
npm run db:migrate
npm run db:migrate:status
```

`DB_MIGRATION_LOCK_TIMEOUT_MS` mặc định là 15000 ms. Cờ `ALLOW_DB_MIGRATIONS` nên chỉ được bật trong release job/chính terminal thực thi migration, không bật cho process web thường trực. `npm start` không tự chạy migration.

## Production và Azure SQL

Production bắt buộc dùng `DB_DRIVER=tedious`, `DB_TRUSTED_CONNECTION=false`, SQL authentication qua TCP, `DB_ENCRYPT=true`, `DB_TRUST_SERVER_CERTIFICATE=false`, `DB_INSTANCE` rỗng và `DB_PORT=1433`. CLI kiểm tra và từ chối cấu hình sai trước khi kết nối. Runner dùng package `mssql` sẵn có; chỉ bootstrap lần đầu có thể dùng `sqlcmd`, còn production migration không phụ thuộc `sqlcmd` hay Windows Authentication.

Trước mỗi release:

1. Backup/point-in-time restore policy phải sẵn sàng và đã được thử trên database khác.
2. Chạy `npm run db:migrate:status` và review danh sách `PENDING`.
3. Bật `ALLOW_DB_MIGRATIONS=true`, chạy `npm run db:migrate` một lần từ release job duy nhất.
4. Chạy lại status, smoke health/readiness, sau đó mới chuyển traffic.

Rollback production không tự động chạy down script. Migration đang lỗi tự rollback; migration đã commit phải được khôi phục bằng point-in-time restore/backup hoặc một forward migration đã review.

## Kiểm thử migration

Unit test không cần database:

```powershell
npm run test:migrations
```

Integration test chỉ chạy khi `RUN_DB_INTEGRATION_TESTS=true` và `DB_NAME` có chứa `test`. Database test phải được dựng bằng `init.sql` rồi migrate đến trạng thái cuối trước:

```powershell
$env:RUN_DB_INTEGRATION_TESTS='true'
$env:ALLOW_DB_MIGRATIONS='true'
npm run test:migrations
```

Targeted normalization E2E tự tạo/xóa một database riêng và kiểm tra cả fixture nonzero hợp lệ lẫn mismatch rollback:

```powershell
$env:RUN_DB_INTEGRATION_TESTS='true'
$env:RUN_DB_NORMALIZATION_TESTS='true'
$env:DB_MIGRATION_003_TEST_NAME='ConvenienceStoreMigration003DataTest'
npm run test:migrations
```

Bootstrap E2E là destructive test có opt-in riêng. Test tự tạo rồi chỉ xóa đúng hai database vừa tạo; tên không có default và bắt buộc là SQL identifier an toàn kết thúc bằng `Test`, khác nhau và khác `DB_NAME`:

```powershell
$env:RUN_DB_INTEGRATION_TESTS='true'
$env:RUN_DB_BOOTSTRAP_TESTS='true'
$env:DB_BOOTSTRAP_LOCAL_TEST_NAME='ConvenienceStoreLocalBootstrapTest'
$env:DB_BOOTSTRAP_PRODUCTION_TEST_NAME='ConvenienceStoreProductionBootstrapTest'
npm run test:migrations
```

Máy chạy bootstrap E2E phải có `sqlcmd` trong `PATH`; có thể đặt `SQLCMD_PATH` tới executable khác. SQL authentication truyền password cho child process qua `SQLCMDPASSWORD`, không đưa password vào command line hoặc log. `sqlcmd` chỉ chạy `init.sql`/`init.production.sql` có `:r` và `GO`; Node runner vẫn là entry point duy nhất cho production migrations.

Bộ test phủ canonical checksum LF/CRLF/CR/BOM, clean init pre-003/pre-004/pre-005/pre-006, replay thật 000–006, đúng 5 UDF/5 trigger/4 custom database role, bảo toàn giao dịch kho nonzero, rollback legacy mismatch, production bootstrap không DEV seed, runner skip idempotent, ordering, out-of-order rejection, rollback khi SQL lỗi, checksum mismatch, concurrent lock, Azure production config và chặn system database.

Thuật toán canonical checksum là production contract kể từ trước lần bootstrap production đầu tiên. Không được sửa migration đã apply hoặc thay thuật toán để bypass `APPLIED_MIGRATION_MODIFIED`. Local/test metadata từng được tạo bởi runner thử nghiệm cũ có thể được reset bằng clean `init.sql`; production đang có dữ liệu không được sửa history thủ công.
