# Convenience Store Management System

Hệ thống quản lý cửa hàng tiện lợi trên nền web, phục vụ bán hàng tại quầy, quản lý kho theo lô, khách hàng thành viên và báo cáo điều hành cho mô hình một cửa hàng.

## 1. Tổng quan

Ứng dụng gồm ba phần chạy độc lập nhưng dùng chung một nghiệp vụ:

- Frontend React cung cấp cổng công khai, cổng khách hàng và khu vực làm việc theo vai trò.
- Backend Express cung cấp REST API, xác thực JWT, RBAC, validation và audit.
- SQL Server lưu 23 bảng core và thực thi các transaction quan trọng như nhập kho, bán hàng FEFO, đổi trả và kiểm kê.

Phạm vi không bao gồm nhiều chi nhánh, đặt hàng trực tuyến, giao hàng hoặc cổng thanh toán thật. Các phương thức thanh toán ngoài tiền mặt được mô phỏng ở mức ghi nhận giao dịch.

## 2. Mục tiêu

- Chuẩn hóa quy trình bán hàng và đối chiếu ca thu ngân.
- Theo dõi tồn kho chính xác theo sản phẩm, lô và hạn sử dụng.
- Bảo vệ các nghiệp vụ nhiều bước bằng transaction và rollback.
- Tách quyền rõ ràng giữa `CUSTOMER`, `CASHIER`, `WAREHOUSE` và `MANAGER`.
- Cung cấp dữ liệu tra cứu, audit và báo cáo từ nguồn SQL Server thống nhất.
- Có thể dựng lại, kiểm thử và chạy trên một máy mới bằng tài liệu trong repository.

## 3. Chức năng chính

### Khách hàng

- Đăng ký, đăng nhập, đổi mật khẩu và cập nhật hồ sơ cá nhân.
- Xem sản phẩm, giá bán và chương trình khuyến mãi đang hiệu lực.
- Xem hóa đơn của chính mình, lịch sử mua hàng và điểm tích lũy.

### Thu ngân

- Mở ca, xem trạng thái ca, bán hàng tại POS và đóng ca đối chiếu.
- Quét mã vạch hoặc tìm sản phẩm có thể bán.
- Lấy báo giá phía server, áp dụng khuyến mãi hợp lệ, thanh toán và in hóa đơn.
- Tra cứu hóa đơn và xử lý trả hàng theo số lượng còn được phép trả.

### Nhân viên kho

- Lập phiếu nhập nháp, quản lý chi tiết và xác nhận nhập kho.
- Tra cứu tồn tổng, tồn theo lô, hàng tồn thấp, cận hạn và hết hạn.
- Tạo đợt kiểm kê, ghi nhận số lượng thực tế và gửi đề nghị điều chỉnh.

### Quản lý

- Quản lý sản phẩm, danh mục, giá bán, khuyến mãi và nhà cung cấp.
- Quản lý nhân viên, tài khoản, vai trò và khách hàng thành viên.
- Phê duyệt hoặc yêu cầu kiểm lại đề nghị điều chỉnh kho.
- Tra cứu hóa đơn, audit log và báo cáo kinh doanh.

## 4. Công nghệ sử dụng

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | ReactJS, JavaScript, Vite, React Router |
| Backend | Node.js, ExpressJS |
| API | REST, JSON, JWT Bearer authentication |
| Database | Microsoft SQL Server |
| SQL client | `mssql` với `tedious` hoặc `msnodesqlv8` |
| Kiểm thử | Node.js test runner, SQL test runner, route smoke |

Backend tuân theo luồng `Route -> Middleware -> Controller -> Service -> Repository -> SQL Server`.

## 5. Cấu trúc thư mục

```text
.
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── repositories/
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   ├── tests/
│   ├── .env.example
│   └── README.md
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── assets/
│   │   ├── auth/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── routes/
│   │   └── services/
│   ├── scripts/
│   ├── tests/
│   ├── .env.example
│   └── README.md
├── database/
│   ├── constraints/
│   ├── indexes/
│   ├── maintenance/
│   ├── migrations/
│   ├── procedures/
│   ├── schema/
│   ├── seed/
│   ├── tests/
│   ├── views/
│   ├── create_database.sql
│   ├── init.schema.sql
│   ├── init.production.sql
│   ├── init.sql
│   └── README.md
├── .gitignore
└── README.md
```

## 6. Thiết kế cơ sở dữ liệu

Database có đúng 23 bảng core:

- Tài khoản và nhân sự: `VAI_TRO`, `NHAN_VIEN`, `KHACH_HANG`, `TAI_KHOAN`, `CA_LAM_VIEC`.
- Danh mục và khuyến mãi: `LOAI_SAN_PHAM`, `SAN_PHAM`, `KHUYEN_MAI`, `KHUYEN_MAI_SAN_PHAM`.
- Nhà cung cấp và kho: `NHA_CUNG_CAP`, `PHIEU_NHAP`, `LO_HANG`, `CHI_TIET_PHIEU_NHAP`, `KIEM_KE`, `CHI_TIET_KIEM_KE`, `GIAO_DICH_KHO`.
- Bán hàng và đổi trả: `HOA_DON`, `CHI_TIET_HOA_DON`, `CHI_TIET_XUAT_LO`, `THANH_TOAN`, `PHIEU_TRA`, `CHI_TIET_PHIEU_TRA`.
- Nhật ký: `NHAT_KY_HE_THONG`.

Không có bảng `DON_VI_TINH` hoặc `LICH_SU_GIA`: đơn vị tính nằm trên `SAN_PHAM`, còn lịch sử giá lấy từ audit log. Tồn kho được tính từ các lô, không lưu một tổng tồn trùng lặp trên sản phẩm.

`database/init.sql` dựng lại schema và development seed, đồng thời reset migration history; chỉ dùng cho development/test. `database/init.production.sql` chỉ bootstrap production database mới/rỗng một lần, seed đúng bốn role và không có dữ liệu DEV. Production đã có baseline chỉ cập nhật bằng Node migration runner. Xem [database/README.md](database/README.md) để biết đầy đủ thứ tự script, test, backup và restore.

## 7. Yêu cầu hệ thống

- Node.js 20 trở lên và npm.
- Microsoft SQL Server 2016 trở lên.
- `sqlcmd` có thể kết nối SQL Server.
- ODBC Driver 18 for SQL Server khi dùng cấu hình Windows Authentication mẫu.
- Hai terminal riêng cho backend và frontend.

## 8. Cài đặt

Clone repository, sau đó cài dependency:

```powershell
cd backend
npm install

cd ..\frontend
npm install
```

Không commit `.env`, credential, token, `node_modules/`, `dist/` hoặc file backup `.bak`.

## 9. Cấu hình môi trường

### Backend

```powershell
cd backend
Copy-Item .env.example .env
```

Các biến chính:

| Biến | Ý nghĩa |
| --- | --- |
| `NODE_ENV`, `PORT` | Môi trường và cổng HTTP, mặc định `3000` |
| `CORS_ALLOWED_ORIGINS` | Danh sách origin frontend chính xác, phân tách bằng dấu phẩy |
| `REQUEST_BODY_LIMIT`, `TRUST_PROXY` | Giới hạn body và cấu hình reverse proxy |
| `DB_DRIVER` | `tedious` hoặc `msnodesqlv8` |
| `DB_ODBC_DRIVER` | Tên ODBC driver khi dùng `msnodesqlv8` |
| `DB_SERVER`, `DB_INSTANCE`, `DB_PORT`, `DB_NAME` | Địa chỉ và database SQL Server |
| `DB_USER`, `DB_PASSWORD` | SQL Authentication; để trống khi dùng trusted connection |
| `DB_TRUSTED_CONNECTION` | `true` khi dùng Windows Authentication với `msnodesqlv8` |
| `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE` | Chính sách TLS của kết nối database |
| `DB_POOL_MAX`, `DB_POOL_MIN`, `DB_POOL_IDLE_TIMEOUT_MS` | Connection pool |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Secret tối thiểu 32 byte và thời hạn JWT |
| `BCRYPT_ROUNDS` | Work factor khi hash mật khẩu |

Giá trị `JWT_SECRET` trong file mẫu chỉ dành cho local development và bị từ chối khi chạy production. Luôn thay bằng secret ngẫu nhiên, không lưu trong Git.

Ví dụ Windows Authentication:

```dotenv
DB_DRIVER=msnodesqlv8
DB_ODBC_DRIVER=ODBC Driver 18 for SQL Server
DB_SERVER=localhost
DB_INSTANCE=SQLEXPRESS
DB_NAME=ConvenienceStore
DB_TRUSTED_CONNECTION=true
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
```

### Frontend

```powershell
cd frontend
Copy-Item .env.example .env
```

```dotenv
VITE_API_BASE_URL=/api
DEV_API_PROXY_TARGET=http://127.0.0.1:3000
```

## 10. Khởi tạo database

Từ thư mục `database/`:

```powershell
sqlcmd -S ".\SQLEXPRESS" -E -C -i ".\create_database.sql"
sqlcmd -S ".\SQLEXPRESS" -E -C -I -d "ConvenienceStore" -b -f 65001 -i ".\init.sql"
```

Nếu dùng default instance, thay `-S ".\SQLEXPRESS"` bằng `-S "localhost"`. Nếu dùng SQL Authentication, thay `-E` bằng thông tin đăng nhập được cấp qua cơ chế an toàn của môi trường; không ghi credential vào script hoặc tài liệu.

Seed nền tạo bốn role chuẩn và dữ liệu catalog/kho tối thiểu, nhưng không tạo tài khoản dùng chung. Khách hàng có thể tự đăng ký. Tài khoản nhân viên demo phải được cấp riêng trong database demo bởi người quản trị; không dùng credential cố định trong repository.

Production first bootstrap dùng `database/init.production.sql` đúng một lần trên database mới/rỗng, sau đó chạy `npm run db:migrate` từ `backend/` để ghi baseline. Các lần cập nhật production tiếp theo chỉ chạy migration; không chạy lại bất kỳ init script nào.

## 11. Chạy project

Backend:

```powershell
cd backend
npm run dev
```

Hoặc chạy không watch:

```powershell
npm start
```

Frontend ở terminal khác:

```powershell
cd frontend
npm run dev
```

Địa chỉ mặc định:

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:3000`
- Liveness: `GET http://127.0.0.1:3000/api/health`
- Database readiness: `GET http://127.0.0.1:3000/api/health/db`

## 12. Kiểm thử và production build

### Database

Chỉ chạy trên database test đã dựng bằng `init.sql`:

```powershell
cd database
sqlcmd -S ".\SQLEXPRESS" -E -C -I -d "ConvenienceStoreTest" -b -f 65001 -i ".\tests\run_all.sql"
```

### Backend

```powershell
cd backend
npm test
npm run test:security
```

Integration test cần database test riêng và phải chạy tuần tự:

```powershell
$env:RUN_DB_INTEGRATION_TESTS='true'
$env:DB_DRIVER='msnodesqlv8'
$env:DB_ODBC_DRIVER='ODBC Driver 18 for SQL Server'
$env:DB_SERVER='localhost'
$env:DB_INSTANCE='SQLEXPRESS'
$env:DB_NAME='ConvenienceStoreTest'
$env:DB_TRUSTED_CONNECTION='true'
$env:DB_ENCRYPT='false'
$env:DB_TRUST_SERVER_CERTIFICATE='true'
$env:JWT_SECRET='replace-with-a-test-only-secret-at-least-32-bytes'
$env:BCRYPT_ROUNDS='4'
npm run test:db
```

Không dùng `npm test` với integration DB bật song song vì các fixture transaction dùng chung một database test.

### Frontend

```powershell
cd frontend
npm test
npm run build
npm run preview
```

Khi preview đang chạy ở `http://127.0.0.1:4173`, mở terminal khác:

```powershell
cd frontend
npm run test:routes
```

## 13. API overview

API dùng JSON và tiền tố `/api`:

| Nhóm | Route chính | Quyền |
| --- | --- | --- |
| Health | `/api/health`, `/api/health/db` | Public |
| Auth | `/api/auth` | Public / authenticated user |
| Public catalog | `/api/products`, `/api/promotions` | Public |
| Customer | `/api/customers/me` | `CUSTOMER` ownership |
| POS và ca | `/api/pos` | `CASHIER` |
| Hóa đơn | `/api/invoices` | `CASHIER`, `MANAGER` |
| Đổi trả | `/api/returns` | `CASHIER` |
| Kho | `/api/inventory`, `/api/warehouse` | `WAREHOUSE`, một số read cho `MANAGER` |
| Quản trị | `/api/admin` | `MANAGER` |

Response thành công:

```json
{
  "success": true,
  "data": {}
}
```

Response lỗi:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Mô tả lỗi an toàn"
  }
}
```

## 14. Checklist 35 chức năng

Quy ước trạng thái `Đạt` nghĩa là đã có implementation, đã tích hợp đúng layer và có test tự động hoặc smoke tương ứng.

| Mã | Chức năng | Vai trò | Trạng thái |
| --- | --- | --- | --- |
| F01 | Đăng ký tài khoản khách hàng | Public | Đạt |
| F02 | Đăng nhập | 4 role | Đạt |
| F03 | Cập nhật hồ sơ khách hàng | CUSTOMER | Đạt |
| F04 | Đổi mật khẩu | 4 role | Đạt |
| F05 | Xem sản phẩm | Public/CUSTOMER | Đạt |
| F06 | Xem khuyến mãi | Public/CUSTOMER | Đạt |
| F07 | Xem hóa đơn và lịch sử mua hàng | CUSTOMER | Đạt, ownership được kiểm thử |
| F08 | Xem điểm tích lũy | CUSTOMER | Đạt, chỉ đọc |
| F09 | Mở ca làm việc | CASHIER | Đạt |
| F10 | Quét mã vạch hoặc tìm sản phẩm | CASHIER | Đạt |
| F11 | Lập hóa đơn bán hàng | CASHIER | Đạt |
| F12 | Tính tiền hóa đơn | Server | Đạt, không tin giá/tổng từ client |
| F13 | Áp dụng khuyến mãi | Server | Đạt trong phạm vi promotion theo sản phẩm |
| F14 | Ghi nhận thanh toán | CASHIER | Đạt |
| F15 | In hoặc xem hóa đơn | CASHIER | Đạt |
| F16 | Tra cứu hóa đơn | CASHIER/MANAGER | Đạt |
| F17 | Xử lý đổi/trả hàng | CASHIER | Đạt cho luồng hiện hành; nhánh approval chưa có threshold được ghi ở mục giới hạn |
| F18 | Đóng ca và đối chiếu | CASHIER | Đạt |
| F19 | Quản lý nhà cung cấp | MANAGER | Đạt |
| F20 | Lập phiếu nhập hàng | WAREHOUSE | Đạt |
| F21 | Xác nhận nhập kho | WAREHOUSE | Đạt, transaction atomic |
| F22 | Tra cứu tồn kho | WAREHOUSE/MANAGER | Đạt |
| F23 | Theo dõi lô và hạn sử dụng | WAREHOUSE | Đạt |
| F24 | Xem cảnh báo tồn thấp/hạn dùng | WAREHOUSE/MANAGER | Đạt |
| F25 | Tạo đợt kiểm kê | WAREHOUSE | Đạt |
| F26 | Ghi nhận số lượng thực tế | WAREHOUSE | Đạt, chênh lệch do server tính |
| F27 | Lập đề nghị điều chỉnh tồn kho | WAREHOUSE | Đạt |
| F28 | Quản lý sản phẩm | MANAGER | Đạt |
| F29 | Cập nhật giá bán | MANAGER | Đạt, có audit |
| F30 | Quản lý khuyến mãi | MANAGER | Đạt |
| F31 | Quản lý nhân viên | MANAGER | Đạt |
| F32 | Quản lý tài khoản và phân quyền | MANAGER | Đạt |
| F33 | Duyệt điều chỉnh kho | MANAGER | Đạt, transaction atomic |
| F34 | Tra cứu nhật ký thao tác | MANAGER | Đạt |
| F35 | Xem báo cáo kinh doanh | MANAGER | Đạt cho doanh thu, hàng hóa, kho, nhập hàng, nhân viên và ca |

## 15. Checklist 28 màn hình

| Mã | Route đại diện | Quyền | Trạng thái |
| --- | --- | --- | --- |
| MH-01 | `/auth/login` | Public | Đạt |
| MH-02 | `/auth/register` | Public | Đạt |
| MH-03 | `/account/change-password` | 4 role | Đạt |
| MH-04 | `/cashier`, `/warehouse`, `/manager` | Theo role nhân viên | Đạt, dashboard dùng API thật |
| MH-05 | `/cashier` | CASHIER | Đạt |
| MH-06 | `/cashier/pos` | CASHIER | Đạt |
| MH-07 | `/cashier/receipts/:invoiceId` | CASHIER | Đạt |
| MH-08 | `/cashier/invoices` | CASHIER/MANAGER | Đạt |
| MH-09 | `/cashier/returns/:invoiceId` | CASHIER | Đạt |
| MH-10 | `/manager/suppliers` | MANAGER | Đạt |
| MH-11 | `/warehouse/receiving/new` | WAREHOUSE | Đạt |
| MH-12 | `/warehouse/receiving` | WAREHOUSE | Đạt |
| MH-13 | `/warehouse/inventory` | WAREHOUSE/MANAGER | Đạt |
| MH-14 | `/warehouse/stocktakes` | WAREHOUSE | Đạt |
| MH-15 | `/manager/stocktakes` | MANAGER | Đạt |
| MH-16 | `/manager/products` | MANAGER | Đạt |
| MH-17 | `/manager/products/pricing` | MANAGER | Đạt |
| MH-18 | `/manager/promotions` | MANAGER | Đạt |
| MH-19 | `/manager/employees` | MANAGER | Đạt |
| MH-20 | `/manager/accounts` | MANAGER | Đạt |
| MH-21 | `/manager/customers` | MANAGER | Đạt |
| MH-22 | `/manager/audit-logs` | MANAGER | Đạt |
| MH-23 | `/manager/reports/revenue` | MANAGER | Đạt; CSV và print-to-PDF |
| MH-24 | `/manager/reports/merchandise` | MANAGER | Đạt |
| MH-25 | `/manager/reports/workforce` | MANAGER | Đạt |
| MH-26 | `/products` | Public/CUSTOMER | Đạt |
| MH-27 | `/customer/history` | CUSTOMER | Đạt |
| MH-28 | `/customer/profile` | CUSTOMER | Đạt |

Các route xác thực hỗ trợ refresh trực tiếp qua SPA fallback. Menu theo role chỉ là UX; backend vẫn kiểm tra JWT, role và ownership cho mọi API bảo vệ.

## 16. Kịch bản demo bốn vai trò

### CUSTOMER

1. Mở `/products` khi chưa đăng nhập, tìm sản phẩm và xem ưu đãi.
2. Đăng ký hoặc đăng nhập, cập nhật hồ sơ tại `/customer/profile`.
3. Mở `/customer/history`, kiểm tra điểm, phân trang và chi tiết hóa đơn của chính tài khoản.

### CASHIER

1. Đăng nhập, mở ca và xác nhận trạng thái ca từ API.
2. Vào `/cashier/pos`, quét/tìm sản phẩm, cập nhật giỏ và lấy quote.
3. Thanh toán một lần, xem/in receipt và tra cứu lại hóa đơn.
4. Thử một return hợp lệ và một return vượt số lượng để kiểm tra validation.
5. Đối chiếu tiền cuối ca, đóng ca và xác nhận POS không dùng lại ca đã đóng.

### WAREHOUSE

1. Kiểm tra cảnh báo tồn thấp/cận hạn trên dashboard.
2. Tạo phiếu nhập nháp, sửa chi tiết và xác nhận nhập.
3. Kiểm tra tồn tổng, drill-down lô và các filter hạn dùng.
4. Tạo kiểm kê, nhập số lượng thực tế/lý do và gửi đề nghị.

### MANAGER

1. Kiểm tra KPI dashboard và navigation quản trị.
2. Smoke sản phẩm, giá, khuyến mãi, nhà cung cấp, nhân viên, tài khoản và khách hàng.
3. Duyệt hoặc yêu cầu kiểm lại đề nghị kiểm kê.
4. Lọc audit log; mở ba nhóm báo cáo và thay đổi khoảng ngày.

Chi tiết trạng thái loading/error/empty, responsive và thao tác cần quan sát nằm trong [frontend/README.md](frontend/README.md).

## 17. Trạng thái release candidate

Bản hiện tại đã được xác minh trên Node.js 24, npm 11, SQL Server Express và ODBC Driver 18:

- Clean database init và seed: đạt, đúng 23 bảng core.
- Full database integrity/transaction/report suite: đạt.
- Backend unit/contract suite: 126 pass, 17 integration test được tách riêng.
- Backend SQL-backed suite chạy tuần tự: 143/143 pass.
- Frontend suite: 74/74 pass.
- Production build: đạt.
- Production preview route smoke: 31/31 pass.
- Liveness, database readiness, public catalog và Vite proxy: HTTP 200.
- `npm install`/audit của backend và frontend: 0 vulnerability tại thời điểm xác minh.

### Giới hạn và quyết định còn mở

- Tích điểm đã hoạt động; tiêu điểm chưa được mở vì tài liệu mâu thuẫn về tỷ lệ quy đổi và chưa có quyết định thống nhất.
- Khuyến mãi hiện áp dụng theo sản phẩm. Chính sách khuyến mãi toàn cửa hàng, tự chọn khi nhiều chương trình cùng hợp lệ và stacking chưa được chốt.
- Luồng trả hàng hiện không tự đặt ngưỡng cần quản lý phê duyệt vì tài liệu chưa quy định threshold.
- Schema không có cờ bắt buộc đổi mật khẩu ở lần đăng nhập kế tiếp sau reset nên giao diện không giả lập trạng thái này.
- Báo cáo không hiển thị lợi nhuận ước tính vì chưa có công thức được phê duyệt; các chỉ số doanh thu và hoàn tiền vẫn đầy đủ.
- Seed không chứa tài khoản demo hoặc secret dùng chung. Môi trường trình diễn phải cấp tài khoản nhân viên riêng trước khi chạy kịch bản bốn role.

Các mục trên là giới hạn đã biết, không làm sai các luồng đã triển khai và không được tự giải quyết bằng cách thêm cột, enum hoặc rule ngoài thiết kế.

## 18. Quy trình Git và branch

- `develop`: nhánh tích hợp phát triển và release candidate.
- `main`: nhánh ổn định; chỉ merge sau review và nghiệm thu.
- Mỗi thay đổi logic dùng một commit có phạm vi rõ ràng theo dạng `type(scope): description`.
- Chạy test/build phù hợp và review diff trước khi commit.
- Không commit `.env`, secret, credential, `.ai/`, dependency, build artifact hoặc backup binary.
- Không force-push, rebase hoặc merge `main` nếu chưa có thống nhất của nhóm.

## 19. Tài liệu dự án

- [Backend setup, test và production checklist](backend/README.md)
- [Frontend vận hành, MH-01–MH-28 và demo flow](frontend/README.md)
- [Database init, test, backup và restore](database/README.md)
- [Backend environment mẫu](backend/.env.example)
- [Frontend environment mẫu](frontend/.env.example)
