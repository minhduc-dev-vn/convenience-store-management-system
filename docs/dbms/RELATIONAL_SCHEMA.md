# Lược đồ quan hệ

Lược đồ dưới đây là trạng thái cuối sau khi Node migration runner áp dụng 000–006. Clean bootstrap trước migration là trạng thái trung gian pre-003/pre-004/pre-005/pre-006; migration 004 bổ sung UDF, migration 005 bổ sung trigger và migration 006 bổ sung database role nhưng không đổi quan hệ bảng.

## Quy ước biểu diễn

- Thuộc tính khóa chính được ghi `PK(...)`.
- Khóa ứng viên/duy nhất được ghi `AK(...)`; điều kiện `WHERE ... IS NOT NULL` biểu thị unique index có lọc.
- Khóa ngoại được ghi `FK(cột) → BẢNG(cột)`.
- `?` sau tên cột nghĩa là nullable.
- Các FK không khai báo `ON DELETE` hoặc `ON UPDATE`; SQL Server dùng `NO ACTION` mặc định.
- Cột `IDENTITY` và cột tính toán vẫn được liệt kê vì chúng thuộc lược đồ vật lý.

## A. Identity / Account

### VAI_TRO

```text
VAI_TRO(MaVaiTro, TenVaiTro, MoTa?)
PK(MaVaiTro)
AK(TenVaiTro)
```

### NHAN_VIEN

```text
NHAN_VIEN(MaNV, HoTen, NgaySinh?, GioiTinh?, SDT, Email?, DiaChi?,
          NgayVaoLam, LuongCoBan, TrangThai)
PK(MaNV)
AK(SDT)
```

### KHACH_HANG

```text
KHACH_HANG(MaKH, HoTen, SDT, Email?, DiaChi?, NgaySinh?, DiemTichLuy,
           HangThanhVien, NgayDangKy, TrangThai)
PK(MaKH)
AK(SDT)
```

### TAI_KHOAN

```text
TAI_KHOAN(MaTK IDENTITY, TenDangNhap, MatKhauHash, MaVaiTro, MaNV?, MaKH?,
          LanDangNhapCuoi?, TrangThai, NgayTao)
PK(MaTK)
AK(TenDangNhap)
AK(MaNV) WHERE MaNV IS NOT NULL
AK(MaKH) WHERE MaKH IS NOT NULL
FK(MaVaiTro) → VAI_TRO(MaVaiTro)
FK(MaNV)      → NHAN_VIEN(MaNV)
FK(MaKH)      → KHACH_HANG(MaKH)
```

Quy tắc bổ sung: đúng một trong `MaNV`, `MaKH` phải có giá trị; `CUSTOMER` đi với `MaKH`, còn `CASHIER`, `WAREHOUSE`, `MANAGER` đi với `MaNV`.

## B. Catalog / Promotion / Supplier

### LOAI_SAN_PHAM

```text
LOAI_SAN_PHAM(MaLoai, TenLoai, MoTa?, TrangThai)
PK(MaLoai)
AK(TenLoai)
```

### SAN_PHAM

```text
SAN_PHAM(MaSP, TenSP, MaVach?, DonViTinh, GiaBan, ImageUrl?,
         MucTonToiThieu, MaLoai, TrangThai)
PK(MaSP)
AK(MaVach) WHERE MaVach IS NOT NULL
FK(MaLoai) → LOAI_SAN_PHAM(MaLoai)
```

### KHUYEN_MAI

```text
KHUYEN_MAI(MaKM, TenKM, LoaiKM, GiaTri, GiaTriDonToiThieu, MucGiamToiDa?,
           NgayBatDau, NgayKetThuc, TrangThai)
PK(MaKM)
```

### KHUYEN_MAI_SAN_PHAM

```text
KHUYEN_MAI_SAN_PHAM(MaKM, MaSP)
PK(MaKM, MaSP)
FK(MaKM) → KHUYEN_MAI(MaKM)
FK(MaSP) → SAN_PHAM(MaSP)
```

### NHA_CUNG_CAP

```text
NHA_CUNG_CAP(MaNCC, TenNCC, SDT, Email?, DiaChi?, MaSoThue?, TrangThai)
PK(MaNCC)
AK(SDT)
AK(MaSoThue) WHERE MaSoThue IS NOT NULL
```

## C. Inventory / Receiving / Stocktake

### CA_LAM_VIEC

```text
CA_LAM_VIEC(MaCa IDENTITY, MaNV, GioBatDau, GioKetThuc?, TienDauCa,
            TienCuoiCa?, TrangThai, GhiChu?)
PK(MaCa)
FK(MaNV) → NHAN_VIEN(MaNV)
```

### PHIEU_NHAP

```text
PHIEU_NHAP(MaPN, NgayNhap, MaNV, MaNCC, TongTien, TrangThai,
           NgayXacNhan?, GhiChu?)
PK(MaPN)
FK(MaNV)  → NHAN_VIEN(MaNV)
FK(MaNCC) → NHA_CUNG_CAP(MaNCC)
```

### LO_HANG

```text
LO_HANG(MaLo, MaSP, SoLo, NgaySanXuat?, HanSuDung?, GiaNhap,
        SoLuongTon, TrangThai)
PK(MaLo)
AK(MaSP, SoLo)
FK(MaSP) → SAN_PHAM(MaSP)
```

### CHI_TIET_PHIEU_NHAP

```text
CHI_TIET_PHIEU_NHAP(MaCTPN IDENTITY, MaPN, MaLo, SoLuong, DonGiaNhap,
                    ThanhTien COMPUTED PERSISTED)
PK(MaCTPN)
AK(MaPN, MaLo)
FK(MaPN) → PHIEU_NHAP(MaPN)
FK(MaLo) → LO_HANG(MaLo)
```

### KIEM_KE

```text
KIEM_KE(MaKK, NgayKiemKe, MaNV, TrangThai, GhiChu?)
PK(MaKK)
FK(MaNV) → NHAN_VIEN(MaNV)
```

### CHI_TIET_KIEM_KE

```text
CHI_TIET_KIEM_KE(MaKK, MaLo, SoLuongHeThong, SoLuongThucTe,
                 ChenhLech COMPUTED PERSISTED, LyDo?)
PK(MaKK, MaLo)
FK(MaKK) → KIEM_KE(MaKK)
FK(MaLo) → LO_HANG(MaLo)
```

### GIAO_DICH_KHO

```text
GIAO_DICH_KHO(MaGiaoDich IDENTITY, MaLo, LoaiGiaoDich,
              SoLuongBienDong, ThoiGian, MaThamChieu?, MaNV?, GhiChu?)
PK(MaGiaoDich)
FK(MaLo) → LO_HANG(MaLo)
FK(MaNV) → NHAN_VIEN(MaNV)
```

Sản phẩm của giao dịch được suy ra qua `GIAO_DICH_KHO.MaLo → LO_HANG.MaSP`; bảng không còn lưu `MaSP` dư thừa.

## D. Sales / Payment

### HOA_DON

```text
HOA_DON(MaHD, NgayLap, MaCa, MaKH?, TongTienHang, TongGiamGia,
        TongThanhToan, DiemSuDung, DiemTichLuy, TrangThai, GhiChu?)
PK(MaHD)
FK(MaCa) → CA_LAM_VIEC(MaCa)
FK(MaKH) → KHACH_HANG(MaKH)
```

### CHI_TIET_HOA_DON

```text
CHI_TIET_HOA_DON(MaCTHD IDENTITY, MaHD, MaSP, MaKM?, SoLuong,
                 DonGiaBan, TienGiam, ThanhTien COMPUTED PERSISTED)
PK(MaCTHD)
AK(MaHD, MaSP)
FK(MaHD) → HOA_DON(MaHD)
FK(MaSP) → SAN_PHAM(MaSP)
FK(MaKM) → KHUYEN_MAI(MaKM)
```

### CHI_TIET_XUAT_LO

```text
CHI_TIET_XUAT_LO(MaCTHD, MaLo, SoLuong)
PK(MaCTHD, MaLo)
FK(MaCTHD) → CHI_TIET_HOA_DON(MaCTHD)
FK(MaLo)   → LO_HANG(MaLo)
```

### THANH_TOAN

```text
THANH_TOAN(MaThanhToan IDENTITY, MaHD, ThoiGian, PhuongThuc, SoTien,
           TrangThai, MaGiaoDichNgoai?)
PK(MaThanhToan)
FK(MaHD) → HOA_DON(MaHD)
```

## E. Returns

### PHIEU_TRA

```text
PHIEU_TRA(MaPT, MaHD, MaNV, NgayTra, LyDo, TongTienHoan, TrangThai)
PK(MaPT)
FK(MaHD) → HOA_DON(MaHD)
FK(MaNV) → NHAN_VIEN(MaNV)
```

### CHI_TIET_PHIEU_TRA

```text
CHI_TIET_PHIEU_TRA(MaPT, MaCTHD, MaLo, SoLuongTra, TienHoan,
                   TinhTrangHang)
PK(MaPT, MaCTHD, MaLo)
FK(MaPT)          → PHIEU_TRA(MaPT)
FK(MaCTHD, MaLo) → CHI_TIET_XUAT_LO(MaCTHD, MaLo)
```

## F. Audit

### NHAT_KY_HE_THONG

```text
NHAT_KY_HE_THONG(MaNhatKy IDENTITY, MaTK?, HanhDong, TenBang,
                 MaBanGhi?, DuLieuCu?, DuLieuMoi?, ThoiGian, DiaChiIP?)
PK(MaNhatKy)
FK(MaTK) → TAI_KHOAN(MaTK)
```

CHECK `CK_NHAT_KY_HE_THONG_NoSensitiveData` ngăn dữ liệu audit chứa các từ khóa bí mật như mật khẩu, token, secret, authorization hoặc JWT.

## Danh mục 30 khóa ngoại

| # | Bảng con | Cột | Bảng cha | Cột | Nullable |
|---:|---|---|---|---|---|
| 1 | TAI_KHOAN | MaVaiTro | VAI_TRO | MaVaiTro | Không |
| 2 | TAI_KHOAN | MaNV | NHAN_VIEN | MaNV | Có |
| 3 | TAI_KHOAN | MaKH | KHACH_HANG | MaKH | Có |
| 4 | SAN_PHAM | MaLoai | LOAI_SAN_PHAM | MaLoai | Không |
| 5 | KHUYEN_MAI_SAN_PHAM | MaKM | KHUYEN_MAI | MaKM | Không |
| 6 | KHUYEN_MAI_SAN_PHAM | MaSP | SAN_PHAM | MaSP | Không |
| 7 | CA_LAM_VIEC | MaNV | NHAN_VIEN | MaNV | Không |
| 8 | PHIEU_NHAP | MaNV | NHAN_VIEN | MaNV | Không |
| 9 | PHIEU_NHAP | MaNCC | NHA_CUNG_CAP | MaNCC | Không |
| 10 | LO_HANG | MaSP | SAN_PHAM | MaSP | Không |
| 11 | CHI_TIET_PHIEU_NHAP | MaPN | PHIEU_NHAP | MaPN | Không |
| 12 | CHI_TIET_PHIEU_NHAP | MaLo | LO_HANG | MaLo | Không |
| 13 | KIEM_KE | MaNV | NHAN_VIEN | MaNV | Không |
| 14 | CHI_TIET_KIEM_KE | MaKK | KIEM_KE | MaKK | Không |
| 15 | CHI_TIET_KIEM_KE | MaLo | LO_HANG | MaLo | Không |
| 16 | GIAO_DICH_KHO | MaLo | LO_HANG | MaLo | Không |
| 17 | GIAO_DICH_KHO | MaNV | NHAN_VIEN | MaNV | Có |
| 18 | HOA_DON | MaCa | CA_LAM_VIEC | MaCa | Không |
| 19 | HOA_DON | MaKH | KHACH_HANG | MaKH | Có |
| 20 | CHI_TIET_HOA_DON | MaHD | HOA_DON | MaHD | Không |
| 21 | CHI_TIET_HOA_DON | MaSP | SAN_PHAM | MaSP | Không |
| 22 | CHI_TIET_HOA_DON | MaKM | KHUYEN_MAI | MaKM | Có |
| 23 | CHI_TIET_XUAT_LO | MaCTHD | CHI_TIET_HOA_DON | MaCTHD | Không |
| 24 | CHI_TIET_XUAT_LO | MaLo | LO_HANG | MaLo | Không |
| 25 | THANH_TOAN | MaHD | HOA_DON | MaHD | Không |
| 26 | PHIEU_TRA | MaHD | HOA_DON | MaHD | Không |
| 27 | PHIEU_TRA | MaNV | NHAN_VIEN | MaNV | Không |
| 28 | CHI_TIET_PHIEU_TRA | MaPT | PHIEU_TRA | MaPT | Không |
| 29 | CHI_TIET_PHIEU_TRA | (MaCTHD, MaLo) | CHI_TIET_XUAT_LO | (MaCTHD, MaLo) | Không |
| 30 | NHAT_KY_HE_THONG | MaTK | TAI_KHOAN | MaTK | Có |

## Quy tắc toàn vẹn nổi bật

- Mọi bảng nghiệp vụ có đúng một PK; mọi FK và CHECK thuộc `dbo` phải enabled và trusted.
- Số lượng, tiền và điểm không âm; các số lượng giao dịch/chi tiết cần phát sinh phải lớn hơn 0, riêng `SoLuongBienDong` phải khác 0 để biểu diễn cả nhập và xuất.
- `NgayKetThuc > NgayBatDau`; hạn sử dụng, nếu có đủ hai ngày, phải sau ngày sản xuất.
- Trạng thái và loại nghiệp vụ dùng miền giá trị đóng qua CHECK.
- Giá trị giảm của dòng hóa đơn không vượt quá `SoLuong × DonGiaBan`.
- Một dòng trả hàng phải tham chiếu đúng một cặp dòng hóa đơn–lô đã xuất.

## Ranh giới giữa ràng buộc khai báo và stored procedure

PK, FK, UNIQUE, DEFAULT và CHECK ở trên được SQL Server cưỡng chế với mọi lệnh ghi. Một số quy tắc liên bảng phức tạp chỉ được cưỡng chế khi ghi qua stored procedure chính thức:

| Quy tắc | Nơi thực thi hiện tại |
|---|---|
| Khuyến mãi phải được gán cho sản phẩm bán | `usp_HOA_DON_HoanTatBanHang` kiểm tra `KHUYEN_MAI_SAN_PHAM`. |
| Lô xuất phải thuộc đúng sản phẩm trên dòng hóa đơn và phải theo FEFO | `usp_HOA_DON_HoanTatBanHang` chỉ chọn `LO_HANG` có `MaSP` đang bán. |
| Tổng hóa đơn, giảm giá, thanh toán và điểm được tính đồng bộ | `usp_HOA_DON_HoanTatBanHang`. |
| Tổng phiếu nhập và giao dịch nhập kho theo đúng lô | `usp_PHIEU_NHAP_XacNhan` tính tổng từ chi tiết và ghi `MaLo`; sản phẩm được suy ra từ `LO_HANG`. |
| Hàng trả thuộc lô đã xuất, không vượt lượng đã bán/đã trả và không hoàn quá tiền hóa đơn | `usp_PHIEU_TRA_HoanTat`. |
| Giao dịch điều chỉnh kho gắn đúng lô kiểm kê | `usp_KIEM_KE_PheDuyetDieuChinh` ghi `MaLo`; sản phẩm được suy ra từ `LO_HANG`. |

Do đó đường ghi qua stored procedure giữ đúng các bất biến này. Direct DML vẫn có thể bỏ qua cặp sản phẩm–lô trong `CHI_TIET_XUAT_LO` và cặp khuyến mãi–sản phẩm trong `CHI_TIET_HOA_DON`; riêng redundancy `GIAO_DICH_KHO.MaSP` đã được loại bỏ trong Phase 2.5.
