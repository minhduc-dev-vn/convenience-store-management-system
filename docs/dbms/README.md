# Hồ sơ thiết kế cơ sở dữ liệu

Tài liệu trong thư mục này mô tả đúng baseline của nhánh `dbms-requirements` tại commit `785df3421a4252eb8aa9453781aec1a4cb362758`. Đây là hồ sơ thiết kế, không phải một migration và không thay đổi schema đang chạy.

## Bộ tài liệu

1. [Data Dictionary](./DATA_DICTIONARY.md) — 23 bảng, toàn bộ cột, kiểu dữ liệu, nullability, khóa và các ràng buộc nghiệp vụ quan trọng.
2. [ERD](./ERD.md) — sơ đồ Mermaid đầy đủ 23 thực thể và 30 quan hệ khóa ngoại.
3. [Relational Schema](./RELATIONAL_SCHEMA.md) — lược đồ quan hệ, khóa chính, khóa ứng viên, khóa ngoại và quy tắc toàn vẹn.
4. [Phân tích chuẩn hóa 3NF](./NORMALIZATION_3NF.md) — phụ thuộc hàm, đánh giá 1NF/2NF/3NF và các ngoại lệ vật lý được phát hiện.
5. [User-defined functions](./FUNCTIONS.md) — thiết kế, contract, edge case, ví dụ và đường tích hợp application của 5 inline TVF.
6. [Database triggers](./TRIGGERS.md) — 5 trigger, invariant, error contract, direct-DML demo và tương thích stored procedure.
7. [SQL Server security](./SECURITY.md) — 4 custom role, local login/user provisioning và ma trận GRANT/DENY/REVOKE.
8. [Indexes và benchmark](./INDEXES.md) — inventory 43 standalone index, 5 workload thật và bằng chứng before/after bằng IO/TIME/actual plan.
9. [Application integration](./APPLICATION_INTEGRATION.md) — kiến trúc local, demo accounts, role/CRUD matrix, E2E runtime và bằng chứng View/SP/UDF.
10. [Demo runbook](./DEMO_RUNBOOK.md) — kịch bản trình bày end-to-end trong 10–15 phút.
11. [Final rubric matrix](./FINAL_RUBRIC_MATRIX.md) — đối chiếu từng dòng rubric với source, test và demo evidence.
12. [Final audit](./FINAL_AUDIT.md) — metadata runtime, regression, limitation và commit/release readiness.

## Phạm vi và nguồn sự thật

Nguồn được dùng để lập tài liệu:

- `database/schema/01_identity.sql`
- `database/schema/02_catalog.sql`
- `database/schema/03_inventory.sql` (bootstrap pre-003)
- `database/schema/04_sales_returns_audit.sql`
- `database/constraints/01_enforce_and_validate.sql`
- `database/constraints/02_auth_account_audit.sql`
- `database/tests/10_integrity_packaging_tests.sql`
- `database/tests/14_index_inventory_tests.sql`
- `database/migrations/003_normalize_inventory_transaction_3nf.sql`
- `database/migrations/004_add_dbms_user_defined_functions.sql`
- `database/migrations/005_add_dbms_business_triggers.sql`
- `database/migrations/006_add_dbms_database_roles.sql`
- `database/benchmarks/`

Các thư mục `database/indexes/`, `database/views/`, `database/procedures/`, `database/functions/` và `database/triggers/` tách source theo đúng loại object để review và vấn đáp. View, procedure, function và trigger dùng một object mỗi file với DDL trực tiếp, còn kiểm chứng index nằm trong `database/tests/`. Các file clean bootstrap cố ý biểu diễn pre-003/pre-004/pre-005/pre-006 để replay migration lịch sử; hồ sơ này mô tả trạng thái cuối sau khi Node runner áp dụng 000–006. Metadata của `ConvenienceStore_DBMS` được dùng làm phép kiểm tra chéo; benchmark index chỉ chạy trên database disposable riêng.

## Quy ước

- `PK`: khóa chính.
- `FK → Bảng.Cột`: khóa ngoại đến bảng/cột được chỉ ra.
- `UQ`: ràng buộc duy nhất khai báo bằng `UNIQUE`.
- `UX`: unique index, có thể là filtered unique index.
- `IDENTITY`: SQL Server tự sinh số tăng dần.
- `COMPUTED PERSISTED`: cột tính toán do SQL Server duy trì và lưu vật lý.
- Cardinality trên ERD được suy ra từ FK, nullability và unique constraint/index thực tế.
- Bảng kỹ thuật `SCHEMA_MIGRATIONS` không thuộc 23 bảng nghiệp vụ và không xuất hiện trong ERD.
- Trạng thái chỉ chạy `init.sql` là bootstrap trung gian, chưa dùng để demo/chấm; database hoàn chỉnh chỉ tồn tại sau khi migration 006 là `APPLIED`.

## Baseline được chứng minh

| Hạng mục | Số lượng |
|---|---:|
| Bảng nghiệp vụ | 23 |
| Primary key | 23 |
| Foreign key | 30 |
| CHECK | 56 |
| DEFAULT | 41 |
| UNIQUE constraint | 8 |
| Index độc lập | 43 |
| View | 16 |
| Stored procedure | 29 |
| Trigger | 5 |
| Function | 5 |
| Custom database role | 4 |

`database/tests/10_integrity_packaging_tests.sql` kiểm chứng hình dạng 23 bảng, số lượng PK/FK/CHECK/DEFAULT/UNIQUE, trạng thái trusted của constraint và các negative test cho PK, FK, UNIQUE, CHECK.

## Kết luận thiết kế

- 23/23 bảng có khóa chính; quan hệ N–N được phân rã qua bảng kết hợp.
- Các thuộc tính lặp và nhóm lặp đã được tách thành quan hệ chi tiết, nên đạt 1NF.
- Các quan hệ có khóa ghép không chứa phụ thuộc bộ phận của thuộc tính dữ liệu gốc, nên đạt 2NF.
- 23 bảng đạt 3NF đối với các dữ liệu gốc đã mô hình hóa.
- `GIAO_DICH_KHO` chỉ lưu `MaLo`; sản phẩm được suy ra bằng `GIAO_DICH_KHO.MaLo → LO_HANG.MaSP`. Phụ thuộc bắc cầu cũ đã được loại bỏ trong Phase 2.5.
- Ba cột `ThanhTien`/`ChenhLech` là `COMPUTED PERSISTED`; chúng là dữ liệu dẫn xuất nhưng công thức được SQL Server cưỡng chế nên không tạo bất thường cập nhật thủ công.
