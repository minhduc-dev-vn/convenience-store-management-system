# Indexes

Thư mục này là nguồn duy nhất của 43 standalone index trên 23 bảng nghiệp vụ.
Các file chỉ chứa thiết lập session cần cho filtered/computed-column index và DDL
`DROP INDEX IF EXISTS` / `CREATE [UNIQUE] INDEX`. Phần kiểm tra metadata, số lượng,
key, include và filter được đặt riêng tại `database/tests/14_index_inventory_tests.sql`.

Thứ tự file theo nhóm nghiệp vụ:

1. lookup chung;
2. xác thực;
3. catalog, khuyến mãi và nhà cung cấp;
4. nhập hàng và lô;
5. tồn kho;
6. bán hàng/FEFO;
7. đổi trả;
8. audit;
9. báo cáo.
