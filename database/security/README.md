# Local SQL Server security setup

Thư mục này tách phần **server-level** khỏi migration database. Migration
`006_add_dbms_database_roles.sql` chỉ tạo bốn database role và quyền lâu dài;
file này hướng dẫn tạo bốn SQL login cục bộ để demo đăng nhập thật. Backend
không dùng các login này và vẫn kết nối bằng technical principal hiện tại.

## Điều kiện

Kiểm tra chế độ xác thực trước khi tạo login:

```sql
SELECT CAST(SERVERPROPERTY('IsIntegratedSecurityOnly') AS int)
    AS IsIntegratedSecurityOnly;
```

`0` nghĩa là Mixed Mode và có thể tiếp tục. `1` nghĩa là Windows-only: không
thay registry, không restart dịch vụ và không tạo Windows user chỉ để vượt qua
giới hạn này. Vẫn có thể áp dụng migration 006 và chạy test role bằng user
`WITHOUT LOGIN`, nhưng kiểm thử SQL login thật phải được ghi nhận là blocked.

## Tạo login cục bộ

Chạy migration 006 trước. Sau đó mở PowerShell tại thư mục `database/`. Đoạn
sau sinh bốn password mạnh trong bộ nhớ tiến trình, truyền chúng cho `sqlcmd`
qua environment variable và không đưa password lên command line hoặc output:

```powershell
function New-DbmsPassword {
  $bytes = [byte[]]::new(24)
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return [Convert]::ToBase64String($bytes) + 'aA1!'
}

$env:DatabaseName = 'ConvenienceStore_DBMS'
$env:DBMS_CUSTOMER_PASSWORD = New-DbmsPassword
$env:DBMS_CASHIER_PASSWORD = New-DbmsPassword
$env:DBMS_WAREHOUSE_PASSWORD = New-DbmsPassword
$env:DBMS_MANAGER_PASSWORD = New-DbmsPassword

sqlcmd -S '.\SQLEXPRESS' -E -C -I -b -f 65001 `
  -i '.\security\01_create_local_logins.sql'
```

Script không reset password của login đã tồn tại. Giữ các biến chỉ trong terminal
hiện tại nếu cần chạy kiểm thử đăng nhập ngay, sau đó xóa chúng:

```powershell
Remove-Item Env:DBMS_CUSTOMER_PASSWORD, Env:DBMS_CASHIER_PASSWORD, `
  Env:DBMS_WAREHOUSE_PASSWORD, Env:DBMS_MANAGER_PASSWORD
```

Không ghi các biến này vào `.env`, README, lịch sử lệnh, source control hoặc
output CI. Nếu cần credential dùng lâu hơn cho demo, lưu bằng secret manager của
môi trường thay vì file trong repository.

## Demo quyền

Chạy ma trận quyền bằng Windows administrator connection:

```powershell
$env:DatabaseName = 'ConvenienceStore_DBMS'
sqlcmd -S '.\SQLEXPRESS' -E -C -I -b -f 65001 `
  -i '.\security\02_permission_demo.sql'
```

Để chứng minh kết nối SQL authentication thật, đặt `SQLCMDPASSWORD` lần lượt từ
biến runtime tương ứng rồi chạy `sqlcmd -U <login>`. Không dùng tùy chọn `-P`, vì
nó làm password xuất hiện trên command line. Mỗi kết nối cần kiểm tra
`SUSER_SNAME()`, `USER_NAME()`, `IS_ROLEMEMBER(...)`, một thao tác được phép và
một thao tác bị từ chối.

`database/tests/13_security_tests.sql` dùng user tạm `WITHOUT LOGIN` để kiểm thử
tự động GRANT, DENY, membership và một GRANT/REVOKE có kiểm soát. Thay đổi demo
được rollback hoàn toàn, không sửa policy lâu dài trên database chính.

## Dọn login khi không còn cần

File cleanup xóa đúng bốn database user và bốn login được tài liệu hóa. Không
chạy file này ở cuối Phase 5 nếu còn cần demo:

```powershell
$env:DatabaseName = 'ConvenienceStore_DBMS'
sqlcmd -S '.\SQLEXPRESS' -E -C -I -b -f 65001 `
  -i '.\security\03_cleanup_local_logins.sql'
```
