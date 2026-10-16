# Phân tích chuẩn hóa đến dạng chuẩn ba (3NF)

## 1. Tiêu chí sử dụng

Với quan hệ `R` và tập phụ thuộc hàm `F`:

- **1NF:** mỗi ô chứa một giá trị nguyên tử, không có nhóm cột lặp.
- **2NF:** đạt 1NF và mọi thuộc tính không khóa phụ thuộc đầy đủ vào toàn bộ khóa ứng viên, không phụ thuộc vào một phần khóa ghép.
- **3NF:** đạt 2NF và với mọi phụ thuộc hàm không tầm thường `X → A`, `X` là siêu khóa hoặc `A` là thuộc tính khóa.

Phân tích tách ba loại dữ liệu:

1. **Dữ liệu gốc** do nghiệp vụ nhập hoặc xác lập.
2. **Snapshot/tổng nghiệp vụ** được lưu tại chứng từ để giữ lịch sử và phục vụ đối soát.
3. **Cột `COMPUTED PERSISTED`** có công thức do SQL Server quản lý, không thể được ứng dụng ghi độc lập.

Không giả định phụ thuộc hàm nếu DDL hoặc ý nghĩa nghiệp vụ không chứng minh được. Ví dụ, không giả định hạng thành viên luôn được suy ra duy nhất từ điểm vì source không khai báo bảng ngưỡng hạng.

## 2. Chứng minh 1NF

Toàn bộ 23 quan hệ đạt 1NF:

- Mỗi bảng có PK và mỗi cột có một miền vô hướng SQL Server xác định.
- Không có danh sách sản phẩm, lô, thanh toán hoặc khuyến mãi được nhét vào một cột nhiều giá trị.
- Các nhóm lặp đã được tách thành bảng chi tiết/kết hợp:
  - khuyến mãi–sản phẩm → `KHUYEN_MAI_SAN_PHAM`;
  - phiếu nhập–lô → `CHI_TIET_PHIEU_NHAP`;
  - kiểm kê–lô → `CHI_TIET_KIEM_KE`;
  - hóa đơn–sản phẩm → `CHI_TIET_HOA_DON`;
  - dòng bán–lô xuất → `CHI_TIET_XUAT_LO`;
  - phiếu trả–lô đã xuất → `CHI_TIET_PHIEU_TRA`;
  - hóa đơn–các lần thanh toán → `THANH_TOAN`.

Các cột JSON/text audit `DuLieuCu`, `DuLieuMoi` được xem là payload nguyên tử của sự kiện audit, không được dùng làm khóa hoặc thay thế một quan hệ nghiệp vụ.

## 3. Chứng minh 2NF

Các bảng có PK một cột tự động không có phụ thuộc bộ phận vào PK. Năm bảng dùng khóa ghép được kiểm tra riêng:

| Quan hệ | Khóa ghép | Thuộc tính không khóa | Lý do phụ thuộc đầy đủ |
|---|---|---|---|
| KHUYEN_MAI_SAN_PHAM | `(MaKM, MaSP)` | Không có | Quan hệ kết hợp thuần túy. |
| CHI_TIET_KIEM_KE | `(MaKK, MaLo)` | `SoLuongHeThong`, `SoLuongThucTe`, `ChenhLech`, `LyDo` | Kết quả chỉ có nghĩa cho một lô trong một lần kiểm kê cụ thể. |
| CHI_TIET_XUAT_LO | `(MaCTHD, MaLo)` | `SoLuong` | Số lượng là lượng của đúng lô được phân bổ cho đúng dòng bán. |
| CHI_TIET_PHIEU_TRA | `(MaPT, MaCTHD, MaLo)` | `SoLuongTra`, `TienHoan`, `TinhTrangHang` | Một cặp dòng bán–lô có thể xuất hiện trên nhiều phiếu trả; dữ liệu trả phụ thuộc cả phiếu trả và lô xuất. |
| LO_HANG (khóa ứng viên) | `(MaSP, SoLo)` | Các thuộc tính còn lại | Cặp sản phẩm–số lô xác định duy nhất lô; `MaLo` đồng thời là khóa ứng viên khác. |

Các bảng chi tiết dùng surrogate PK còn có khóa ứng viên ghép:

- `CHI_TIET_PHIEU_NHAP`: `(MaPN, MaLo)` xác định dòng nhập.
- `CHI_TIET_HOA_DON`: `(MaHD, MaSP)` xác định dòng bán.

Trong cả hai trường hợp, mọi thuộc tính của dòng phụ thuộc vào cả cặp, không chỉ mã chứng từ hoặc mã hàng riêng lẻ. Vì vậy các quan hệ đạt 2NF.

## 4. Phụ thuộc hàm và đánh giá 3NF theo từng quan hệ

Ký hiệu `→ all` nghĩa là khóa ứng viên xác định toàn bộ thuộc tính còn lại của quan hệ.

| # | Quan hệ | Khóa ứng viên được chứng minh | Phụ thuộc hàm đáng chú ý | Đánh giá |
|---:|---|---|---|---|
| 1 | VAI_TRO | `{MaVaiTro}`, `{TenVaiTro}` | Mỗi khóa → all | 3NF/BCNF. |
| 2 | NHAN_VIEN | `{MaNV}`, `{SDT}` | Mỗi khóa → all | 3NF/BCNF. |
| 3 | KHACH_HANG | `{MaKH}`, `{SDT}` | Mỗi khóa → all | 3NF/BCNF theo các quy tắc được khai báo. |
| 4 | TAI_KHOAN | `{MaTK}`, `{TenDangNhap}`; có điều kiện `{MaNV}` hoặc `{MaKH}` khi khác null | Mỗi khóa → all; CHECK chủ sở hữu không tạo FD từ chủ sở hữu sang vai trò cụ thể của nhân viên | 3NF. Các khóa filtered là khóa ứng viên có điều kiện. |
| 5 | LOAI_SAN_PHAM | `{MaLoai}`, `{TenLoai}` | Mỗi khóa → all | 3NF/BCNF. |
| 6 | SAN_PHAM | `{MaSP}`; có điều kiện `{MaVach}` | Mỗi khóa → all | 3NF. |
| 7 | KHUYEN_MAI | `{MaKM}` | `MaKM → all`; `LoaiKM` chỉ điều khiển miền hợp lệ của `GiaTri`, không xác định `GiaTri` | 3NF/BCNF. |
| 8 | KHUYEN_MAI_SAN_PHAM | `{MaKM, MaSP}` | Không có thuộc tính không khóa | 3NF/BCNF. |
| 9 | NHA_CUNG_CAP | `{MaNCC}`, `{SDT}`; có điều kiện `{MaSoThue}` | Mỗi khóa → all | 3NF. |
| 10 | CA_LAM_VIEC | `{MaCa}` | `MaCa → all` | 3NF/BCNF. |
| 11 | PHIEU_NHAP | `{MaPN}` | `MaPN → all`; `TongTien` là tổng chứng từ/snapshot | 3NF trong quan hệ header; tổng được quản lý theo giao dịch nghiệp vụ. |
| 12 | LO_HANG | `{MaLo}`, `{MaSP, SoLo}` | Mỗi khóa → all | 3NF/BCNF. |
| 13 | CHI_TIET_PHIEU_NHAP | `{MaCTPN}`, `{MaPN, MaLo}` | Các khóa → all; `(SoLuong, DonGiaNhap) → ThanhTien` | Dữ liệu gốc đạt 3NF; `ThanhTien` là computed persisted có kiểm soát. |
| 14 | KIEM_KE | `{MaKK}` | `MaKK → all` | 3NF/BCNF. |
| 15 | CHI_TIET_KIEM_KE | `{MaKK, MaLo}` | Khóa → all; `(SoLuongHeThong, SoLuongThucTe) → ChenhLech` | Dữ liệu gốc đạt 3NF; `ChenhLech` là computed persisted có kiểm soát. |
| 16 | GIAO_DICH_KHO | `{MaGiaoDich}` | `MaGiaoDich → MaLo, LoaiGiaoDich, SoLuongBienDong, ThoiGian, MaThamChieu, MaNV, GhiChu` | 3NF/BCNF. `MaSP` được suy ra qua `LO_HANG`, không còn lưu trong quan hệ. |
| 17 | HOA_DON | `{MaHD}` | `MaHD → all`; các tổng/điểm là snapshot của chứng từ | 3NF trong quan hệ header; giá trị tổng hợp cần được giao dịch nghiệp vụ duy trì nhất quán. |
| 18 | CHI_TIET_HOA_DON | `{MaCTHD}`, `{MaHD, MaSP}` | Các khóa → all; `(SoLuong, DonGiaBan, TienGiam) → ThanhTien` | Dữ liệu gốc đạt 3NF; `ThanhTien` là computed persisted có kiểm soát. |
| 19 | CHI_TIET_XUAT_LO | `{MaCTHD, MaLo}` | Khóa → `SoLuong` | 3NF/BCNF. |
| 20 | THANH_TOAN | `{MaThanhToan}` | `MaThanhToan → all` | 3NF/BCNF. Không giả định mã giao dịch ngoài là duy nhất vì DDL không cưỡng chế. |
| 21 | PHIEU_TRA | `{MaPT}` | `MaPT → all`; `TongTienHoan` là tổng chứng từ/snapshot | 3NF trong quan hệ header. |
| 22 | CHI_TIET_PHIEU_TRA | `{MaPT, MaCTHD, MaLo}` | Khóa → `SoLuongTra, TienHoan, TinhTrangHang` | 3NF/BCNF. |
| 23 | NHAT_KY_HE_THONG | `{MaNhatKy}` | `MaNhatKy → all` | 3NF/BCNF; payload trước/sau là snapshot audit. |

## 5. Phân tích các thuộc tính dẫn xuất

### 5.1 Cột computed persisted

| Bảng | Cột | Công thức |
|---|---|---|
| CHI_TIET_PHIEU_NHAP | ThanhTien | `SoLuong × DonGiaNhap` |
| CHI_TIET_KIEM_KE | ChenhLech | `SoLuongThucTe - SoLuongHeThong` |
| CHI_TIET_HOA_DON | ThanhTien | `(SoLuong × DonGiaBan) - TienGiam` |

Nếu xem các cột này như thuộc tính thông thường, determinant của công thức không phải siêu khóa nên biểu diễn vật lý không ở BCNF/3NF nghiêm ngặt. Tuy nhiên:

- ứng dụng không thể ghi chúng độc lập;
- SQL Server tái tính theo biểu thức xác định;
- `PERSISTED` chỉ materialize kết quả phục vụ đọc/index;
- không tồn tại bất thường cập nhật giữa đầu vào và kết quả tính toán.

Vì vậy tài liệu phân loại chúng là **dữ liệu dẫn xuất được DBMS kiểm soát**, không phải dữ liệu gốc làm thất bại thiết kế logic 3NF.

### 5.2 Tổng và snapshot chứng từ

`PHIEU_NHAP.TongTien`, các tổng/điểm của `HOA_DON` và `PHIEU_TRA.TongTienHoan` có thể đối chiếu với các dòng chi tiết, nhưng chúng cũng là snapshot nghiệp vụ của chứng từ. Các giá bán/giá nhập trên dòng chi tiết tương tự là snapshot, không được thay bằng giá hiện hành trong bảng danh mục. Việc lưu snapshot bảo toàn lịch sử; stored procedure và transaction phải duy trì nhất quán.

Source hiện thực hiện việc đó qua `usp_PHIEU_NHAP_XacNhan`, `usp_HOA_DON_HoanTatBanHang` và `usp_PHIEU_TRA_HoanTat`. Các thủ tục tính tổng từ dữ liệu dòng trong cùng transaction thay vì tin vào tổng do client gửi.

## 6. Chuẩn hóa GIAO_DICH_KHO trong Phase 2.5

Thiết kế cũ lưu cả `MaLo` và `MaSP`, tạo phụ thuộc bắc cầu:

```text
MaGiaoDich → MaLo → MaSP
```

Kiểm tra source cho thấy `MaSP` không phải historical snapshot:

- các procedure nghiệp vụ không tái gán sản phẩm của một lô đã phát sinh giao dịch;
- backend chỉ cho sửa định nghĩa lô khi lô có tồn `0`, chưa thuộc phiếu nhập đã xác nhận và đang được chỉnh trong draft;
- mọi luồng nhập, bán, trả và kiểm kê đều lấy sản phẩm hiện hành từ chính `LO_HANG`.

Phase 2.5 đã loại bỏ `GIAO_DICH_KHO.MaSP` và `FK_GIAO_DICH_KHO_SAN_PHAM`. Lược đồ mới là:

```text
GIAO_DICH_KHO(
    MaGiaoDich PK,
    MaLo FK,
    LoaiGiaoDich,
    SoLuongBienDong,
    ThoiGian,
    MaThamChieu?,
    MaNV?,
    GhiChu?
)
```

Khi cần sản phẩm:

```sql
SELECT movement.*, lot.MaSP
FROM dbo.GIAO_DICH_KHO AS movement
JOIN dbo.LO_HANG AS lot ON lot.MaLo = movement.MaLo;
```

Kết quả: mọi thuộc tính không khóa trong `GIAO_DICH_KHO` phụ thuộc trực tiếp vào khóa `{MaGiaoDich}`; phụ thuộc bắc cầu cũ không còn nằm trong quan hệ.

### Bootstrap pre-003 và trạng thái cuối

Các file clean bootstrap cố ý tạo lại `GIAO_DICH_KHO` với `MaSP` và FK sản phẩm để migration lịch sử 002 có thể được replay nguyên vẹn. Đây chỉ là trạng thái trung gian ngay sau `init.sql`, chưa phải database hợp lệ để vận hành hoặc chấm thiết kế. Node migration runner là thành phần duy nhất tạo migration history; migration 003 kiểm tra consistency lịch sử, bảo toàn các dòng giao dịch rồi loại bỏ redundancy. Tất cả kết luận 3NF trong tài liệu này áp dụng cho trạng thái cuối sau khi 003 là `APPLIED`.

### Các bất biến liên bảng liên quan

Hai quy tắc sau được đường ghi stored procedure bảo vệ nhưng chưa được FK ghép biểu diễn đầy đủ:

- lô trong `CHI_TIET_XUAT_LO` phải thuộc sản phẩm của `CHI_TIET_HOA_DON`;
- `MaKM` trên `CHI_TIET_HOA_DON`, nếu có, phải tồn tại cho chính `MaSP` trong `KHUYEN_MAI_SAN_PHAM`.

`usp_HOA_DON_HoanTatBanHang` kiểm tra bảng gán khuyến mãi và chỉ chọn lô có đúng `MaSP`, nên luồng bán hàng chính thức thỏa các quy tắc. Direct DML vẫn có thể bỏ qua chúng; đây là vấn đề về phạm vi cưỡng chế toàn vẹn, không phải một phụ thuộc bộ phận trong hai bảng chi tiết.

## 7. Kết luận chuẩn hóa

- 23/23 quan hệ đạt 1NF.
- 23/23 quan hệ đạt 2NF.
- 23/23 quan hệ đạt 3NF đối với dữ liệu gốc theo dependency đã chứng minh.
- `GIAO_DICH_KHO` không còn lưu `MaSP`; sản phẩm được suy ra duy nhất từ `LO_HANG` qua `MaLo`.
- Ba cột computed persisted là materialization an toàn do DBMS quản lý; chúng được công bố rõ thay vì trình bày sai như dữ liệu độc lập.
- Thay đổi chuẩn hóa được thực hiện bởi migration `003_normalize_inventory_transaction_3nf.sql`; clean bootstrap giữ pre-003 chỉ để replay migration contract.
