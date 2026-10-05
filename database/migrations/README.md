# SQL Server database migrations

Thư mục này chứa các thay đổi schema gia tăng dùng sau khi database đã được khởi tạo. `database/init.sql` vẫn là runner phá hủy dùng để dựng mới database development/test; tuyệt đối không dùng `init.sql` để nâng cấp database production đang có dữ liệu.

## Quy ước file

- Tên file bắt buộc khớp `NNN_lowercase_name.sql`, ví dụ `001_add_invoice_reference.sql`.
- Mỗi sequence ba chữ số chỉ được dùng một lần. Runner sắp xếp theo tên file và từ chối sequence/id trùng.
- `_template.sql` chỉ là mẫu và luôn bị bỏ qua.
- Không dùng `GO`, `:r`, `:setvar` hoặc directive của `sqlcmd`. Mỗi file được gửi tới SQL Server như một batch và được runner bọc trong transaction.
- Không sửa, đổi tên hoặc xóa migration đã apply. Hãy thêm migration mới để tiến hoặc sửa schema.
- Migration không chứa credential, production data, absolute path hoặc logic seed.

## Baseline 000

`000_baseline.sql` không tạo/xóa bảng và không thay đổi dữ liệu. File chỉ xác minh baseline hiện tại: đủ 23 bảng core theo Chương 4, không có `LICH_SU_GIA`/`DON_VI_TINH`, và các view/procedure authoritative quan trọng tồn tại.

Quy trình database mới:

1. Tạo database rỗng riêng cho môi trường.
2. Chạy `database/init.sql` **một lần** để dựng baseline và seed development khi phù hợp.
3. Từ `backend/`, bật cờ an toàn và chạy `npm run db:migrate` để xác minh/ghi nhận `000_baseline`.
4. Từ sau baseline, chỉ nâng cấp database bằng migration mới.

## Metadata và an toàn

Runner tạo idempotent `dbo.SCHEMA_MIGRATIONS` với `MigrationId`, `FileName`, SHA-256 `Checksum`, `AppliedAt` theo UTC và `ExecutionTimeMs`. Đây là bảng hạ tầng, không phải bảng core thứ 24.

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

Production bắt buộc dùng `DB_DRIVER=tedious`, SQL authentication qua TCP, `DB_ENCRYPT=true`, `DB_TRUST_SERVER_CERTIFICATE=false`, `DB_INSTANCE` rỗng và `DB_PORT=1433`. Runner dùng package `mssql` sẵn có; production không phụ thuộc `sqlcmd` hay Windows Authentication.

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

Integration test chỉ chạy khi `RUN_DB_INTEGRATION_TESTS=true` và `DB_NAME` có chứa `test`. Database test phải được dựng bằng `init.sql` trước:

```powershell
$env:RUN_DB_INTEGRATION_TESTS='true'
$env:ALLOW_DB_MIGRATIONS='true'
npm run test:migrations
```

Bộ test phủ fresh metadata/baseline, chạy lần hai skip, ordering, rollback khi SQL lỗi, không ghi metadata cho file lỗi, không chạy file kế tiếp, checksum mismatch và chặn system database.
