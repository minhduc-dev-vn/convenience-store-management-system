# User-defined functions

Phase 3 bổ sung đúng 5 user-defined function thuộc schema `dbo`. Cả năm đều là inline table-valued function (inline TVF): chỉ đọc/tính toán, không có side effect, không dùng dynamic SQL và nhận ngày tham chiếu tường minh. Migration authoritative là `database/migrations/004_add_dbms_user_defined_functions.sql`; `database/functions/` chứa năm source trình bày, mỗi file đúng một `CREATE OR ALTER FUNCTION`, được đánh số theo dependency để chạy trực tiếp trong SSMS.

## Tổng quan thiết kế

| Function | Loại | Mục đích | Được dùng bởi |
|---|---|---|---|
| `dbo.ufn_LO_HANG_PhanLoaiHanDung` | Inline TVF | Phân loại một lô và tính số ngày còn lại | Hai UDF tồn kho/lô |
| `dbo.ufn_LO_HANG_TheoSanPham` | Inline TVF | Trả danh sách lô đã phân loại theo sản phẩm | `usp_LO_HANG_TraCuu`, UDF tổng hợp tồn |
| `dbo.ufn_TON_KHO_TheoSanPham` | Inline TVF | Tổng hợp tồn tổng, khả dụng, cận hạn, hết hạn và bị khóa | `usp_TON_KHO_SAN_PHAM_TraCuu`, UDF POS |
| `dbo.ufn_SAN_PHAM_CoTheBan` | Inline TVF | Trả catalog POS có sản phẩm/category active và tồn bán được | `PosRepository` search/barcode/quote |
| `dbo.ufn_HOA_DON_PhanBoCoTheTra` | Inline TVF | Tính lượng đã trả và còn có thể trả theo từng phân bổ lô | `InvoiceRepository` |

Không function nào thay đổi logic ghi kho, thứ tự FEFO, giá bán, khuyến mãi hay số tiền hoàn. UDF tồn kho chỉ phục vụ read-side. Procedure bán hàng vẫn là nguồn authoritative của khóa, kiểm tra tồn và mutation FEFO.

## `dbo.ufn_LO_HANG_PhanLoaiHanDung`

Parameters:

- `@HanSuDung DATE`: hạn sử dụng; `NULL` nghĩa là không có hạn xác định.
- `@TrangThaiLo VARCHAR(20)`: trạng thái lô hiện tại.
- `@NgayThamChieu DATE`: ngày nghiệp vụ dùng để so sánh.
- `@NguongCanHanNgay INT`: ngưỡng cận hạn, hợp lệ từ 0 đến 3650.

Return: một dòng gồm `TinhTrangHanDung VARCHAR(20)` và `SoNgayConLai INT`.

Business rule:

- `EXPIRED` khi trạng thái lô là `EXPIRED` hoặc `HanSuDung <= NgayThamChieu`.
- `NEAR_EXPIRY` khi hạn dùng sau ngày tham chiếu và không quá ngưỡng.
- Các trường hợp hợp lệ còn lại là `VALID`; lô không có hạn dùng là `VALID` và số ngày còn lại là `NULL`.
- Ngày tham chiếu `NULL` hoặc ngưỡng ngoài `[0, 3650]` trả classification `NULL`. Procedure gọi UDF vẫn validate và trả lỗi nghiệp vụ như trước.

```sql
SELECT *
FROM dbo.ufn_LO_HANG_PhanLoaiHanDung('2026-11-14', 'ACTIVE', '2026-10-15', 30);
```

## `dbo.ufn_LO_HANG_TheoSanPham`

Parameters: `@MaSP VARCHAR(10)` (cho phép `NULL` để lấy mọi sản phẩm), `@NgayThamChieu DATE`, `@NguongCanHanNgay INT`.

Return: thông tin lô từ `vw_TON_KHO_THEO_LO`, cộng `SoNgayConLai` và `TinhTrangHanDung`.

Function tái sử dụng `ufn_LO_HANG_PhanLoaiHanDung` và được migration 004 tích hợp vào `usp_LO_HANG_TraCuu` mà không đổi output contract. Ngày `NULL` hoặc ngưỡng ngoài `[0, 3650]` trả tập rỗng; sản phẩm không tồn tại cũng trả tập rỗng.

```sql
SELECT *
FROM dbo.ufn_LO_HANG_TheoSanPham('SPDEV001', '2026-10-15', 30)
ORDER BY HanSuDung, MaLo;
```

## `dbo.ufn_TON_KHO_TheoSanPham`

Parameters: `@MaSP VARCHAR(10)` (cho phép `NULL`), `@NgayThamChieu DATE`, `@NguongCanHanNgay INT`.

Return: một dòng mỗi sản phẩm với `TongTon`, `TongTonKhaDung`, `TongTonCanHan`, `TongTonHetHan`, `TongTonBiKhoa`, `SoLoConTon`, `SoLoCanHan`, `SoLoHetHan`.

Tồn khả dụng chỉ gồm lô `ACTIVE` có classification `VALID` hoặc `NEAR_EXPIRY`. Tồn bị khóa không tính phần đã hết hạn; tồn hết hạn theo cùng classification dùng ở drill-down. Migration 004 thay CTE tổng hợp lặp trong `usp_TON_KHO_SAN_PHAM_TraCuu` bằng UDF này, giữ nguyên filter, paging và output.

```sql
SELECT *
FROM dbo.ufn_TON_KHO_TheoSanPham('SPDEV001', '2026-10-15', 30);
```

## `dbo.ufn_SAN_PHAM_CoTheBan`

Parameter: `@NgayThamChieu DATE`.

Return: sản phẩm, barcode, đơn vị, giá bán, ngành hàng và `TonKhaDung` cho các sản phẩm/category đều `ACTIVE` và có tồn bán được lớn hơn 0.

`PosRepository.searchSellableProducts`, `findSellableProductByBarcode` và `findQuoteProducts` gọi trực tiếp UDF này. Quote dùng `LEFT JOIN` để vẫn nhận diện sản phẩm inactive/không đủ tồn và trả lỗi nghiệp vụ đúng như trước. Repository tính ngày nghiệp vụ Việt Nam bằng `SE Asia Standard Time` rồi truyền ngày rõ ràng vào function. `NULL` trả tập rỗng.

```sql
DECLARE @Ngay DATE = CONVERT(
    DATE,
    (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'SE Asia Standard Time'
);
SELECT * FROM dbo.ufn_SAN_PHAM_CoTheBan(@Ngay);
```

Application chain: `GET /api/pos/products` hoặc `GET /api/pos/products/barcode/:barcode` → POS service → `PosRepository` → `dbo.ufn_SAN_PHAM_CoTheBan`.

## `dbo.ufn_HOA_DON_PhanBoCoTheTra`

Parameter: `@MaHD VARCHAR(15)`.

Return: `MaCTHD`, `MaLo`, `SoLo`, `SoLuongXuat`, `SoLuongDaTra`, `SoLuongConLaiCoTheTra` cho từng phân bổ lô của hóa đơn.

Chỉ phiếu trả `COMPLETED` được cộng vào `SoLuongDaTra`; phiếu `CREATED`/`CANCELLED` không làm giảm lượng còn trả. `InvoiceRepository.findInvoiceDetail` gọi trực tiếp UDF cho cả tổng theo dòng hóa đơn và danh sách phân bổ lô. `NULL` hoặc mã không tồn tại trả tập rỗng.

```sql
SELECT *
FROM dbo.ufn_HOA_DON_PhanBoCoTheTra('HD000000000001')
ORDER BY MaCTHD, MaLo;
```

Application chain: API chi tiết hóa đơn → invoice service → `InvoiceRepository.findInvoiceDetail` → `dbo.ufn_HOA_DON_PhanBoCoTheTra`.

## Kiểm thử và migration contract

- `database/tests/11_user_defined_function_tests.sql` kiểm tra happy path, ngày biên, `NULL`, input không hợp lệ và rollback fixture cho cả 5 UDF.
- `database/tests/10_integrity_packaging_tests.sql` khóa metadata ở đúng 5 UDF.
- `database/tests/run_all.sql` chạy suite UDF cùng toàn bộ regression cũ.
- `init.sql`/`init.production.sql` vẫn tạo baseline pre-migration với 0 UDF; Node runner áp dụng 000–006, trong đó migration 004 tạo 5 UDF và migration 005/006 không đổi chúng. Init không seed migration history.
