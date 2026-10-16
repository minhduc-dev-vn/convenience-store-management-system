# SQL Server security model

## Hai lớp role độc lập

Ứng dụng có bốn business role trong `dbo.VAI_TRO`: `CUSTOMER`, `CASHIER`,
`WAREHOUSE`, `MANAGER`. Backend đọc account bằng
`dbo.usp_TAI_KHOAN_LayTheoTenDangNhap`, phát JWT, rồi middleware giới hạn route.
Nguồn đọc account/role an toàn cho quản lý là `dbo.vw_TAI_KHOAN_VAI_TRO`; view
này không có `MatKhauHash`.

SQL Server có bốn database role tương ứng:

| Application role | Database role | Local login | Database user |
|---|---|---|---|
| `CUSTOMER` | `dbms_customer` | `dbms_customer_login` | `dbms_customer_user` |
| `CASHIER` | `dbms_cashier` | `dbms_cashier_login` | `dbms_cashier_user` |
| `WAREHOUSE` | `dbms_warehouse` | `dbms_warehouse_login` | `dbms_warehouse_user` |
| `MANAGER` | `dbms_manager` | `dbms_manager_login` | `dbms_manager_user` |

Đây là ánh xạ ngữ nghĩa, không phải runtime impersonation. Backend tiếp tục dùng
một technical connection pool; nó không chọn SQL login theo JWT và không chạy
`EXECUTE AS` theo request. Database roles là lớp phòng thủ/demo độc lập, không
thay thế middleware authorization.

## Ma trận least privilege

| SQL role | Table permissions | View permissions | Stored procedure permissions | Explicit DENY trọng yếu |
|---|---|---|---|---|
| `dbms_customer` | Không có quyền trực tiếp | Catalog và khuyến mãi an toàn | Không có | Account/hash, audit, stock ledger, migration history; workflow/report khác role |
| `dbms_cashier` | Không có quyền trực tiếp | Catalog, promotion, invoice, payment, return | Product/promotion lookup, open shift, checkout, invoice detail, return | Account/hash, audit, warehouse/stocktake/report, stock ledger, migration history |
| `dbms_warehouse` | Không có quyền trực tiếp | Catalog, receiving, lot, inventory, stocktake | Product/supplier/inventory lookup, receiving lifecycle, create/count stocktake | Account/hash, audit, POS/return/report, stocktake approval, stock ledger, migration history |
| `dbms_manager` | `SELECT/INSERT/UPDATE` trên category, product, promotion mapping, supplier, employee và customer; không `DELETE` | 16 safe business views, gồm account không hash, audit và report | Lookup, price history, invoice read, stocktake approval, audit query và 8 reports | Raw account/audit, mọi stock-ledger DML, migration-history DML; không có quyền DBA |

Inline TVF được cấp `SELECT` theo phạm vi: cashier chỉ bán/hoàn; warehouse chỉ
lô/tồn; manager có cả năm. Quyền ghi giao dịch được ưu tiên qua stored procedure
để ownership chaining giữ quyền bảng nền ngoài principal ứng dụng.

## GRANT, DENY và REVOKE

- `GRANT` trong migration 006 chỉ cấp đúng object cần cho từng role.
- `DENY` bảo vệ `TAI_KHOAN`, `NHAT_KY_HE_THONG`, `GIAO_DICH_KHO` và
  `SCHEMA_MIGRATIONS`, đồng thời chặn rõ các procedure xuyên vai trò có rủi ro cao.
- `DENY` được dùng có chủ đích vì nó thắng `GRANT`. Không gán một user vào nhiều
  role nghiệp vụ nếu các role có policy xung đột.
- `REVOKE` không phải policy triển khai lâu dài. Suite 13 cấp tạm quyền đọc
  `VAI_TRO` cho user test, xác minh, `REVOKE`, xác minh lại rồi rollback.

Không role nào là thành viên `db_owner`, `db_securityadmin`, `db_accessadmin`,
`db_ddladmin`, `db_datareader` hoặc `db_datawriter`. Không role nào được
`CONTROL DATABASE`, `ALTER ANY USER`, `IMPERSONATE`, `TAKE OWNERSHIP` hoặc
`ALTER ANY LOGIN`. `MANAGER` là business manager, không phải DBA.

## Migration và login

`database/migrations/006_add_dbms_database_roles.sql` là database-scoped,
transaction-compatible và không chứa `GO`, `:r`, `CREATE LOGIN` hay secret.
Server login được tạo riêng bằng script trong `database/security/` sau khi kiểm
tra `SERVERPROPERTY('IsIntegratedSecurityOnly')`.

Mật khẩu login chỉ là runtime secret: sinh riêng cho từng login, truyền qua biến
môi trường của `sqlcmd`, không dùng `-P`, không commit và không in trong output.
Xem [hướng dẫn local login](../../database/security/README.md).

## Kiểm thử

`database/tests/13_security_tests.sql` tạo bốn user tạm `WITHOUT LOGIN`, gắn
mỗi user vào đúng một role, chạy cả thao tác allowed và rejected, kiểm tra quyền
trên table/view/procedure, kiểm tra DENY ledger/migration, chứng minh manager
không có quyền DBA, thực hiện GRANT/REVOKE demo rồi rollback toàn bộ user tạm.

Khi Mixed Mode khả dụng, kiểm thử bổ sung kết nối bằng cả bốn SQL login thật và
xác minh `SUSER_SNAME()`, `USER_NAME()`, `IS_ROLEMEMBER`, một quyền được phép và
một quyền bị từ chối cho mỗi login.

## Baseline đã xác minh cục bộ

Ngày 2026-10-15, instance `MINHDUC\SQLEXPRESS` trả
`IsIntegratedSecurityOnly = 0` (Mixed Mode). Database `ConvenienceStore_DBMS`
đã áp dụng đủ migration 000–006, có đúng 4 custom database role, 4 SQL login
enabled và 4 mapped database user. Cả bốn kết nối SQL authentication thật đều
xác minh đúng login/user/role, thao tác allowed thành công và thao tác denied bị
SQL Server từ chối. Password runtime không được ghi lại trong tài liệu hoặc log.
