# Final DBMS audit

Audit thực hiện ngày 2026-10-16 trên nhánh `dbms-requirements`, HEAD `785df3421a4252eb8aa9453781aec1a4cb362758`. Đây là audit source + runtime + tests + application evidence; không tạo DB object, migration hay feature mới.

## 1. Executive summary

Tất cả 39 dòng rubric bắt buộc đạt `PASS`; không có `PARTIAL` hoặc `FAIL`. Main DB và Test DB đều `ONLINE`. Migrations 000–006 đều `APPLIED`, checksum hợp lệ. Full SQL, backend, DB integration, full migration/bootstrap, security, frontend, build, route smoke và health đều pass.

Nhánh sẵn sàng để người dùng review rồi commit. Audit không stage, commit, push, merge hoặc deploy.

## 2. Database architecture

Hệ thống dùng Microsoft SQL Server 2022 Express với 23 bảng nghiệp vụ theo bốn miền:

- identity/account: role, employee, customer, account;
- catalog/procurement/inventory: category, product, promotion, supplier, receipt, lot, stocktake, stock ledger;
- sales/returns: shift, invoice, line, lot allocation, payment, return;
- audit: append-only system audit.

Application chạy theo chuỗi React/Vite → Express REST/JWT → service/repository → `mssql`/`msnodesqlv8` → SQL Server. Backend dùng một technical connection pool; application role `CUSTOMER/CASHIER/WAREHOUSE/MANAGER` không làm backend switch hoặc impersonate SQL principal.

## 3. Final metadata

Runtime query trực tiếp trên `ConvenienceStore_DBMS`:

| Metric | Actual |
|---|---:|
| Core tables | 23 |
| Primary keys | 23 |
| Foreign keys | 30 |
| CHECK constraints | 56 |
| DEFAULT constraints | 41 |
| UNIQUE constraints | 8 |
| Standalone indexes | 43 |
| Core columns | 163 |
| Views | 16 |
| Stored Procedures | 29 |
| UDF | 5 |
| Enabled application triggers | 5 |
| Custom database roles | 4 |
| Mapped database users | 4 |
| Enabled SQL logins | 4 |
| Applied migrations | 7 (`000`–`006`) |

`SCHEMA_MIGRATIONS` là bảng hạ tầng, không được tính là core table thứ 24. `ConvenienceStore_DBMS` và `ConvenienceStoreDBMS_Test` đều `ONLINE`. Không còn bootstrap/normalization/benchmark database disposable sau audit.

## 4. 3NF status

[`NORMALIZATION_3NF.md`](./NORMALIZATION_3NF.md) phân tích functional dependency cho đủ 23 relation:

- 23/23 đạt 1NF;
- 23/23 đạt 2NF;
- 23/23 đạt 3NF đối với dữ liệu gốc;
- ba computed persisted column được công bố là materialization do DBMS kiểm soát;
- migration 003 bỏ `GIAO_DICH_KHO.MaSP`, loại dependency bắc cầu `MaLo → MaSP` khỏi current relation;
- clean init giữ `MaSP` chỉ ở pre-003 historical bootstrap để runner replay lịch sử.

Migration 003 E2E chứng minh dữ liệu hợp lệ được bảo toàn và legacy mismatch rollback toàn bộ. ERD có 23 entity/30 relationship; relational schema có 23 relation; data dictionary liệt kê đủ 163/163 cột.

## 5. Constraints

Năm ví dụ mạnh, ngoài inventory tổng 56 CHECK/41 DEFAULT/8 UNIQUE:

| Constraint | Table | Rule/business reason | Negative evidence |
|---|---|---|---|
| `CK_TAI_KHOAN_OwnerExclusive` | `TAI_KHOAN` | Account phải gắn đúng một employee hoặc customer | Test 01 từ chối zero/two owner |
| `CK_TAI_KHOAN_OwnerRole` | `TAI_KHOAN` | CUSTOMER phải sở hữu customer; staff role phải sở hữu employee | Test 01 từ chối role-owner mismatch |
| `CK_LO_HANG_HanSuDung` | `LO_HANG` | Expiry phải sau manufacture date | Receiving SQL/API tests từ chối invalid relation |
| `CK_KHUYEN_MAI_GiaTri` | `KHUYEN_MAI` | Discount dương; phần trăm không quá 100 | Catalog/promotion tests từ chối invalid discount |
| `CK_NHAT_KY_HE_THONG_NoSensitiveData` | `NHAT_KY_HE_THONG` | Audit payload không chứa password/token/secret material | Test 01/08 từ chối sensitive payload |
| `CK_GIAO_DICH_KHO_SoLuongBienDong` | `GIAO_DICH_KHO` | Stock movement không được bằng 0 | Integrity/transaction suites |
| `UQ_LO_HANG_MaSP_SoLo` | `LO_HANG` | Số lô duy nhất trong phạm vi sản phẩm | Receiving duplicate/reuse tests |

Test 10 đồng thời xác minh mọi FK/CHECK đều enabled và trusted. Default dùng cho trạng thái, thời gian UTC, số tiền/điểm/tồn ban đầu và không thay validation nghiệp vụ.

## 6. Triggers

| Trigger | Parent/event | Purpose | Enabled | Test |
|---|---|---|---:|---|
| `trg_NHAT_KY_HE_THONG_AppendOnly` | `NHAT_KY_HE_THONG` UPDATE/DELETE | Audit ledger append-only | Yes | Test 12 + test 08 |
| `trg_GIAO_DICH_KHO_AppendOnly` | `GIAO_DICH_KHO` UPDATE/DELETE | Inventory ledger append-only | Yes | Test 12 |
| `trg_CHI_TIET_PHIEU_NHAP_ChiSuaKhiDraft` | receipt detail I/U/D | Chỉ sửa detail khi receipt DRAFT | Yes | Test 12 + test 03 |
| `trg_CHI_TIET_HOA_DON_ChiSuaKhiDraft` | invoice detail I/U/D | Chỉ sửa line khi invoice DRAFT | Yes | Test 12 + test 05 |
| `trg_LO_HANG_BaoVeSanPhamSauPhatSinh` | `LO_HANG` UPDATE | Không đổi product của lot đã có lịch sử | Yes | Test 12 |

[`12_trigger_tests.sql`](../../database/tests/12_trigger_tests.sql) phủ direct DML, multi-row atomicity và official SP workflow compatibility. Runtime `sys.triggers` xác nhận đúng 5, `is_disabled=0`.

## 7. Views

| View | Purpose/caller | Evidence |
|---|---|---|
| `vw_TAI_KHOAN_VAI_TRO` | Safe account/owner/role projection; auth/admin repositories | Test 01, backend auth/admin |
| `vw_SAN_PHAM_DANH_MUC` | Product/category catalog; product repository | Test 02, product integration |
| `vw_KHUYEN_MAI_SAN_PHAM_CHI_TIET` | Promotion/product projection | Test 02, promotion integration |
| `vw_PHIEU_NHAP_CHI_TIET` | Receiving header/detail/lot | Test 03, receiving integration |
| `vw_LO_HANG_THEO_DOI` | Lot and expiry tracking | Tests 03–04, inventory app |
| `vw_TON_KHO_SAN_PHAM` | Product stock aggregate | Test 04, inventory app |
| `vw_TON_KHO_THEO_LO` | Per-lot stock | Test 04, inventory drill-down |
| `vw_HOA_DON_CHI_TIET` | Invoice/detail/customer/employee projection | Test 05, invoice lookup |
| `vw_HOA_DON_THANH_TOAN` | Invoice payment projection | Test 05, receipt |
| `vw_PHIEU_TRA_CHI_TIET` | Return lines and original lot | Test 06, return UI |
| `vw_KIEM_KE_CHI_TIET` | Stocktake snapshot/discrepancy/current stock | Test 07, stocktake repository |
| `vw_NHAT_KY_HE_THONG_CHI_TIET` | Safe enriched audit output | Test 08, audit repository |
| `vw_BAO_CAO_DOANH_THU_SU_KIEN` | Revenue event basis | Test 09, reporting SPs |
| `vw_BAO_CAO_HANG_HOA_SU_KIEN` | Merchandise sales/refund basis | Test 09, reporting SPs |
| `vw_BAO_CAO_TON_KHO_HIEN_TAI` | Current stock/value report | Test 09, reporting repository |
| `vw_BAO_CAO_NHAP_HANG_HOP_LE` | Confirmed receiving report basis | Test 09, reporting SPs |

Strongest application mappings are account, product, stocktake, audit and inventory-report views; Phase 7 verified them through API/UI, not merely direct SQL.

## 8. Indexes and performance

Runtime has 43 standalone indexes: 33 nonunique, 10 unique, 14 filtered, 24 with INCLUDE. Không có exact duplicate/same-key definition duplicate.

| Benchmarked index | Reads without → with | Reduction | Result |
|---|---:|---:|---|
| `UQ_TAI_KHOAN_TenDangNhap` | 183 → 3 | 98.36% | covering seek |
| `IX_LO_HANG_MaSP_HanSuDung_ConTon` | 33 → 3 | 90.91% | filtered covering seek |
| `IX_HOA_DON_BaoCao_TrangThai_NgayLap` | 102 → 81 | 20.59% | covering report seek |
| `IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian` | 1,690 → 4 | 99.76% | filtered target seek |
| `IX_PHIEU_NHAP_TrangThai_NgayNhap` | 814 → 50 | 93.86% | covering seek |

CSV, JSON và Markdown khớp từng số; 5/5 có `Equivalent=true`. Mười actual `.sqlplan` và IO/TIME output tồn tại, mỗi plan khoảng 6.0–12.7 KB. Benchmark chạy riêng trên `ConvenienceStoreIndexBenchmarkTest`; Main không nhận bulk data và benchmark DB đã được cleanup.

## 9. Stored Procedures

29 SP được phân loại đầy đủ:

| Group | Procedures |
|---|---|
| Authentication (1) | `usp_TAI_KHOAN_LayTheoTenDangNhap` |
| Audit (2) | `usp_NHAT_KY_HE_THONG_Ghi`, `usp_NHAT_KY_HE_THONG_TraCuu` |
| Catalog (3) | `usp_SAN_PHAM_TraCuu`, `usp_KHUYEN_MAI_DangHieuLuc`, `usp_SAN_PHAM_LichSuGia` |
| Supplier (1) | `usp_NHA_CUNG_CAP_TraCuu` |
| Receiving (5) | `usp_PHIEU_NHAP_LuuNhap`, `usp_CHI_TIET_PHIEU_NHAP_LuuNhap`, `usp_CHI_TIET_PHIEU_NHAP_Xoa`, `usp_PHIEU_NHAP_Huy`, `usp_PHIEU_NHAP_XacNhan` |
| Inventory (2) | `usp_TON_KHO_SAN_PHAM_TraCuu`, `usp_LO_HANG_TraCuu` |
| POS/Sale (3) | `usp_CA_LAM_VIEC_Mo`, `usp_HOA_DON_HoanTatBanHang`, `usp_HOA_DON_LayChiTiet` |
| Return (1) | `usp_PHIEU_TRA_HoanTat` |
| Stocktake (3) | `usp_KIEM_KE_Tao`, `usp_CHI_TIET_KIEM_KE_GhiNhan`, `usp_KIEM_KE_PheDuyetDieuChinh` |
| Reporting (8) | `usp_BAO_CAO_DoanhThuTongQuan`, `usp_BAO_CAO_XuHuongDoanhThu`, `usp_BAO_CAO_DoanhThuTheoNganhHang`, `usp_BAO_CAO_XepHangSanPham`, `usp_BAO_CAO_NhapHangTongQuan`, `usp_BAO_CAO_NhapHangTheoNhaCungCap`, `usp_BAO_CAO_DoanhThuNhanVien`, `usp_BAO_CAO_CaLamViec` |

Rubric operations gồm create/add, edit, detail delete, cancel/logical delete, search và statistics. `usp_CHI_TIET_PHIEU_NHAP_Xoa` chỉ xóa detail của draft; `usp_PHIEU_NHAP_Huy` và application deactivate giữ historical integrity thay vì hard-delete finalized master/transaction data.

Đúng 11 SP có TRY/CATCH và transaction handling: mở ca; năm receiving operations; checkout; hoàn trả; tạo/ghi nhận/duyệt kiểm kê. Không tuyên bố 18 read-only SP còn lại có TRY/CATCH.

## 10. User-defined functions

Tất cả là inline table-valued function:

| Function | Purpose | Caller/test |
|---|---|---|
| `ufn_LO_HANG_PhanLoaiHanDung` | Phân loại VALID/NEAR_EXPIRY/EXPIRED/UNKNOWN | Lot function/SP; test 11 |
| `ufn_LO_HANG_TheoSanPham` | Lô của sản phẩm với expiry classification | Inventory/lot SP; test 11 |
| `ufn_TON_KHO_TheoSanPham` | Tổng hợp tồn và trạng thái lô | Inventory paths; test 11 |
| `ufn_SAN_PHAM_CoTheBan` | Snapshot sản phẩm bán được | `pos.repository.js`; repository/integration/runtime tests |
| `ufn_HOA_DON_PhanBoCoTheTra` | Allocation bán theo lô và số còn có thể trả | `invoice.repository.js`; repository/integration/runtime tests |

Runtime metadata xác nhận đúng 5; test 11 phủ happy path, boundary, NULL, invalid input và rollback fixture.

## 11. Transactions

Mười một SP transaction đều có BEGIN/COMMIT/ROLLBACK, TRY/CATCH, savepoint khi tham gia transaction ngoài và `UPDLOCK/HOLDLOCK` trên state cần serialize.

Năm demo mạnh:

1. Receiving: draft header/detail/edit/delete/confirm; forced confirmation failure rollback lot, movement và totals.
2. POS checkout: authoritative price/promotion, FEFO lot allocation, invoice/payment/points/stock movement atomic.
3. Return: lock invoice/allocation/prior returns, authoritative refund, exact-lot restore cho RESALABLE, rollback on failure.
4. Stocktake create/count: stable lot snapshot và required reason cho discrepancy.
5. Stocktake approval: stale snapshot conflict, signed adjustment và status update trong một transaction.

Application-level evidence: checkout 99,999 units trả `409 INSUFFICIENT_STOCK`; database có 0 invoice, 0 payment và 0 movement cho request lỗi.

## 12. Concurrency and recovery

Concurrency mechanisms có source evidence:

- `UPDLOCK/HOLDLOCK` trên receipt, shift, invoice, lot, return allocation và stocktake state;
- filtered unique indexes chặn nhiều OPEN shift, duplicate successful payment/import và duplicate business reference;
- caller-supplied invoice ID + persisted-result comparison cung cấp checkout idempotency;
- procedure savepoints bảo toàn outer transaction semantics;
- migration runner dùng `sp_getapplock` và có lock-timeout/concurrent-run integration test.

Scenario cụ thể: hai checkout không thể cùng bán quá tồn vì sale SP khóa sellable lots và revalidates stock trước allocation; hai return không thể over-return vì return SP khóa invoice/allocation/prior completed returns. Không có dedicated manual two-session demo; evidence là locking source + forced-conflict/rollback tests.

Recovery độc lập nằm tại [`backup_restore_test.sql`](../../database/maintenance/backup_restore_test.sql): `BACKUP DATABASE ... COPY_ONLY CHECKSUM`, `RESTORE VERIFYONLY`, restore sang DB khác với `MOVE`, `DBCC CHECKDB`, rồi kiểm tra 23 table, seed và trusted constraints. Script từ chối system DB, target trùng/tồn tại và source không ONLINE.

## 13. Security

Runtime có bốn custom DB role và member:

| DB role | Mapped user | SQL login | Enabled |
|---|---|---|---:|
| `dbms_customer` | `dbms_customer_user` | `dbms_customer_login` | Yes |
| `dbms_cashier` | `dbms_cashier_user` | `dbms_cashier_login` | Yes |
| `dbms_warehouse` | `dbms_warehouse_user` | `dbms_warehouse_login` | Yes |
| `dbms_manager` | `dbms_manager_user` | `dbms_manager_login` | Yes |

Migration 006 cấp permanent object-level `GRANT` và explicit `DENY`. Customer chỉ đọc safe catalog views; cashier dùng POS/return objects; warehouse dùng receiving/inventory/stocktake-create objects; manager dùng master/report/audit/approval objects. Mọi role bị DENY raw `TAI_KHOAN`, audit/stock ledger DML và migration history DML; không role nào có DBA membership/control.

`REVOKE` được chứng minh có kiểm soát trong test 13: cấp tạm SELECT `VAI_TRO` cho user test, xác nhận có quyền, REVOKE, xác nhận mất quyền, rồi cleanup/rollback. Security SQL suite và runtime permissions đều pass.

Application role là `VAI_TRO`/JWT (`CUSTOMER`, `CASHIER`, `WAREHOUSE`, `MANAGER`). SQL role là `dbms_customer`, `dbms_cashier`, `dbms_warehouse`, `dbms_manager`. Đây là hai lớp khác nhau; technical pool không đổi principal theo JWT.

## 14. Application integration

Connection config đọc từ env: `DB_DRIVER`, `DB_SERVER`, `DB_INSTANCE`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_TRUSTED_CONNECTION`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE`, ODBC override và pool settings. Audit không in giá trị secret local.

Auth chain: login request → auth controller/service → `AuthRepository` → `usp_TAI_KHOAN_LayTheoTenDangNhap` → bcrypt compare → JWT → middleware reload server-side identity → role/ownership authorization.

Bốn local application accounts `dbms_customer`, `dbms_cashier`, `dbms_warehouse`, `dbms_manager` đều `ACTIVE`; không phải bốn SQL login cùng prefix.

Phase 7 runtime verified:

- CRUD/deactivate: category, product, supplier, promotion; account/customer/receiving workflows;
- search: product/barcode, invoice, supplier, inventory/lot, audit;
- reports: revenue, merchandise/inventory, receiving, workforce;
- SP: login, open shift, checkout, receipt, return, receiving save/confirm, stocktake create/approve;
- UDF: POS sellability và return allocation;
- views: account, product, stocktake, audit, current inventory report.

DB outage test limitation được ghi đúng: Windows không cho stop `MSSQL$SQLEXPRESS`. Backend cô lập nối Test DB healthy; Test DB `OFFLINE` trả `503 DATABASE_UNAVAILABLE`; Test DB được `ONLINE` trong `finally`; cùng pool trả `200 ok` lần đầu và 7 migration còn nguyên. Không tuyên bố SQL Server service đã bị stop.

## 15. Error handling

Required field, enum, date relation, reversed report range, malformed ID, unexpected checkout field, insufficient stock và duplicate receipt confirmation đều trả stable `400/409`. Error middleware không trả raw SQL, ODBC/driver detail, stack hoặc local path.

Database-side business conflict `INSUFFICIENT_STOCK` được map thành friendly `409`; transaction rollback không để partial invoice/payment/movement. Unknown error logging chỉ chứa request metadata đã kiểm soát.

## 16. UI

Frontend source không thay đổi sau Phase 7 UI smoke. Computer Use trên Brave 1536×816 đã kiểm tra public health, login, customer portal, cashier dashboard/POS, warehouse receiving/inventory và manager product/supplier/revenue report. Không có blocking overflow/modal/table issue; manager sidebar scroll riêng là expected behavior.

Final frontend regression: 104/104 tests, build 147 modules, 31/31 SPA routes. Loading/empty/error/success states và responsive table/form behavior có automated coverage.

## 17. Test results

| Suite | Final result |
|---|---|
| SQL `database/tests/run_all.sql` | PASS; integrity/UDF/trigger/security/index/transactions/reports |
| Backend unit/default | 178 total; 157 pass; 21 expected opt-in skip; 0 fail |
| Backend DB integration | 178 total; 176 pass; 2 destructive opt-in skip; 0 fail |
| Migration full opt-in | 15/15 pass; local + production bootstrap, migration 003, checksum/order/lock |
| Security | 17/17 pass |
| Frontend | 104/104 pass |
| Build | PASS; 147 modules |
| Route smoke | 31/31 pass |
| Migration status Main | 000–006 APPLIED, no checksum mismatch |
| Health | `200`, DB status `ok` |

Full bootstrap dùng ba database disposable có tên kết thúc `Test`; suite đã cleanup chúng. Chỉ Main và `ConvenienceStoreDBMS_Test` được giữ.

## 18. Known limitations

Các giới hạn đã được source/docs xác nhận và không làm fail rubric:

1. Một cửa hàng/một kho; chưa có multi-branch/multi-warehouse.
2. Không có online ordering/delivery hoặc payment gateway thật; non-cash chỉ ghi nhận/mô phỏng.
3. Có tích điểm nhưng chưa có UI/chính sách tiêu điểm redemption.
4. Return chưa có manager approval threshold và không nhận refund method riêng.
5. Staff password reset chưa có forced-change-on-next-login.
6. Báo cáo không hiển thị profit vì chưa có công thức nghiệp vụ được duyệt.
7. Backend dùng technical DB pool thay vì SQL-principal switching theo JWT role.
8. DB outage dùng Test DB `OFFLINE` do thiếu Windows Service Control permission; không stop service thật.
9. Recovery script local/test dùng full backup; Azure SQL cần service PITR runbook.
10. Concurrency được chứng minh bằng locking/index/source và integration conflicts, chưa có manual two-session demo riêng.

## 19. Demo and commit readiness

[`DEMO_RUNBOOK.md`](./DEMO_RUNBOOK.md) có trình tự 10–15 phút: metadata/ERD/3NF, login/RBAC, CRUD, receiving, sale/return, stocktake, report/View, rollback, trigger guard, SQL role + GRANT/DENY/REVOKE evidence, index plan và DB outage/recovery. Runbook không chứa password.

Stale-document audit:

- sửa ERD/relational schema/data dictionary/functions từ current-state 000–005 thành 000–006;
- giữ `0 UDF/1 trigger/0 role` chỉ trong historical clean-bootstrap context;
- mọi claim `GIAO_DICH_KHO.MaSP` còn lại đều là pre-003/before context hoặc nói cột đã bị bỏ;
- sửa hai absolute user path và source-of-truth branch cứng trong operating guide;
- sửa SQL role filter sai trong demo runbook;
- không còn claim current-state 31 FK, 164 columns hoặc 22/23 tables.

Repository portability/security:

- không còn đường dẫn tuyệt đối theo Windows user profile, username cá nhân hoặc OneDrive path trong repo content;
- không có real password/JWT/DB/Azure credential hoặc runtime bcrypt hash trong pending files;
- các bcrypt hash còn lại là public dummy hash cố định dùng chống timing/test fixture;
- `.env` local không tracked/staged; `.env.example` chỉ có placeholder;
- không có `.bak`, `.mdf`, `.ldf`, temp log, browser profile, node_modules hoặc dist trong pending set;
- không có file pending >5 MB; intentional `.sqlplan` chỉ 6.0–12.7 KB.

Commit classification:

- **MUST COMMIT:** migrations 003–006; functions/security scripts; schema/init/migration-contract updates; repository/test changes cần cho UDF/3NF; database tests 11–14 và run-all; demo-account utility; DBMS docs gồm hai final audit files.
- **SHOULD COMMIT:** benchmark runner/data generator/cleanup, CSV/JSON/Markdown results, IO/TIME logs và ten small actual plans; README links và portable operating-guide corrections.
- **DO NOT COMMIT:** `backend/.env`, `node_modules/`, `frontend/dist/`, runtime secret/state files, `.bak/.mdf/.ldf`, benchmark database, temp/browser artifacts. Không có mục nào trong nhóm này đang pending.
- **NEED USER DECISION:** none về kỹ thuật; chỉ người dùng chọn chiến lược commit.

Recommended commit plan: Option B, sáu commit logic, vì review/rollback rõ hơn một compliance commit lớn:

1. normalization and clean migration foundation;
2. five UDFs and application callers/tests;
3. five-trigger final state and tests;
4. SQL roles/logins/security evidence;
5. index benchmark scripts/results/evidence;
6. application integration, demo utility, final docs and README links.

Audit không stage hoặc execute kế hoạch này.

## 20. Final conclusion

- All mandatory DBMS requirements: **PASS**.
- Ready to commit DBMS branch: **YES**, sau khi người dùng review file classification/commit plan.
- Ready for demo: **YES**.
- Ready for submission: **YES**.
- Mandatory `PARTIAL`/`FAIL`: **NONE**.

Không commit, push, merge hoặc deploy trong Phase 8.
