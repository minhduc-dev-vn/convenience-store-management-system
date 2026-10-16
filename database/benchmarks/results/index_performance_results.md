# Kết quả benchmark index

Thời điểm đo: 2026-10-15 (Asia/Bangkok). Kết quả được tạo từ một lần chạy hoàn chỉnh của `run_index_benchmark.ps1`, gồm một warmup và năm lần đo cho mỗi trạng thái.

## Môi trường

| Thuộc tính | Giá trị |
|---|---|
| SQL Server | Microsoft SQL Server 2022 Express, 64-bit |
| Product version | 16.0.1210.3 RTM |
| Compatibility level | 160 |
| Database | `ConvenienceStoreIndexBenchmarkTest` |
| Migrations | 000–006 applied |
| Statistics | `FULLSCAN` sau bulk insert |
| Accounts / products / lots | 20,000 / 10,001 / 100,001 |
| Invoices / audit logs / receipts | 100,000 / 200,000 / 50,000 |

## Median của năm lần đo

| Index | Reads không index | Reads có index | Giảm reads | CPU ms không/có | Elapsed ms không/có | Plan không index | Plan có index |
|---|---:|---:|---:|---:|---:|---|---|
| `UQ_TAI_KHOAN_TenDangNhap` | 183 | 3 | 98.36% | 2 / 0 | 2 / 0 | scan index trạng thái + clustered lookup | covering Index Seek |
| `IX_LO_HANG_MaSP_HanSuDung_ConTon` | 33 | 3 | 90.91% | 0 / 0 | 2 / 0 | seek `IX_LO_HANG_FEFO` + clustered lookup | filtered covering Index Seek |
| `IX_HOA_DON_BaoCao_TrangThai_NgayLap` | 102 | 81 | 20.59% | 3 / 2 | 3 / 3 | seek index `(NgayLap, TrangThai)` | covering seek `(TrangThai, NgayLap, MaCa)` |
| `IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian` | 1,690 | 4 | 99.76% | 15 / 0 | 17 / 0 | scan index thời gian | filtered Index Seek theo target |
| `IX_PHIEU_NHAP_TrangThai_NgayNhap` | 814 | 50 | 93.86% | 8 / 1 | 9 / 1 | clustered index scan | covering Index Seek + sort tie-break |

CPU/elapsed ở mức millisecond có noise và không được biến thành regression threshold. Logical reads và thay đổi access method là bằng chứng chính. Index hóa đơn vẫn có lợi nhưng mức giảm thấp hơn vì schema đã có index ngày/trạng thái thay thế; đây là kết quả thực, không ép optimizer bằng hint.

## Tính đúng và plan

Năm workload đều có `Equivalent = true`. Chữ ký kết quả trước khi drop, khi không có index và sau khi recreate giống nhau. Sau benchmark, cả năm index đều tồn tại và enabled.

Các file `plans/*_without.sqlplan` và `plans/*_with.sqlplan` là actual XML plan do SQL Server sinh. Mỗi cặp dùng đúng dataset, predicate và projection; không có `INDEX(...)` hay `FORCESEEK`.
