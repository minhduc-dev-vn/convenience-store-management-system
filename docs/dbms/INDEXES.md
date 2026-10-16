# Thiết kế index và bằng chứng hiệu năng

## Vai trò và inventory

Index là cấu trúc vật lý giúp SQL Server tìm và sắp xếp tập hàng phù hợp mà không phải đọc toàn bộ bảng. Hệ thống cửa hàng cần index cho đăng nhập, tra cứu tồn theo lô, báo cáo hóa đơn, điều tra audit và danh sách nhập hàng. Index không thay đổi kết quả truy vấn; nó chỉ cung cấp access path khác cho optimizer.

Baseline cuối có 23 PK-backed index, 8 index backing `UNIQUE` constraint và 43 standalone index, tổng cộng 74 physical index trên 23 bảng nghiệp vụ. Trong 43 standalone index có 33 nonunique, 10 unique, 14 filtered và 24 có cột `INCLUDE`. `SCHEMA_MIGRATIONS` là bảng kỹ thuật nên không tính vào baseline nghiệp vụ.

- **PK-backed**: được SQL Server tạo để thực thi khóa chính; không tính là standalone evidence.
- **Unique constraint-backed**: thực thi candidate key khai báo bằng constraint.
- **Standalone nonclustered**: access path phục vụ workload và độc lập với PK/UQ constraint.
- **Filtered**: chỉ lưu hàng thỏa predicate, giảm kích thước và chi phí đọc khi query tương thích.
- **Covering**: key phục vụ seek/order; `INCLUDE` cung cấp output để tránh hoặc giảm key lookup.

## Năm index được benchmark

| Index | Bảng | Key columns | INCLUDE | Filter | Workload thật | Nguồn ứng dụng |
|---|---|---|---|---|---|---|
| `UQ_TAI_KHOAN_TenDangNhap` | `TAI_KHOAN` | `TenDangNhap` | hash, role, owner, status, last login | — | tìm đúng một account khi đăng nhập | `AuthRepository.findByUsername` → `usp_TAI_KHOAN_LayTheoTenDangNhap` |
| `IX_LO_HANG_MaSP_HanSuDung_ConTon` | `LO_HANG` | `MaSP, HanSuDung` | mã/số lô, ngày SX, tồn, trạng thái, giá nhập | `SoLuongTon > 0` | tra cứu lô còn tồn của một sản phẩm theo hạn dùng | `InventoryRepository.listLots`, `usp_LO_HANG_TraCuu`, view tồn theo lô |
| `IX_HOA_DON_BaoCao_TrangThai_NgayLap` | `HOA_DON` | `TrangThai, NgayLap, MaCa` | mã hóa đơn và các tổng tiền | — | tổng hợp hóa đơn đã thanh toán theo khoảng ngày/ca | business report procedures/views |
| `IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian` | `NHAT_KY_HE_THONG` | `TenBang, MaBanGhi, ThoiGian DESC` | actor, action, IP | `MaBanGhi IS NOT NULL` | điều tra lịch sử của một record, mới nhất trước | `AuditRepository` → `usp_NHAT_KY_HE_THONG_TraCuu` |
| `IX_PHIEU_NHAP_TrangThai_NgayNhap` | `PHIEU_NHAP` | `TrangThai, NgayNhap DESC` | mã phiếu, nhân viên, NCC, tiền, ngày xác nhận | — | phân trang phiếu nhập theo trạng thái/ngày | `ReceivingRepository.listReceipts` |

Projection benchmark cô lập các cột mà index hỗ trợ nhưng giữ predicate/order chủ đạo của workload nguồn. Query production có thể thêm join, window aggregate hoặc cột trình bày; bằng chứng đo access path trên bảng được index, không giả lập toàn bộ HTTP request.

## Môi trường và phương pháp

Benchmark chạy riêng trên `ConvenienceStoreIndexBenchmarkTest`, SQL Server 2022 Express 16.0.1210.3, compatibility 160. Database được bootstrap bằng `init.sql`, áp dụng migration 000–006, rồi sinh set-based 20,000 account, 10,001 product, 100,001 lot, 100,000 invoice, 200,000 audit row và 50,000 receipt.

Distribution có nhiều category/status/date/product/record target; lô có mix còn/hết tồn và `ACTIVE/BLOCKED/EXPIRED`; hóa đơn/phiếu nhập trải theo thời gian và nhiều trạng thái. Sau insert, sáu bảng mục tiêu được `UPDATE STATISTICS ... WITH FULLSCAN`.

Mỗi trạng thái có một warmup và năm lần đo với cùng query/dataset. Runner dùng `OPTION (RECOMPILE)`, `SET STATISTICS IO/TIME ON` và actual XML plan; không flush cache global, không dùng index hint. Số dưới đây là median năm lần đo.

## Kết quả before/after

| Index | Logical reads BEFORE | AFTER | Giảm | CPU ms trước/sau | Elapsed ms trước/sau | Plan trước | Plan sau |
|---|---:|---:|---:|---:|---:|---|---|
| `UQ_TAI_KHOAN_TenDangNhap` | 183 | 3 | 98.36% | 2 / 0 | 2 / 0 | Index Scan + clustered lookup | covering Index Seek |
| `IX_LO_HANG_MaSP_HanSuDung_ConTon` | 33 | 3 | 90.91% | 0 / 0 | 2 / 0 | alternate seek + clustered lookup | filtered covering Index Seek |
| `IX_HOA_DON_BaoCao_TrangThai_NgayLap` | 102 | 81 | 20.59% | 3 / 2 | 3 / 3 | date/status Index Seek | report covering Index Seek |
| `IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian` | 1,690 | 4 | 99.76% | 15 / 0 | 17 / 0 | time Index Scan | filtered target Index Seek |
| `IX_PHIEU_NHAP_TrangThai_NgayNhap` | 814 | 50 | 93.86% | 8 / 1 | 9 / 1 | Clustered Index Scan | covering Index Seek + small sort |

### Phân tích từng workload

1. **Username lookup.** Equality rất chọn lọc. Unique key cho seek; `INCLUDE` trả dữ liệu xác thực không cần lookup lại. Khi bỏ index, reads tăng từ 3 lên 183.
2. **Positive-stock lots.** Predicate khớp filter `SoLuongTon > 0`, `MaSP` là leading key và `HanSuDung` hỗ trợ thứ tự hạn dùng. INCLUDE bao phủ projection. Khi bỏ index, optimizer dùng `IX_LO_HANG_FEFO` rồi clustered lookup; reads tăng từ 3 lên 33.
3. **Paid invoice report.** `TrangThai` và range `NgayLap` tạo seek; `MaCa` hỗ trợ group, tổng tiền nằm trong leaf. Khi bỏ index vẫn còn `IX_HOA_DON_NgayLap_TrangThai`, nên mức giảm chỉ 20.59%; elapsed median bằng nhau ở dataset local. Đây là lợi ích vừa phải nhưng có thật về I/O và CPU.
4. **Audit target.** Cặp table/record có selectivity cao, thứ tự thời gian đáp ứng điều tra mới nhất. Filter loại log không gắn record. Khi bỏ index, SQL Server scan index thời gian 1,690 reads; với index chỉ 4 reads.
5. **Receipt status/date.** Leading status và ngày giảm tập phải đọc; INCLUDE bao phủ header list. Khi bỏ index là clustered scan 814 reads; với index là seek 50 reads. Sort nhỏ còn lại phục vụ tie-break `MaPN DESC`.

## Tính đúng và execution plan

Runner so sánh `COUNT_BIG` cộng checksum/tổng tiền trước drop, khi không index và sau recreate. Cả năm case PASS. Actual plans nằm tại `database/benchmarks/results/plans/`; `*_statistics.txt` chứng minh IO/TIME đã bật. Để trình bày trong SSMS, mở `database/benchmarks/02_index_performance.sql`, nhấn `Ctrl+M`, chạy query và xem Messages/Execution Plan.

## Review trùng/lấn của 43 index

So sánh `sys.indexes`, `sys.index_columns`, key order, INCLUDE, uniqueness và filter không phát hiện exact duplicate hoặc same-key/same-definition duplicate.

Một số nhóm chung leading key nhưng khác contract: hai index `LO_HANG` tách FEFO/trạng thái khỏi positive-stock covering; hai index `PHIEU_NHAP` tách ngày nhập khỏi ngày xác nhận báo cáo; filtered unique index trên `GIAO_DICH_KHO`, `THANH_TOAN`, `CA_LAM_VIEC` thực thi invariant khác lookup index. Đây là **POTENTIAL INDEX CLEANUP** chỉ khi có production usage/write-cost evidence; Phase 6 không xóa index nào.

## Trade-off

Index giảm logical reads và latency đọc, nhưng chiếm storage, tăng write amplification cho `INSERT/UPDATE/DELETE`, cần statistics/fragmentation maintenance và có thể cạnh tranh với index gần giống. Vì vậy không thể kết luận càng nhiều index càng tốt. Baseline 43 index được giữ nguyên; không có migration 007 và không có schema change trên Main.

Chi tiết tái lập và artifact máy đọc được nằm tại [`database/benchmarks/README.md`](../../database/benchmarks/README.md) và [`index_performance_results.md`](../../database/benchmarks/results/index_performance_results.md).
