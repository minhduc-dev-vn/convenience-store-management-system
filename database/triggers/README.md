# Triggers

Thư mục này chứa source trình bày trực tiếp của đúng 5 DML trigger. Mỗi file chỉ
định nghĩa một trigger bằng `CREATE OR ALTER TRIGGER`; không dùng dynamic SQL.

`01_trg_NHAT_KY_HE_THONG_AppendOnly.sql` thuộc baseline và được gọi bởi
`init.schema.sql`. Bốn file còn lại là source dễ đọc tương ứng với migration 005.
Migration 005 vẫn là lịch sử triển khai bất biến và không được sửa sau khi đã apply.
