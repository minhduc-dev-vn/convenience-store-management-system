# DBMS demo runbook (10–15 phút)

Runbook này dùng bộ dữ liệu local Phase 7 trong `ConvenienceStore_DBMS`. Không ghi hoặc đọc password trong tài liệu; chuẩn bị bốn password demo bằng kênh runtime trước buổi trình bày.

## 0. Chuẩn bị trước giờ demo

1. Xác nhận nhánh và không làm mất thay đổi:

   ```powershell
   git branch --show-current
   git status --short
   git diff --check
   ```

2. Xác nhận SQL Server local, migrations và health:

   ```powershell
   Get-Service 'MSSQL$SQLEXPRESS'
   cd backend
   npm run db:migrate:status
   Invoke-RestMethod http://127.0.0.1:3000/api/health/db
   ```

3. Nếu account chưa có, đặt bốn biến `DBMS_DEMO_*_PASSWORD` trong terminal hiện tại và chạy `npm run db:setup-demo`. Không chiếu hoặc lưu giá trị password.
4. Chạy backend `npm start` và frontend `npm run dev -- --host 127.0.0.1` ở hai terminal riêng.
5. Mở `http://127.0.0.1:5173` và xác nhận Backend API/SQL Server đều `OK`.
6. Mở `docs/dbms/FINAL_AUDIT.md`, chỉ ra metadata 23 bảng/30 FK/163 cột, sau đó mở `ERD.md` và `NORMALIZATION_3NF.md` để xác nhận 23/23 quan hệ đạt 3NF.

## 1. Login và phân quyền (1 phút)

- Mở `/auth/login`, login `dbms_manager`, chỉ ra redirect `/manager`.
- Nêu rõ `dbms_manager` là application account trong `TAI_KHOAN`, không phải SQL login `dbms_manager_login`.
- Mở DevTools/API client nếu cần để cho thấy manager gọi cashier-only route sẽ nhận `403 FORBIDDEN`.

## 2. Manager CRUD (2 phút)

- `/manager/products`: tìm `D7PRD001`, xem category, barcode, giá, status và action đổi giá/deactivate.
- `/manager/suppliers`: tìm D7 supplier, mở edit và status.
- `/manager/promotions`: chỉ ra D7 promotion.
- Giải thích deactivate là business-safe delete: normal active listing ẩn bản ghi nhưng historical FK được giữ.

Không hard-delete master data trong buổi demo.

## 3. Warehouse receiving (2 phút)

- Login `dbms_warehouse`.
- `/warehouse/receiving`: mở receipt D7 đã `CONFIRMED`, chỉ ra supplier, detail, số lượng 24 và tổng 216.000.
- `/warehouse/inventory`: tìm `D7PRD001`, mở lot `D7-MAIN-LOT`, chỉ ra stock hiện tại.
- Nêu application path: `receiving.repository.js` → `usp_PHIEU_NHAP_LuuNhap`/`usp_PHIEU_NHAP_XacNhan` → `LO_HANG` + `GIAO_DICH_KHO IMPORT`.
- Nếu cần live mutation, tạo receipt D7 khác; không xác nhận lại receipt cũ.

## 4. Cashier sale và return (2–3 phút)

- Login `dbms_cashier`, xác nhận ca `OPEN`.
- `/cashier/pos`: tìm hoặc quét `D7-BAR-0001`; nhấn thêm để cho thấy quote do backend tính.
- Tra hóa đơn `D7SALE0000001`; chỉ ra receipt 32.000, payment và lot allocation.
- `/cashier/returns/D7SALE0000001`: chỉ ra return một đơn vị `RESALABLE`, refund 16.000.
- Nêu source evidence:
  - POS search → `ufn_SAN_PHAM_CoTheBan`;
  - checkout → `usp_HOA_DON_HoanTatBanHang`;
  - receipt → `usp_HOA_DON_LayChiTiet`;
  - return allocation → `ufn_HOA_DON_PhanBoCoTheTra`;
  - complete return → `usp_PHIEU_TRA_HoanTat`.

## 5. Stocktake (1 phút)

- Login WAREHOUSE, mở stocktake D7 và cho thấy số hệ thống/thực tế/reason.
- Login MANAGER, `/manager/stocktakes`, mở record `APPROVED`.
- Đối chiếu một `GIAO_DICH_KHO ADJUSTMENT -1` và stock cuối 22.
- Nêu concurrency/idempotency: transaction dùng lock `UPDLOCK/HOLDLOCK`; unique/filtered indexes và trạng thái finalized chặn xử lý lặp.

## 6. Reports, search và Views (2 phút)

- `/manager/reports/revenue`: kỳ 2026-10-01 → 2026-10-16, gross 32.000, refund 16.000, net 16.000.
- `/manager/reports/merchandise`: xem D7 product/inventory.
- `/manager/reports/workforce`: xem cashier/shift.
- `/manager/audit-logs`: tìm D7 stocktake/receipt record.
- Chỉ ra các View representative:
  - account admin/auth → `vw_TAI_KHOAN_VAI_TRO`;
  - product admin → `vw_SAN_PHAM_DANH_MUC`;
  - stocktake/audit/report → `vw_KIEM_KE_CHI_TIET`, `vw_NHAT_KY_HE_THONG_CHI_TIET`, `vw_BAO_CAO_TON_KHO_HIEN_TAI`.

## 7. Validation và transaction rollback (1 phút)

Trình bày kết quả đã lưu trong `APPLICATION_INTEGRATION.md`:

- receipt detail có manufacture date sau expiry date → `400 VALIDATION_ERROR`, không tạo lot/movement;
- checkout 99.999 đơn vị → `409 INSUFFICIENT_STOCK`, 0 invoice/payment/movement;
- confirm receipt lần hai → `409 RECEIPT_ALREADY_CONFIRMED`, không duplicate movement;
- response không lộ raw SQL hoặc stack trace.

## 8. Trigger direct-DML guard (1 phút)

Chạy trong transaction để không để lại dữ liệu:

```sql
BEGIN TRANSACTION;
BEGIN TRY
    UPDATE dbo.LO_HANG
    SET SoLuongTon = SoLuongTon - 999999
    WHERE SoLo = 'D7-MAIN-LOT';
END TRY
BEGIN CATCH
    SELECT ERROR_NUMBER() AS ErrorNumber, ERROR_MESSAGE() AS GuardMessage;
END CATCH;
ROLLBACK TRANSACTION;
```

Sau đó mở `docs/dbms/TRIGGERS.md` để chỉ ra 5 trigger, multi-row atomicity và các direct-DML guards khác.

## 9. SQL roles (1 phút)

```sql
SELECT role_principal.name AS DatabaseRole, member_principal.name AS MemberName
FROM sys.database_role_members AS membership
JOIN sys.database_principals AS role_principal
  ON role_principal.principal_id = membership.role_principal_id
JOIN sys.database_principals AS member_principal
  ON member_principal.principal_id = membership.member_principal_id
WHERE role_principal.name IN ('dbms_customer', 'dbms_cashier', 'dbms_warehouse', 'dbms_manager')
ORDER BY role_principal.name;
```

Giải thích Phase 5 là SQL least-privilege defense-in-depth; application RBAC vẫn do JWT/middleware quyết định. Chỉ ra `GRANT`/`DENY` trong migration 006 và controlled `GRANT` → `REVOKE` được rollback an toàn tại `database/tests/13_security_tests.sql` dòng demo tương ứng; không cấp quyền thử trực tiếp trên Main trong buổi trình bày.

## 10. Index evidence (1 phút)

- Mở `docs/dbms/INDEXES.md` và `database/benchmarks/results/`.
- Nêu benchmark chạy trên `ConvenienceStoreIndexBenchmarkTest`, không chạy bulk seed trên Main.
- Cho xem một before/after actual plan và IO/TIME result; không cần chạy lại benchmark trong buổi demo.

## 11. Connection-loss contract (30 giây)

- Bình thường: `/api/health/db` → `200 ok`.
- Khi SQL endpoint không khả dụng: → `503 DATABASE_UNAVAILABLE`, message ổn định và không lộ driver.
- Sau khi SQL trở lại: pool reconnect, health → `200`, D7 data còn nguyên.
- Chỉ stop/start Windows service trực tiếp nếu terminal có quyền quản trị, luôn dùng `try/finally` để bật service lại.

## 12. Kết thúc

- Không chạy cleanup trước khi giảng viên xem dữ liệu.
- Không chạy `init.sql`, benchmark seed hoặc security cleanup trên Main.
- Không commit password, `.env`, token, `.bak` hoặc artifact runtime.
- Không cần trình bày toàn bộ 29 stored procedures; representative objects ở trên đã đủ nối frontend → API → repository → SQL.
