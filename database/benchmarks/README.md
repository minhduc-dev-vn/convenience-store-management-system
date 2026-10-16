# Index performance benchmark

Bộ benchmark này chỉ chạy trên SQL Server Express local và database disposable `ConvenienceStoreIndexBenchmarkTest`. Script từ chối database khác, đặc biệt không bao giờ được chạy trên `ConvenienceStore_DBMS`.

## Quy trình tái lập

Từ thư mục gốc repository:

```powershell
sqlcmd -S ".\SQLEXPRESS" -E -C -I -d master -b -Q "CREATE DATABASE [ConvenienceStoreIndexBenchmarkTest]"
sqlcmd -S ".\SQLEXPRESS" -E -C -I -d "ConvenienceStoreIndexBenchmarkTest" -b -f 65001 -i ".\database\init.sql"

Push-Location .\backend
$env:DB_SERVER='localhost'
$env:DB_INSTANCE='SQLEXPRESS'
$env:DB_NAME='ConvenienceStoreIndexBenchmarkTest'
$env:DB_TRUSTED_CONNECTION='true'
npm run migrate
Pop-Location

sqlcmd -S ".\SQLEXPRESS" -E -C -I -d master -b -f 65001 `
  -v DatabaseName="ConvenienceStoreIndexBenchmarkTest" `
  -i ".\database\benchmarks\01_generate_benchmark_data.sql"

.\database\benchmarks\run_index_benchmark.ps1 `
  -ServerInstance ".\SQLEXPRESS" `
  -DatabaseName "ConvenienceStoreIndexBenchmarkTest" `
  -MeasuredRuns 5

sqlcmd -S ".\SQLEXPRESS" -E -C -I -d master -b -f 65001 `
  -v DatabaseName="ConvenienceStoreIndexBenchmarkTest" `
  -i ".\database\benchmarks\03_cleanup.sql"
```

Nếu migration runner cần biến môi trường bổ sung tại máy hiện tại, giữ cấu hình local nhưng bắt buộc đổi `DB_NAME` sang database benchmark.

## Phương pháp

- Dữ liệu được sinh set-based và chỉ chứa giá trị tổng hợp/placeholder.
- Sáu bảng mục tiêu được `UPDATE STATISTICS ... WITH FULLSCAN` sau bulk insert.
- Mỗi trạng thái `WITHOUT INDEX` và `WITH INDEX` có một lần warmup rồi năm lần đo.
- Query dùng `OPTION (RECOMPILE)`, không dùng index hint, `FORCESEEK`, `DBCC DROPCLEANBUFFERS` hoặc `DBCC FREEPROCCACHE`.
- Runner bật `SET STATISTICS IO ON`, `SET STATISTICS TIME ON` và `SET STATISTICS XML ON`.
- Logical reads, CPU và elapsed trong CSV/JSON là median năm actual plan. `*_statistics.txt` lưu output IO/TIME đại diện; `.sqlplan` lưu actual plan đầu tiên của mỗi trạng thái.
- Trước/sau được so bằng `COUNT_BIG` cùng checksum hoặc tổng tiền. Sai khác làm runner dừng.
- Mỗi index được khôi phục bằng đúng DDL nguồn; khối `finally` kiểm tra và tái tạo nếu lần đo lỗi.

## Xem trực tiếp trong SSMS

Mở `02_index_performance.sql`, bật **Include Actual Execution Plan** bằng `Ctrl+M`, rồi chạy từng workload. Tab **Messages** hiển thị IO/TIME; tab **Execution Plan** cho biết Scan/Seek và index được chọn. Runner PowerShell là đường tái lập đầy đủ cho thao tác drop/recreate có kiểm soát.

## Artifact

- `results/index_performance_results.md`: kết luận và bảng số liệu đã xác minh.
- `results/index_performance_results.csv` và `.json`: dữ liệu machine-readable.
- `results/plans/*.sqlplan`: actual plan before/after.
- `results/plans/*_statistics.txt`: mẫu output `STATISTICS IO/TIME`.

Không commit database backup, trace lớn hay dữ liệu production. Sau khi thu bằng chứng, mặc định chạy `03_cleanup.sql` để xóa database benchmark.
