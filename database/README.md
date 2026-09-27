# SQL Server core schema

Thư mục này chứa lược đồ 23 bảng cốt lõi của hệ thống quản lý cửa hàng tiện lợi. Script không tạo database, không chứa credential hoặc JWT. Runner có seed nền tối thiểu và các stored object hỗ trợ authentication lookup, account/role query và audit dùng chung.

## Yêu cầu

- Microsoft SQL Server 2016 trở lên.
- `sqlcmd` có thể kết nối tới một database do người chạy lựa chọn.
- Database đích không phải `master`, `model`, `msdb` hoặc `tempdb`.

## Thứ tự script

`init.sql` chạy các file theo đúng dependency:

1. `schema/00_drop_core_schema.sql`: xóa đúng 23 bảng core theo thứ tự FK ngược.
2. `schema/01_identity.sql`: vai trò, nhân viên, khách hàng, tài khoản.
3. `schema/02_catalog.sql`: loại sản phẩm, sản phẩm, khuyến mãi và nhà cung cấp.
4. `schema/03_inventory.sql`: ca làm việc, nhập hàng, lô, kiểm kê và giao dịch kho.
5. `schema/04_sales_returns_audit.sql`: hóa đơn, thanh toán, trả hàng và nhật ký.
6. `constraints/01_enforce_and_validate.sql`: bật, trust và xác minh các constraint/default quan trọng.
7. `constraints/02_auth_account_audit.sql`: buộc account gắn đúng loại chủ sở hữu/role và chặn dữ liệu xác thực nhạy cảm trong audit payload.
8. `indexes/01_lookup_indexes.sql`: bổ sung index lookup/filter và xác minh unique index nền.
9. `indexes/02_auth_audit_indexes.sql`: xác minh covering index login và thêm index tra cứu audit theo bản ghi.
10. `views/01_account_role.sql`: view account/role không lộ password hash.
11. `procedures/01_get_account_for_authentication.sql`: lookup chính xác một username bằng tham số cho backend authentication.
12. `procedures/02_write_audit_log.sql`: entry point ghi audit dùng chung, từ chối password/token/secret.
13. `seed/01_roles.sql`: seed bốn vai trò chuẩn.
14. `seed/02_development_data.sql`: seed tối thiểu một nhân viên, danh mục, sản phẩm, nhà cung cấp và lô hàng development.

> `init.sql` dựng lại toàn bộ 23 bảng core và sẽ xóa dữ liệu hiện có trong các bảng này. Chỉ chạy trên database rỗng hoặc database development/test đã được chọn rõ ràng.

## Khởi tạo schema

Mở terminal tại thư mục `database/`, sau đó chạy bằng Windows Authentication:

```powershell
sqlcmd -S ".\SQLEXPRESS" -E -I -d "ConvenienceStore" -b -f 65001 -i ".\init.sql"
```

Thay server và database bằng môi trường của bạn. Tùy chọn `-I` bật `QUOTED_IDENTIFIER`, cần thiết khi thao tác với filtered index. Credential không được lưu trong repository; nếu môi trường không dùng Windows Authentication, truyền thông tin kết nối bằng cơ chế bảo mật của môi trường triển khai.

## Kiểm tra số bảng

Kết quả mong đợi là `23`:

```sql
SELECT COUNT(*) AS CoreTableCount
FROM sys.tables
WHERE schema_id = SCHEMA_ID('dbo')
  AND name IN (
      'VAI_TRO', 'NHAN_VIEN', 'KHACH_HANG', 'TAI_KHOAN', 'CA_LAM_VIEC',
      'LOAI_SAN_PHAM', 'SAN_PHAM', 'KHUYEN_MAI', 'KHUYEN_MAI_SAN_PHAM',
      'NHA_CUNG_CAP', 'PHIEU_NHAP', 'LO_HANG', 'CHI_TIET_PHIEU_NHAP',
      'KIEM_KE', 'CHI_TIET_KIEM_KE', 'GIAO_DICH_KHO', 'HOA_DON',
      'CHI_TIET_HOA_DON', 'CHI_TIET_XUAT_LO', 'THANH_TOAN', 'PHIEU_TRA',
      'CHI_TIET_PHIEU_TRA', 'NHAT_KY_HE_THONG'
  );
```

## Kiểm tra khóa ngoại

Liệt kê FK để đối chiếu bảng con, cột con, bảng cha và cột cha:

```sql
SELECT
    fk.name AS ForeignKeyName,
    OBJECT_NAME(fk.parent_object_id) AS ChildTable,
    child_column.name AS ChildColumn,
    OBJECT_NAME(fk.referenced_object_id) AS ParentTable,
    parent_column.name AS ParentColumn
FROM sys.foreign_keys AS fk
JOIN sys.foreign_key_columns AS fkc
    ON fkc.constraint_object_id = fk.object_id
JOIN sys.columns AS child_column
    ON child_column.object_id = fkc.parent_object_id
   AND child_column.column_id = fkc.parent_column_id
JOIN sys.columns AS parent_column
    ON parent_column.object_id = fkc.referenced_object_id
   AND parent_column.column_id = fkc.referenced_column_id
WHERE OBJECT_SCHEMA_NAME(fk.parent_object_id) = 'dbo'
ORDER BY ChildTable, ForeignKeyName, fkc.constraint_column_id;
```

Không có bảng `LICH_SU_GIA` hoặc `DON_VI_TINH`; `DonViTinh` là thuộc tính của `SAN_PHAM`.

## Baseline seed

Runner seed đúng bốn role `CUSTOMER`, `CASHIER`, `WAREHOUSE`, `MANAGER` và một bộ dữ liệu có mã chứa `DEV` để smoke test lookup. Seed không tạo tài khoản demo, không chứa password/hash hoặc production secret.

Có thể kiểm tra nhanh sau khi chạy init:

```sql
SELECT MaVaiTro, TenVaiTro FROM dbo.VAI_TRO ORDER BY MaVaiTro;
SELECT MaSP, TenSP, MaVach, GiaBan FROM dbo.SAN_PHAM WHERE MaSP = 'SPDEV001';
SELECT MaLo, MaSP, SoLo, HanSuDung, SoLuongTon FROM dbo.LO_HANG WHERE MaLo = 'LODEV001';
```

## Authentication và audit support

- `dbo.vw_TAI_KHOAN_VAI_TRO` phục vụ tra cứu account/role/owner nhưng cố ý không trả `MatKhauHash`.
- `dbo.usp_TAI_KHOAN_LayTheoTenDangNhap` là lookup parameterized dành cho luồng đăng nhập và có trả hash để backend kiểm tra mật khẩu.
- `dbo.usp_NHAT_KY_HE_THONG_Ghi` ghi audit dùng chung; procedure và CHECK constraint đều từ chối payload có tên trường password/token/secret/JWT.
- JWT được tạo và xác minh tại backend, không được lưu hoặc xử lý trong SQL Server.

Chạy test C07 trên database test đã init, từ thư mục `database/`:

```powershell
sqlcmd -S ".\SQLEXPRESS" -E -I -d "ConvenienceStoreTest" -b -f 65001 -i ".\tests\01_auth_audit_tests.sql"
```

Test tạo dữ liệu tạm trong transaction và rollback sau khi kiểm tra username unique, account-owner-role, lookup và audit. Các chuỗi nhạy cảm trong negative tests chỉ là marker tổng hợp, không phải credential thật.
