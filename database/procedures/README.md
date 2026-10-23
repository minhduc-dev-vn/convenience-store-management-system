# Stored procedures

Thư mục này chứa đúng 29 stored procedure thuộc schema `dbo`. Mỗi file định nghĩa
một procedure bằng DDL trực tiếp; các file có số thứ tự để giữ dependency khi
`init.schema.sql` chạy bằng `sqlcmd`.

Các transaction nghiệp vụ vẫn nằm trong procedure tương ứng, không được tách thành
script chạy độc lập, để bảo toàn ranh giới `BEGIN/COMMIT/ROLLBACK` và xử lý lỗi.
