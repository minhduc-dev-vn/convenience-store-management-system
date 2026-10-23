# Final DBMS rubric matrix

Ngày audit: 2026-10-16. Nhánh: `dbms-requirements`. Trạng thái trong bảng chỉ dùng `PASS`, `PARTIAL`, `FAIL`, `N/A`; `PASS` luôn có source, test và/hoặc bằng chứng runtime cụ thể.

## A. Database design

| Requirement | Required | Actual | Status | Source | Test | Demo evidence |
|---|---:|---|---|---|---|---|
| Microsoft SQL Server | SQL Server | SQL Server 2022 Express `16.0.1210.3`, Main `ConvenienceStore_DBMS` | PASS | [`database/README.md`](../../database/README.md) | [`database/tests/run_all.sql`](../../database/tests/run_all.sql) | `@@VERSION`, Main `ONLINE` |
| ERD | Có | ERD đủ 23 entity, 30 relationship | PASS | [`ERD.md`](./ERD.md) | Metadata FK trong test 10 | Mở Mermaid ERD và đối chiếu metadata |
| Relational schema | Có | 23 relation, PK/AK/FK/nullability đầy đủ | PASS | [`RELATIONAL_SCHEMA.md`](./RELATIONAL_SCHEMA.md) | [`10_integrity_packaging_tests.sql`](../../database/tests/10_integrity_packaging_tests.sql) | Đối chiếu 23 bảng runtime |
| Ít nhất 8 bảng liên quan | `>= 8` | 23 core table, 30 FK | PASS | [`database/schema/`](../../database/schema/) | Test 10 | Metadata: 23 table, 30 FK |
| Ít nhất 3NF | 3NF | 23/23 relation đạt 3NF cho dữ liệu gốc; computed snapshot được công bố | PASS | [`NORMALIZATION_3NF.md`](./NORMALIZATION_3NF.md), migration [`003`](../../database/migrations/003_normalize_inventory_transaction_3nf.sql) | Migration 003 E2E + test 10 | `GIAO_DICH_KHO.MaSP` không còn ở final schema |
| Primary key | Có | 23 PK trên 23 core table | PASS | [`database/schema/`](../../database/schema/) | Test 10 | Metadata: 23 PK |
| Foreign key | Có | 30 FK, enabled/trusted | PASS | [`RELATIONAL_SCHEMA.md`](./RELATIONAL_SCHEMA.md) | Test 10 | Metadata: 30 FK |
| Integrity constraints | Có | 56 CHECK, 41 DEFAULT, 8 UNIQUE, PK/FK và filtered unique index | PASS | [`database/constraints/`](../../database/constraints/), [`DATA_DICTIONARY.md`](./DATA_DICTIONARY.md) | Tests 01–10 | Negative DML bị từ chối, suite rollback sạch |

## B. Constraints, triggers, views and indexes

| Requirement | Required | Actual | Status | Source | Test | Demo evidence |
|---|---:|---|---|---|---|---|
| Meaningful CHECK/UNIQUE/DEFAULT | `>= 5` | 56 CHECK + 8 UNIQUE + 41 DEFAULT; owner, date, status, quantity, secret-safety rules | PASS | [`database/constraints/`](../../database/constraints/), schema DDL | Tests 01, 02, 03, 10 | Xem năm negative cases trong [`FINAL_AUDIT.md`](./FINAL_AUDIT.md) |
| Triggers | `>= 5` | Đúng 5 application trigger, đều enabled | PASS | [`database/triggers/`](../../database/triggers/), migration [`005`](../../database/migrations/005_add_dbms_business_triggers.sql), [`TRIGGERS.md`](./TRIGGERS.md) | [`12_trigger_tests.sql`](../../database/tests/12_trigger_tests.sql) | Direct-DML guard trong [`DEMO_RUNBOOK.md`](./DEMO_RUNBOOK.md) |
| Views | `>= 5` | 16 view | PASS | [`database/views/`](../../database/views/) | Tests 01–10 | App dùng account/product/stocktake/audit/inventory-report views |
| Indexes | `>= 5` | 43 standalone index ngoài 23 PK và 8 UQ-backed index | PASS | [`database/indexes/`](../../database/indexes/) | [`14_index_inventory_tests.sql`](../../database/tests/14_index_inventory_tests.sql) | Metadata inventory |
| Non-PK index | `>= 1` | 43; gồm unique, filtered và covering | PASS | [`INDEXES.md`](./INDEXES.md) | Test 14 | `UQ_TAI_KHOAN_TenDangNhap` và bốn workload khác |
| Giải thích index rationale | Có | Rationale theo login, FEFO/tồn, report, audit, receiving | PASS | [`INDEXES.md`](./INDEXES.md) | Definition inventory test | Bảng workload → index → caller |
| Evidence cải thiện hiệu năng | Có | 5 before/after actual plan; reads giảm 20.59%–99.76% | PASS | [`database/benchmarks/results/`](../../database/benchmarks/results/) | `Equivalent=true` cho 5/5 | Mở cặp `.sqlplan` và CSV/JSON/Markdown |
| Benchmark không làm bẩn Main | Bắt buộc | Chạy riêng trên `ConvenienceStoreIndexBenchmarkTest`, đã cleanup | PASS | [`database/benchmarks/README.md`](../../database/benchmarks/README.md) | Guard trong runner/cleanup | Runtime chỉ còn Main và Test DB |

## C. Database programming

| Requirement | Required | Actual | Status | Source | Test | Demo evidence |
|---|---:|---|---|---|---|---|
| Stored Procedures | `>= 5` | 29 SP trong 10 nhóm nghiệp vụ | PASS | [`database/procedures/`](../../database/procedures/) | SQL suite + backend DB integration | Login, receiving, checkout, return, stocktake, reports |
| Nhiều loại operation | Add/edit/delete/search/statistics | Create/update, cancel/logical delete, search, detail, statistics/reporting | PASS | [`database/procedures/`](../../database/procedures/) | Tests 02–09 | CRUD, cancel receipt, product/invoice search, manager reports |
| UDF | `>= 5` | Đúng 5 inline TVF | PASS | [`database/functions/`](../../database/functions/), migration [`004`](../../database/migrations/004_add_dbms_user_defined_functions.sql), [`FUNCTIONS.md`](./FUNCTIONS.md) | [`11_user_defined_function_tests.sql`](../../database/tests/11_user_defined_function_tests.sql) | POS và return gọi hai UDF trực tiếp |
| TRY...CATCH | Có | 11 transaction SP có `BEGIN TRY/BEGIN CATCH` | PASS | Các procedure nhận hàng, bán hàng, trả hàng và kiểm kê | Tests 03, 05, 06, 07 | Forced failure và rollback/no partial write |

## D. Transactions

| Requirement | Required | Actual | Status | Source | Test | Demo evidence |
|---|---:|---|---|---|---|---|
| Business transaction workflows | `>= 5` | 11 SP có BEGIN/COMMIT/ROLLBACK, savepoint-aware | PASS | Các procedure nhận hàng, bán hàng, trả hàng và kiểm kê | Tests 03, 05, 06, 07 | Receiving, sale, return, stocktake create/count/approve |
| Integrity guaranteed | Có | XACT_ABORT, TRY/CATCH, savepoint, DB constraints/triggers | PASS | Transaction SPs + migration 005 | SQL suite + backend DB integration | Insufficient-stock request tạo 0 invoice/payment/movement |
| Concurrency hoặc recovery | Ít nhất một | Có cả locking/idempotency và backup/restore recovery | PASS | `UPDLOCK/HOLDLOCK`, filtered unique indexes, [`backup_restore_test.sql`](../../database/maintenance/backup_restore_test.sql) | Transaction suites + migration lock test | Over-sell/over-return guard; backup/restore runbook |

## E. Security

| Requirement | Required | Actual | Status | Source | Test | Demo evidence |
|---|---:|---|---|---|---|---|
| SQL role/login variants | `>= 4` | 4 DB roles, 4 enabled SQL logins, 4 mapped users | PASS | Migration [`006`](../../database/migrations/006_add_dbms_database_roles.sql), [`database/security/`](../../database/security/) | [`13_security_tests.sql`](../../database/tests/13_security_tests.sql) | Runtime `sys.server_principals`/`sys.database_principals` |
| Different privileges | Có | Customer/catalog; cashier/POS; warehouse/receiving; manager/master/report | PASS | [`SECURITY.md`](./SECURITY.md) | Test 13 `HAS_PERMS_BY_NAME` | Permission demo script |
| Permission trên tables | Có | Manager SELECT/INSERT/UPDATE master tables; explicit DENY sensitive tables | PASS | Migration 006 | Test 13 | Runtime `sys.database_permissions` |
| Permission trên views/procedures | Có | Role-specific SELECT/EXECUTE | PASS | Migration 006 | Test 13 | Permission demo script |
| GRANT, DENY, REVOKE | Cả ba | Permanent GRANT/DENY; controlled test-only GRANT→REVOKE | PASS | Migration 006, test 13 lines 208–224 | Test 13 PASS | Runbook chỉ source/test, không mutate Main |
| Security policy explanation | Có | Least privilege, deny sensitive ledgers/auth/history, no DBA membership | PASS | [`SECURITY.md`](./SECURITY.md) | Security SQL + backend security suites | App role và SQL role được tách rõ |

## F. Application ↔ SQL Server

| Requirement | Required | Actual | Status | Source | Test | Demo evidence |
|---|---:|---|---|---|---|---|
| Configurable connection | Có | Driver/server/instance/port/database/user/password/trusted/TLS/pool bằng env | PASS | [`database.config.js`](../../backend/src/config/database.config.js), [`.env.example`](../../backend/.env.example) | Migration config tests | Local `msnodesqlv8` + trusted connection |
| Login/authorization theo role | Có | bcrypt → JWT → server identity → middleware cho 4 app role | PASS | Auth service/repository/middleware/routes | Auth unit + DB integration + Phase 7 runtime | 4/4 local application accounts login PASS |
| CRUD main entities | Có | Category, Product, Supplier, Promotion C/R/U/deactivate; account/customer/receiving workflows | PASS | Admin/product/supplier/promotion/receiving layers | Backend DB integration | D7 runtime fixture matrix |
| Search | Có | Product, barcode, invoice, inventory/lot, supplier, audit | PASS | Repository/service layers | Integration suites | Phase 7 API/UI runtime |
| Statistics/reporting | Có | Revenue, merchandise/inventory, receiving, workforce | PASS | Reporting repository + SP/views | Test 09 + reporting integration | Non-empty D7 reports |
| View/SP integration | Có | Repositories gọi representative views và SP thật | PASS | Repository files | Repository + DB integration tests | [`APPLICATION_INTEGRATION.md`](./APPLICATION_INTEGRATION.md) matrix |
| Application gọi Function | Có | POS gọi `ufn_SAN_PHAM_CoTheBan`; invoice gọi `ufn_HOA_DON_PhanBoCoTheTra` | PASS | POS/invoice repositories | Repository + integration tests | Search/quote/return runtime |
| DB connection loss handling | Có | `503 DATABASE_UNAVAILABLE`, pool reset/reconnect | PASS | [`database.pool.js`](../../backend/src/config/database.pool.js), error middleware | Health tests | Test DB OFFLINE→503→ONLINE→same pool 200 |
| Invalid input handling | Có | Stable 400/409, no SQL/stack leak, no partial write | PASS | Validation/service/error middleware | Unit, DB integration, SQL rollback tests | 8 Phase 7 negative API cases |
| Clear/friendly UI | Có | Role portals, loading/empty/error states, responsive tables/forms | PASS | [`frontend/src/`](../../frontend/src/) | 104 frontend tests + 31 route smoke | Phase 7 Brave desktop smoke PASS |

## Summary

| Category | Requirements | PASS | PARTIAL | FAIL |
|---|---:|---:|---:|---:|
| Database design | 8 | 8 | 0 | 0 |
| Constraints/Trigger/View/Index | 8 | 8 | 0 | 0 |
| Database programming | 4 | 4 | 0 | 0 |
| Transactions | 3 | 3 | 0 | 0 |
| Security | 6 | 6 | 0 | 0 |
| Application integration | 10 | 10 | 0 | 0 |
| **Total** | **39** | **39** | **0** | **0** |

Kết luận rubric: mọi requirement bắt buộc có implementation và evidence thực tế; không có hàng `PARTIAL` hoặc `FAIL`.
