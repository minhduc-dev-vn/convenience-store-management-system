# Backend API

Node.js 20+ và ExpressJS cung cấp REST API cho hệ thống quản lý cửa hàng tiện lợi. Backend tổ chức theo luồng `Route -> Middleware -> Controller -> Service -> Repository -> SQL Server`; các nghiệp vụ nhiều bước về nhập kho, bán hàng FEFO, đổi trả và kiểm kê được hoàn tất bằng transaction phía SQL Server.

## Cài đặt

```bash
cd backend
npm install
```

Tạo file môi trường từ mẫu và thay toàn bộ giá trị dành riêng cho môi trường chạy:

```powershell
Copy-Item .env.example .env
```

Không commit `.env`, mật khẩu SQL Server hoặc JWT secret.

## Cấu hình môi trường

| Nhóm | Biến |
| --- | --- |
| Runtime | `NODE_ENV`, `PORT` |
| HTTP security | `CORS_ALLOWED_ORIGINS`, `REQUEST_BODY_LIMIT`, `TRUST_PROXY` |
| SQL Server | `DB_DRIVER`, `DB_ODBC_DRIVER`, `DB_SERVER`, `DB_INSTANCE`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_TRUSTED_CONNECTION`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE` |
| Connection pool | `DB_POOL_MAX`, `DB_POOL_MIN`, `DB_POOL_IDLE_TIMEOUT_MS` |
| Database migrations | `ALLOW_DB_MIGRATIONS`, `DB_MIGRATION_LOCK_TIMEOUT_MS` |
| Authentication | `JWT_SECRET`, `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS` |

`CORS_ALLOWED_ORIGINS` là danh sách origin HTTP(S) chính xác, phân tách bằng dấu phẩy. Không dùng wildcard cho API có Bearer token. `TRUST_PROXY=true` chỉ phù hợp khi ứng dụng thực sự chạy sau reverse proxy được kiểm soát.

Giá trị `JWT_SECRET` trong `.env.example` chỉ giúp khởi động môi trường development. Server từ chối giá trị mẫu này khi `NODE_ENV=production`; staging và production phải dùng secret ngẫu nhiên tối thiểu 32 byte.

Với SQL authentication, cấu hình `DB_USER` và `DB_PASSWORD`. Với Windows authentication, dùng `DB_DRIVER=msnodesqlv8` và `DB_TRUSTED_CONNECTION=true`.

## Database migrations

Migration là lệnh vận hành độc lập, không chạy tự động cùng `npm start`:

```powershell
npm run db:migrate:status
$env:ALLOW_DB_MIGRATIONS='true'
npm run db:migrate
```

`db:migrate:status` chỉ đọc và hiển thị `APPLIED`/`PENDING`. `db:migrate` yêu cầu cờ an toàn rõ ràng, dùng checksum SHA-256, SQL Server application lock và transaction riêng cho từng file. Xem đầy đủ quy trình baseline, production và rollback tại [`database/migrations/README.md`](../database/migrations/README.md).

Migration 006 tạo bốn database role least-privilege tương ứng `CUSTOMER`, `CASHIER`, `WAREHOUSE`, `MANAGER`. Đây là lớp phòng thủ SQL độc lập: backend vẫn dùng một technical connection pool và không impersonate SQL principal theo JWT. Chi tiết quyền và local SQL login nằm trong [`docs/dbms/SECURITY.md`](../docs/dbms/SECURITY.md).

Checksum migration canonicalize UTF-8 BOM và line ending `CRLF`/`CR` thành LF trước khi hash và thực thi, nên cùng SQL không false-fail khi đi từ Windows qua GitHub sang Linux/Render. Whitespace khác và nội dung SQL thật không bị bỏ qua; migration đã apply vẫn bất biến.

Local Windows Authentication dùng `DB_DRIVER=msnodesqlv8`. Production/Azure SQL bắt buộc `DB_DRIVER=tedious`, `DB_TRUSTED_CONNECTION=false`, SQL authentication, `DB_PORT=1433`, `DB_INSTANCE` rỗng, `DB_ENCRYPT=true` và `DB_TRUST_SERVER_CERTIFICATE=false`; migration CLI từ chối cấu hình production không đạt các điều kiện này trước khi kết nối. Không đặt `ALLOW_DB_MIGRATIONS=true` cho web service chạy thường trực; chỉ bật trong terminal/release job thực hiện migration.

Ba workflow database tách biệt:

- Local/test clean build: chạy `database/init.sql` để tạo bootstrap pre-003/pre-004/pre-005/pre-006 và development seed, sau đó bắt buộc chạy `npm run db:migrate` để tạo migration history, schema chuẩn hóa, 5 UDF, 5 trigger và 4 custom database role.
- Production first bootstrap: chạy `database/init.production.sql` đúng một lần trên database mới/rỗng, sau đó bắt buộc chạy `npm run db:migrate` trước khi phục vụ traffic; init không tự ghi metadata migration.
- Existing production update: chỉ chạy `npm run db:migrate`; không chạy lại init script.

## Chạy API

Development có watch mode:

```bash
npm run dev
```

Chế độ chạy thông thường:

```bash
npm start
```

Các endpoint kiểm tra trạng thái:

- `GET /api/health`: liveness của tiến trình, không phụ thuộc database.
- `GET /api/health/db`: readiness của SQL Server; trả `503 DATABASE_UNAVAILABLE` khi chưa sẵn sàng.

## Local DBMS demo accounts

Phase 7 cung cấp utility idempotent `scripts/setup-dbms-demo-accounts.js` để tạo bốn application account local trong `ConvenienceStore_DBMS`. Đây là account `dbo.TAI_KHOAN`, không phải bốn SQL Server login của Phase 5. Utility chỉ chạy với local Windows trusted authentication, bị chặn ở production và không log password/hash.

```powershell
$env:DBMS_DEMO_MANAGER_PASSWORD='<runtime-only>'
$env:DBMS_DEMO_CASHIER_PASSWORD='<runtime-only>'
$env:DBMS_DEMO_WAREHOUSE_PASSWORD='<runtime-only>'
$env:DBMS_DEMO_CUSTOMER_PASSWORD='<runtime-only>'
npm run db:setup-demo
```

Chạy lại không duplicate và không reset password. Chỉ dùng `npm run db:setup-demo -- --reset-password` khi chủ động muốn đổi credential từ bốn biến runtime. Xem kiến trúc, E2E evidence và cleanup policy tại [`docs/dbms/APPLICATION_INTEGRATION.md`](../docs/dbms/APPLICATION_INTEGRATION.md); kịch bản thuyết trình nằm trong [`docs/dbms/DEMO_RUNBOOK.md`](../docs/dbms/DEMO_RUNBOOK.md).

## Kiểm thử

Chạy toàn bộ test mặc định:

```bash
npm test
```

Chạy riêng security smoke:

```bash
npm run test:security
```

Chạy bộ test migration (unit test luôn chạy; integration test theo cờ database bên dưới):

```bash
npm run test:migrations
```

Để chạy thêm local/production bootstrap E2E, cần `sqlcmd` và opt-in destructive test bằng `RUN_DB_BOOTSTRAP_TESTS=true`, đồng thời truyền hai tên database riêng kết thúc bằng `Test` qua `DB_BOOTSTRAP_LOCAL_TEST_NAME` và `DB_BOOTSTRAP_PRODUCTION_TEST_NAME`. Không có tên mặc định; test từ chối system/non-test/current database và chỉ cleanup database nó vừa tạo. Command đầy đủ nằm trong migration README.

Các integration test dùng database chỉ chạy khi `RUN_DB_INTEGRATION_TESTS=true`. Luôn trỏ đến database test sạch đã dựng từ `database/init.sql`, không dùng database production. Ví dụ PowerShell:

```powershell
$env:RUN_DB_INTEGRATION_TESTS='true'
$env:DB_DRIVER='msnodesqlv8'
$env:DB_SERVER='localhost'
$env:DB_INSTANCE='SQLEXPRESS'
$env:DB_NAME='ConvenienceStore_Test'
$env:DB_TRUSTED_CONNECTION='true'
$env:DB_ENCRYPT='false'
$env:DB_TRUST_SERVER_CERTIFICATE='true'
$env:JWT_SECRET='replace-with-a-test-only-secret-at-least-32-bytes'
$env:BCRYPT_ROUNDS='4'
npm run test:db
```

`test:db` chạy tuần tự để tránh các fixture transaction dùng chung gây race condition.

## Production checklist

- Đặt `NODE_ENV=production` và thay JWT secret mẫu.
- Khai báo đúng frontend origin trong `CORS_ALLOWED_ORIGINS`.
- Chỉ bật `TRUST_PROXY` sau reverse proxy được kiểm soát.
- Dùng TLS tại reverse proxy và cấu hình kết nối SQL Server phù hợp môi trường.
- Chạy migration bằng một release job duy nhất trước khi chuyển traffic; không chạy đồng thời trong nhiều web instance.
- Không ghi request body, Authorization header, password, token hoặc raw SQL error vào log.
- Kiểm tra cả liveness và database readiness trước khi nhận traffic.
- Chạy `npm test`, SQL-backed integration suite và `npm audit` trước khi triển khai.
