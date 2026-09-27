# 1. Convenience Store Management System

Hệ thống quản lý cửa hàng tiện lợi

## 2. Giới thiệu / Tổng quan dự án

Convenience Store Management System là ứng dụng web hỗ trợ vận hành một cửa hàng tiện lợi. Hệ thống hướng đến việc quản lý tập trung hoạt động bán hàng tại quầy, hàng hóa theo lô, nhập kho, kiểm kê, khách hàng thành viên, khuyến mãi, tài khoản và báo cáo quản trị.

Phạm vi dự án dành cho một cửa hàng và một kho bán hàng đi kèm; không bao gồm mô hình nhiều chi nhánh, đặt hàng trực tuyến, giao hàng hoặc cổng thanh toán thật.

## 3. Mục tiêu dự án

- Chuẩn hóa quy trình bán hàng và quản lý ca làm việc tại quầy.
- Theo dõi tồn kho theo sản phẩm, lô hàng và hạn sử dụng.
- Hỗ trợ nhập hàng, kiểm kê và kiểm soát điều chỉnh tồn kho.
- Quản lý khách hàng thành viên, điểm tích lũy và lịch sử mua hàng.
- Quản lý sản phẩm, nhà cung cấp, khuyến mãi, nhân viên và tài khoản.
- Cung cấp dữ liệu phục vụ tra cứu, kiểm soát hoạt động và báo cáo kinh doanh.
- Bảo đảm tính toàn vẹn dữ liệu bằng ràng buộc và transaction trên SQL Server.

## 4. Chức năng chính

Các nhóm chức năng dưới đây là phạm vi nghiệp vụ của hệ thống. Tình trạng triển khai hiện tại được trình bày tại mục 12.

### Khách hàng

- Đăng ký, đăng nhập và đổi mật khẩu.
- Cập nhật hồ sơ cá nhân.
- Xem sản phẩm và chương trình khuyến mãi.
- Xem hóa đơn, lịch sử mua hàng và điểm tích lũy.

### Thu ngân

- Mở ca, đóng ca và đối chiếu tiền cuối ca.
- Quét mã vạch hoặc tìm kiếm sản phẩm.
- Lập hóa đơn, áp dụng khuyến mãi và ghi nhận thanh toán.
- In, xem, tra cứu hóa đơn và xử lý đổi/trả hàng.

### Nhân viên kho

- Lập phiếu nhập và xác nhận nhập kho.
- Tra cứu tồn kho theo sản phẩm và lô hàng.
- Theo dõi hạn sử dụng và cảnh báo tồn thấp.
- Thực hiện kiểm kê, ghi nhận số lượng thực tế và lập đề nghị điều chỉnh tồn.

### Quản lý

- Quản lý nhà cung cấp, sản phẩm, giá bán và khuyến mãi.
- Quản lý nhân viên, tài khoản và phân quyền.
- Duyệt điều chỉnh kho.
- Tra cứu nhật ký thao tác và xem báo cáo kinh doanh.

## 5. Công nghệ sử dụng

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | ReactJS, JavaScript, Vite, React Router |
| Backend | Node.js, ExpressJS |
| API | REST, JSON |
| Database | Microsoft SQL Server |
| SQL Server client | `mssql`, `tedious`, `msnodesqlv8` |
| Kiểm thử backend | Node.js test runner |

Backend được tổ chức theo luồng `Route -> Middleware -> Controller -> Service -> Repository -> SQL Server`.

## 6. Cấu trúc thư mục project

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
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── routes/
│   │   └── services/
│   └── .env.example
├── database/
│   ├── constraints/
│   ├── indexes/
│   ├── procedures/
│   ├── schema/
│   ├── seed/
│   ├── tests/
│   ├── views/
│   └── init.sql
├── .gitignore
└── README.md
```

## 7. Thiết kế cơ sở dữ liệu

Cơ sở dữ liệu gồm 23 bảng cốt lõi, được chia thành các nhóm:

- Tài khoản và nhân sự: `VAI_TRO`, `NHAN_VIEN`, `KHACH_HANG`, `TAI_KHOAN`, `CA_LAM_VIEC`.
- Danh mục và khuyến mãi: `LOAI_SAN_PHAM`, `SAN_PHAM`, `KHUYEN_MAI`, `KHUYEN_MAI_SAN_PHAM`.
- Nhà cung cấp và kho: `NHA_CUNG_CAP`, `PHIEU_NHAP`, `LO_HANG`, `CHI_TIET_PHIEU_NHAP`, `KIEM_KE`, `CHI_TIET_KIEM_KE`, `GIAO_DICH_KHO`.
- Bán hàng và đổi trả: `HOA_DON`, `CHI_TIET_HOA_DON`, `CHI_TIET_XUAT_LO`, `THANH_TOAN`, `PHIEU_TRA`, `CHI_TIET_PHIEU_TRA`.
- Nhật ký hệ thống: `NHAT_KY_HE_THONG`.

Schema sử dụng PK, FK, UNIQUE, CHECK, DEFAULT và index để bảo vệ tính toàn vẹn dữ liệu. Tồn kho được quản lý theo lô; các thao tác nhiều bước được thiết kế để thực hiện trong transaction.

Runner `database/init.sql` dựng lại schema, constraints, indexes, dữ liệu nền và các stored object theo đúng thứ tự phụ thuộc. Script này sẽ xóa và dựng lại 23 bảng core, vì vậy chỉ được chạy trên database development hoặc test đã chọn rõ ràng.

## 8. Hướng dẫn cài đặt

### Yêu cầu hệ thống

- Node.js 20 trở lên.
- npm.
- Microsoft SQL Server 2016 trở lên.
- `sqlcmd` để chạy database scripts.

### Cài dependencies backend

```bash
cd backend
npm install
```

### Cài dependencies frontend

Mở terminal khác từ thư mục root:

```bash
cd frontend
npm install
```

## 9. Cấu hình môi trường

Không commit file `.env` hoặc credential thật vào repository.

### Backend

Tạo `backend/.env` từ file mẫu:

```bash
cd backend
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Các nhóm biến chính:

| Biến | Mục đích |
| --- | --- |
| `PORT` | Port của backend, mặc định `3000` |
| `DB_DRIVER` | Chọn `tedious` hoặc `msnodesqlv8` |
| `DB_SERVER`, `DB_INSTANCE`, `DB_PORT` | Địa chỉ SQL Server |
| `DB_NAME` | Tên database |
| `DB_USER`, `DB_PASSWORD` | SQL authentication khi không dùng trusted connection |
| `DB_TRUSTED_CONNECTION` | Bật Windows trusted connection với `msnodesqlv8` |
| `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE` | Thiết lập mã hóa kết nối |
| `DB_POOL_MAX`, `DB_POOL_MIN`, `DB_POOL_IDLE_TIMEOUT_MS` | Cấu hình connection pool |

### Frontend

Tạo `frontend/.env` từ file mẫu:

```bash
cd frontend
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

| Biến | Mục đích |
| --- | --- |
| `VITE_API_BASE_URL` | Base URL gọi REST API; mặc định `/api` trong file mẫu |
| `DEV_API_PROXY_TARGET` | Backend target cho Vite development proxy |

## 10. Hướng dẫn chạy project

### Bước 1: Khởi tạo database

Tạo trước một database development hoặc test, sau đó mở terminal tại thư mục `database/` và chạy:

```powershell
sqlcmd -S ".\SQLEXPRESS" -E -I -d "ConvenienceStore" -b -f 65001 -i ".\init.sql"
```

Thay server và tên database theo môi trường của bạn. Xem hướng dẫn SQL Server đầy đủ tại [database/README.md](database/README.md).

### Bước 2: Chạy backend

```bash
cd backend
npm run dev
```

Chạy không dùng watch mode:

```bash
npm start
```

Backend mặc định phục vụ tại `http://localhost:3000`.

### Bước 3: Chạy frontend

Mở terminal khác từ thư mục root:

```bash
cd frontend
npm run dev
```

Vite development server mặc định phục vụ tại `http://127.0.0.1:5173`.

### Build và kiểm thử

```bash
cd backend
npm test
```

```bash
cd frontend
npm run build
```

## 11. API Overview

API sử dụng JSON và tiền tố `/api`. Các endpoint hiện có:

| Method | Endpoint | Mô tả | Phụ thuộc database |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Kiểm tra trạng thái process backend | Không |
| `GET` | `/api/health/db` | Kiểm tra kết nối SQL Server | Có |

Response thành công tuân theo cấu trúc:

```json
{
  "success": true,
  "data": {}
}
```

Response lỗi tuân theo cấu trúc:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Mô tả lỗi"
  }
}
```

## 12. Trạng thái phát triển project

Đã hoàn thành:

- Cấu trúc backend Express và REST API cơ bản.
- Frontend React/Vite, routing theo vai trò và các component trạng thái dùng chung.
- API client dùng chung với base URL lấy từ environment.
- Schema SQL Server 23 bảng, constraints, indexes và dữ liệu nền.
- Connection pool, repository base, transaction helper và database health check.
- Database support cho account, role lookup và audit log.

Đang phát triển:

- Xác thực và phân quyền ở tầng API.
- Các màn hình và API nghiệp vụ cho khách hàng, thu ngân, nhân viên kho và quản lý.
- Các transaction nghiệp vụ nhập hàng, bán hàng, đổi trả và điều chỉnh kho.
- Báo cáo và kiểm thử luồng nghiệp vụ hoàn chỉnh.

## 13. Quy trình Git / Branch

- `main`: nhánh ổn định dùng cho phiên bản phát hành.
- `develop`: nhánh tích hợp cho quá trình phát triển.
- Không tạo feature branch trong quy trình hiện tại.
- Mỗi thay đổi logic được tách thành một commit có phạm vi rõ ràng.
- Commit message sử dụng dạng ngắn gọn như `type(scope): description`.
- Luôn kiểm tra build/test và review diff trước khi commit hoặc push.
- Không commit `.env`, secret, credential, `node_modules/` hoặc build artifacts.

## 14. Tài liệu dự án

- [Hướng dẫn database và SQL Server](database/README.md)
- [Cấu hình backend mẫu](backend/.env.example)
- [Cấu hình frontend mẫu](frontend/.env.example)
