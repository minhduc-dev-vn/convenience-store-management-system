# User-defined functions

Thư mục này chứa source trình bày trực tiếp của đúng 5 inline table-valued function.
Mỗi file chỉ định nghĩa một function bằng `CREATE OR ALTER FUNCTION` và được đánh số
theo thứ tự dependency. Có thể mở từng file trong SSMS để trình bày hoặc chạy lần lượt
từ `01` đến `05` trên schema cuối.

Migration `004_add_dbms_user_defined_functions.sql` là lịch sử triển khai bất biến và
không được chỉnh sửa sau khi đã áp dụng. Migration runner gửi mỗi migration như một
batch duy nhất nên file migration dùng `sys.sp_executesql` để đáp ứng quy tắc batch của
SQL Server. Dynamic SQL là chi tiết đóng gói migration; định nghĩa UDF dễ đọc và dùng
cho vấn đáp nằm trong thư mục này.
