# SQL Server core schema

Thư mục này chứa lược đồ 23 bảng cốt lõi của hệ thống quản lý cửa hàng tiện lợi. Script không tạo database, không chứa credential và chưa triển khai stored procedure nghiệp vụ. Runner có seed nền tối thiểu dành cho development/smoke test.

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
7. `indexes/01_lookup_indexes.sql`: bổ sung index lookup/filter và xác minh unique index nền.
8. `seed/01_roles.sql`: seed bốn vai trò chuẩn.
9. `seed/02_development_data.sql`: seed tối thiểu một nhân viên, danh mục, sản phẩm, nhà cung cấp và lô hàng development.

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
