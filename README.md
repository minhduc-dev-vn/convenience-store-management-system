# Convenience Store Management System

Hệ thống web quản lý một cửa hàng tiện lợi, phục vụ bán hàng tại quầy, quản lý kho theo lô và các nghiệp vụ vận hành liên quan.

## Technology stack

- Frontend: ReactJS, JavaScript, Vite, React Router (sẽ được triển khai ở các prompt sau).
- Backend: Node.js, ExpressJS, REST API, JSON.
- Database: Microsoft SQL Server (sẽ được triển khai ở các prompt sau).

## Run the backend

Yêu cầu Node.js 20 trở lên.

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Nếu dùng PowerShell, có thể tạo file môi trường bằng lệnh:

```powershell
Copy-Item .env.example .env
```

Backend mặc định chạy tại `http://localhost:3000`. Kiểm tra process bằng:

```text
GET http://localhost:3000/api/health
```

Endpoint health không phụ thuộc kết nối cơ sở dữ liệu.

## Backend scripts

- `npm run dev`: chạy server ở chế độ watch.
- `npm start`: chạy server.
- `npm test`: chạy test bằng test runner tích hợp của Node.js.

## Backend structure

```text
backend/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── repositories/
│   ├── routes/
│   ├── services/
│   └── utils/
└── tests/
```
