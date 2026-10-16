# Application ↔ SQL Server integration

Tài liệu này ghi lại bằng chứng runtime của Phase 7 trên nhánh `dbms-requirements`. Phase này không thêm table, constraint, view, stored procedure, function, trigger, index, SQL role hoặc migration mới. Runtime được xác minh ngày 2026-10-16 trên frontend `http://127.0.0.1:5173`, backend `http://127.0.0.1:3000` và database local `ConvenienceStore_DBMS` tại `.\SQLEXPRESS`.

## 1. Kiến trúc chạy local

```text
React/Vite :5173
  -> REST/JSON + JWT
Express :3000
  -> route -> auth/RBAC -> controller -> service -> repository
  -> mssql + msnodesqlv8 + Windows trusted connection
SQL Server .\SQLEXPRESS / ConvenienceStore_DBMS
  -> View / Stored Procedure / UDF / Trigger / transaction
```

Frontend dùng `VITE_API_BASE_URL=/api`; Vite proxy tới `DEV_API_PROXY_TARGET=http://127.0.0.1:3000`. Backend local dùng `DB_DRIVER=msnodesqlv8`, `DB_SERVER=localhost`, `DB_INSTANCE=SQLEXPRESS`, `DB_NAME=ConvenienceStore_DBMS` và `DB_TRUSTED_CONNECTION=true`. Không có request tới Render, Azure SQL hoặc Vercel trong phiên xác minh.

JWT và application RBAC là lớp xác thực của ứng dụng. Bốn application account trong `dbo.TAI_KHOAN` hoàn toàn khác bốn SQL Server login `dbms_*_login` của Phase 5. Backend vẫn dùng một technical connection pool; không đổi SQL connection theo JWT và không impersonate SQL principal.

## 2. Tạo application demo accounts

Utility local là `backend/scripts/setup-dbms-demo-accounts.js`, chạy qua `npm run db:setup-demo`. Utility:

- chỉ chấp nhận `NODE_ENV` khác production;
- chỉ chấp nhận database đúng tên `ConvenienceStore_DBMS` trên host local;
- yêu cầu `msnodesqlv8` và Windows trusted authentication;
- hash password bằng bcrypt/config hiện có, không hash bằng SQL;
- tạo owner và account trong một transaction `SERIALIZABLE`;
- idempotent, không duplicate owner/account và không đổi password khi chạy lại;
- từ chối ghi đè nếu ID/username dành riêng đã chứa dữ liệu không đúng invariant;
- chỉ đổi password khi truyền rõ `--reset-password`;
- không log password hoặc hash.

Thiết lập bốn password chỉ trong terminal hiện tại rồi chạy utility:

```powershell
cd backend
$env:DBMS_DEMO_MANAGER_PASSWORD='<runtime-only>'
$env:DBMS_DEMO_CASHIER_PASSWORD='<runtime-only>'
$env:DBMS_DEMO_WAREHOUSE_PASSWORD='<runtime-only>'
$env:DBMS_DEMO_CUSTOMER_PASSWORD='<runtime-only>'
npm run db:setup-demo
```

Không đưa các giá trị runtime vào `.env`, SQL, source, test, tài liệu hoặc Git. Dùng `npm run db:setup-demo -- --reset-password` chỉ khi chủ động muốn đặt lại cả bốn password từ các biến môi trường trên.

| Role | Username | Owner | Trạng thái runtime |
| --- | --- | --- | --- |
| `MANAGER` | `dbms_manager` | `D7MGR001` | `ACTIVE`, login PASS |
| `CASHIER` | `dbms_cashier` | `D7CSH001` | `ACTIVE`, login PASS |
| `WAREHOUSE` | `dbms_warehouse` | `D7WH001` | `ACTIVE`, login PASS |
| `CUSTOMER` | `dbms_customer` | `D7CUS001` | `ACTIVE`, login PASS |

## 3. Authorization matrix

Ma trận dưới đây được kiểm tra bằng HTTP trực tiếp, không chỉ bằng frontend route guard.

| Feature | CUSTOMER | CASHIER | WAREHOUSE | MANAGER |
| --- | --- | --- | --- | --- |
| Hồ sơ/điểm/hóa đơn của chính khách hàng | Allowed | Denied | Denied | Denied |
| POS, ca, checkout, return | Denied | Allowed | Denied | Denied |
| Nhập kho và ghi nhận kiểm kê | Denied | Denied | Allowed | Denied |
| Tồn kho dùng chung | Denied | Denied | Allowed | Allowed |
| Master data, account, audit, report | Denied | Denied | Denied | Allowed |
| Phê duyệt kiểm kê | Denied | Denied | Denied | Allowed |

Kết quả representative: endpoint đúng role trả `200/201`; ba cross-role route của CUSTOMER, hai route của CASHIER, hai route của WAREHOUSE và một cashier-only route với MANAGER đều trả `403 FORBIDDEN`.

## 4. CRUD matrix

`Deactivate` là business-safe delete. Bản ghi không còn xuất hiện trong normal active listing nhưng historical FK vẫn được giữ; Phase 7 không thêm hard delete.

| Entity | Create | Read/search | Update | Delete/deactivate | Role | Runtime |
| --- | --- | --- | --- | --- | --- | --- |
| Category `D7CAT001` | Yes | Yes | Yes | Deactivate/reactivate | MANAGER | PASS |
| Product `D7PRD001` | Yes | Yes | Yes + đổi giá | Deactivate/reactivate | MANAGER | PASS |
| Supplier `D7SUP001` | Yes | Yes | Yes | Deactivate/reactivate | MANAGER | PASS |
| Promotion `D7PROMO001` | Yes | Yes | Yes | Deactivate/reactivate | MANAGER | PASS |
| Customer profile `D7CUS001` | Existing fixture | Own profile | Address | Account lock/unlock | CUSTOMER/MANAGER | PASS |
| Receiving receipt | Draft | List/detail/search | Header + detail | Cancel for draft | WAREHOUSE | PASS |

## 5. Runtime business flows

### Customer

Login, profile, address update, loyalty và invoice history đều trả `200`. Khách hàng chỉ truy cập dữ liệu gắn với `D7CUS001`. Password change được kiểm tra: password cũ trả `401`, password mới login thành công, sau đó credential demo được đặt lại bằng cơ chế runtime. Sau giao dịch POS, điểm và lịch sử phản ánh dữ liệu của đúng customer.

### Warehouse receiving

Phiếu nhập local được tạo cho `D7SUP001`, thêm detail `D7PRD001`/`D7-MAIN-LOT`, sửa số lượng thành 24 và xác nhận. DB assertion:

- `PHIEU_NHAP`: `CONFIRMED`, tổng tiền 216.000;
- `CHI_TIET_PHIEU_NHAP`: đúng một detail;
- `LO_HANG`: tạo đúng lô, ban đầu tồn 24;
- `GIAO_DICH_KHO`: đúng một `IMPORT`, biến động `+24`;
- xác nhận lần hai trả `409 RECEIPT_ALREADY_CONFIRMED`, số movement không tăng.

Detail có ngày sản xuất sau hạn sử dụng trả `400 VALIDATION_ERROR`; không tạo lot, movement hoặc làm đổi tổng phiếu.

### Cashier sale và return

Cashier mở ca, tìm theo mã/tên, tra barcode, lấy quote từ server, checkout hóa đơn `D7SALE0000001`, tra receipt và tra invoice. DB assertion sau checkout:

- `HOA_DON`: một bản ghi `PAID`, tổng 32.000;
- `CHI_TIET_HOA_DON`: một line, số lượng 2;
- `CHI_TIET_XUAT_LO`: allocation từ lô D7 theo FEFO;
- `THANH_TOAN`: một payment thành công;
- `GIAO_DICH_KHO`: một `SALE`, stock 24 → 22.

Return một đơn vị `RESALABLE` tạo `PHIEU_TRA`/`CHI_TIET_PHIEU_TRA`, refund 16.000, một movement `RETURN +1` và stock 22 → 23. Hóa đơn vẫn `PAID` vì chỉ trả một phần.

Checkout 99.999 đơn vị trả `409 INSUFFICIENT_STOCK`. DB có 0 invoice, 0 payment và 0 movement cho request lỗi, chứng minh rollback/no partial write.

### Stocktake

WAREHOUSE tạo snapshot, ghi số thực tế thấp hơn một đơn vị với reason và gửi duyệt. MANAGER thấy proposal pending và approve. `KIEM_KE` thành `APPROVED`, `GIAO_DICH_KHO` có đúng một `ADJUSTMENT -1`, stock 23 → 22. Approve/update lại một stocktake đã finalized bị từ chối theo contract hiện có.

### Account administration

- Manager reset password cashier bằng password runtime ngẫu nhiên: credential cũ fail, credential mới pass; sau đó khôi phục credential demo và xác minh lại.
- Manager lock `D7CUS001`: login mới và protected request với token cũ đều trả `403 ACCOUNT_LOCKED`; unlock xong login lại thành công.
- Chuyển `D7CSH001` sang `INACTIVE`: authentication trả `403 ACCOUNT_INACTIVE`; khôi phục `ACTIVE` xong login lại thành công.

## 6. Application ↔ database evidence matrix

| Feature | Frontend route | API | Repository | SQL object | Runtime |
| --- | --- | --- | --- | --- | --- |
| Login | `/auth/login` | `POST /api/auth/login` | `auth.repository.js` | `usp_TAI_KHOAN_LayTheoTenDangNhap` | PASS, 4 roles |
| Account lookup/RBAC | role portals | protected APIs | `auth.repository.js`, `admin.repository.js` | `vw_TAI_KHOAN_VAI_TRO` | PASS |
| Product CRUD/search | `/manager/products` | `/api/admin/products` | `product.repository.js` | `vw_SAN_PHAM_DANH_MUC` + catalog SPs | PASS |
| POS search/barcode | `/cashier/pos` | `/api/pos/products...` | `pos.repository.js` | `ufn_SAN_PHAM_CoTheBan` | PASS |
| Open shift | `/cashier` | `POST /api/pos/shifts/open` | `pos.repository.js` | `usp_CA_LAM_VIEC_Mo` | PASS |
| Checkout | `/cashier/pos` | `POST /api/pos/checkouts` | `pos.repository.js` | `usp_HOA_DON_HoanTatBanHang` | PASS |
| Receipt | `/cashier/receipts/:id` | `GET /api/pos/invoices/:id` | `pos.repository.js` | `usp_HOA_DON_LayChiTiet` | PASS |
| Return allocation | `/cashier/returns/:id` | `GET /api/invoices/:id` | `invoice.repository.js` | `ufn_HOA_DON_PhanBoCoTheTra` | PASS |
| Complete return | `/cashier/returns/:id` | `POST /api/returns` | `return.repository.js` | `usp_PHIEU_TRA_HoanTat` | PASS |
| Receiving | `/warehouse/receiving...` | `/api/warehouse/receiving...` | `receiving.repository.js` | `usp_PHIEU_NHAP_LuuNhap`, `usp_PHIEU_NHAP_XacNhan` | PASS |
| Inventory | `/warehouse/inventory` | `/api/inventory/...` | `inventory.repository.js` | inventory lookup SPs | PASS |
| Stocktake | `/warehouse/stocktakes` | `/api/warehouse/stocktakes...` | `stocktake.repository.js` | `vw_KIEM_KE_CHI_TIET`, `usp_KIEM_KE_Tao`, `usp_KIEM_KE_PheDuyetDieuChinh` | PASS |
| Audit search | `/manager/audit-logs` | `GET /api/admin/audit-logs` | `audit.repository.js` | `vw_NHAT_KY_HE_THONG_CHI_TIET` | PASS |
| Inventory report | `/manager/reports/merchandise` | `GET /api/admin/reports/inventory` | `reporting.repository.js` | `vw_BAO_CAO_TON_KHO_HIEN_TAI` | PASS |
| Revenue/workforce/receiving | `/manager/reports/...` | `/api/admin/reports/...` | `reporting.repository.js` | reporting SPs/views | PASS, non-empty |

Hai UDF application-facing được chứng minh đồng thời bằng source, integration tests và runtime POS/invoice. Representative stored procedures ở bảng trên thực sự được repository gọi trong phiên runtime; không phải SQL demo tách khỏi application.

## 7. Search và report

Application search đã chạy qua API/UI cho product, barcode, invoice, supplier, inventory lot và audit record. Manager reports đã chạy trong khoảng 2026-10-01 đến 2026-10-31:

- revenue: 1 completed invoice, gross 32.000, refund 16.000, net 16.000;
- products/merchandise: có `D7PRD001`;
- inventory: có D7 product và stock cuối 22;
- receiving: 1 confirmed receipt;
- workforce/shifts: có `D7CSH001` và ca #1.

## 8. Invalid input và error contract

| Case | HTTP/code | Partial write |
| --- | --- | --- |
| Thiếu `supplierId` | `400 VALIDATION_ERROR` | No |
| Manufacture date sau expiry date | `400 VALIDATION_ERROR` | No lot/movement/total change |
| Checkout có field không hỗ trợ | `400 VALIDATION_ERROR` | No |
| Date range report đảo ngược | `400 VALIDATION_ERROR` | No |
| Account ID sai định dạng | `400 VALIDATION_ERROR` | No |
| Account status sai enum | `400 VALIDATION_ERROR` | No |
| Insufficient stock | `409 INSUFFICIENT_STOCK` | No invoice/payment/movement |
| Xác nhận receipt lần hai | `409 RECEIPT_ALREADY_CONFIRMED` | No duplicate movement |

Response không chứa raw SQL error, ODBC/driver internals, stack trace hoặc đường dẫn `node_modules`.

## 9. Database connection loss

Tiến trình hiện tại không có quyền Windows Service Control (`OpenService FAILED 5: Access is denied`), nên không tắt được `MSSQL$SQLEXPRESS`; service được xác minh vẫn `Running` và không bị bỏ ở trạng thái lỗi. Contract lỗi trước hết được kiểm tra bằng một backend local cô lập trên port 3001 trỏ tới SQL endpoint local không khả dụng. Sau đó, để chứng minh cả recovery của connection pool mà không làm gián đoạn Main DB, backend cô lập được nối tới `ConvenienceStoreDBMS_Test`, database test được đưa `OFFLINE` rồi luôn khôi phục `ONLINE` trong `finally`. Kết quả:

- `GET /api/health/db` → `503`;
- code → `DATABASE_UNAVAILABLE`;
- message → `Database connection is unavailable`;
- không lộ raw SQL/ODBC/driver detail;
- khi Test DB `OFFLINE`, cùng endpoint health trên backend cô lập trả đúng `503 DATABASE_UNAVAILABLE`;
- Test DB được khôi phục `ONLINE`, cùng pool hồi phục `200 ok` ngay lần kiểm tra đầu tiên;
- đủ 7 migration vẫn còn trong Test DB sau recovery;
- tiến trình cô lập được dừng;
- backend chính/Main DB không bị đưa offline; health Main đã trả `200 ok` và `D7PRD001` cùng toàn bộ transaction data vẫn đọc được sau phép thử.

Trên máy có quyền quản trị service, có thể thay bước mô phỏng bằng `Stop-Service 'MSSQL$SQLEXPRESS'`, gọi hai endpoint, rồi luôn `Start-Service` trong `finally`.

## 10. UI smoke

Computer Use trên Brave, cửa sổ 1536×816, xác minh trực tiếp:

| Khu vực | URL | Kết quả |
| --- | --- | --- |
| Public + health | `/` | Backend và SQL Server `OK` |
| Login | `/auth/login` | Form rõ, Enter submit, role redirect đúng |
| Customer | `/customer` | Profile, loyalty, history navigation hiển thị đúng |
| Cashier POS | `/cashier/pos` | OPEN shift, empty cart, D7 search result, quote/checkout controls |
| Warehouse receiving | `/warehouse/receiving/new` | Supplier/date/note form và save action rõ |
| Warehouse inventory | `/warehouse/inventory` | D7 product, stock 22, filters/table rõ |
| Manager products | `/manager/products` | D7 product row và actions |
| Manager suppliers | `/manager/suppliers` | D7 supplier row và actions |
| Manager report | `/manager/reports/revenue` | Non-empty KPI/table, date filters |

Không thấy horizontal overflow hoặc modal/table blocking ở desktop. Sidebar MANAGER có scroll riêng vì danh sách chức năng dài; đây là behavior hợp lệ, không phải blocker. Password-manager popup là UI của Brave, không thuộc application. Không redesign frontend trong Phase 7.

## 11. Demo data và cleanup policy

Persistent local demo data dùng prefix/ID dễ nhận biết: `D7...`, username `dbms_*` và email `.invalid`. Bộ account, master data, receipt, sale, return và stocktake được giữ trong Main DB local để demo. Automated test fixtures ở test database vẫn rollback/delete theo suite.

Không chạy `init.sql` hoặc benchmark seed trên Main chỉ để cleanup. Cách an toàn nhất sau buổi demo là restore/recreate riêng database demo từ baseline đã backup. Nếu cần targeted cleanup, trước tiên preview mọi row liên quan tới các owner/master IDs `D7MGR001`, `D7CSH001`, `D7WH001`, `D7CUS001`, `D7CAT001`, `D7PRD001`, `D7SUP001`, `D7PROMO001`; sau đó xóa trong một transaction theo thứ tự dependency: audit → stock movements/details/stocktakes → return details/returns → payments/lot allocations/invoice details/invoices → receiving details/receipts → lots → promotion links/promotion → product/category/supplier → accounts → customer/employees. Chỉ commit khi mọi predicate đều giới hạn vào D7 IDs; rollback nếu bất kỳ row ngoài phạm vi xuất hiện. Không xóa bốn SQL Server login Phase 5.

## 12. Kết luận

Frontend local → backend local → SQL Server local đã được chứng minh bằng runtime. Login/RBAC, CRUD, search, report, View/SP/UDF integration, transaction rollback, validation, connection-loss contract và UI đều đạt yêu cầu Phase 7. Không có migration 007 và không có DBMS object mới.
