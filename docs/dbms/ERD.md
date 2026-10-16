# Entity–Relationship Diagram

Sơ đồ mô tả trạng thái cuối sau khi migration 000–006 được áp dụng; baseline chỉ-init cố ý giữ quan hệ pre-003/pre-004/pre-005/pre-006 để replay migration và không phải schema dùng để vận hành/chấm. Migration 004/005 không thay đổi entity hay relationship; migration 006 chỉ thay đổi database role và quyền.

## Cách đọc cardinality

| Ký hiệu | Ý nghĩa |
|---|---|
| `||` | đúng một |
| `o|` | không hoặc một |
| `o{` | không hoặc nhiều |

Cardinality thể hiện khả năng mà DDL cưỡng chế. Ví dụ, một hóa đơn có thể không gắn khách hàng vì `HOA_DON.MaKH` nullable; một tài khoản có tối đa một chủ sở hữu nhân viên hoặc khách hàng vì có filtered unique index và CHECK độc quyền chủ sở hữu.

## ERD đầy đủ — 23 bảng, 30 FK

```mermaid
erDiagram
    VAI_TRO {
        varchar MaVaiTro PK
        nvarchar TenVaiTro UK
        nvarchar MoTa
    }
    NHAN_VIEN {
        varchar MaNV PK
        nvarchar HoTen
        date NgaySinh
        varchar GioiTinh
        varchar SDT UK
        varchar Email
        nvarchar DiaChi
        date NgayVaoLam
        decimal LuongCoBan
        varchar TrangThai
    }
    KHACH_HANG {
        varchar MaKH PK
        nvarchar HoTen
        varchar SDT UK
        varchar Email
        nvarchar DiaChi
        date NgaySinh
        int DiemTichLuy
        varchar HangThanhVien
        datetime2 NgayDangKy
        varchar TrangThai
    }
    TAI_KHOAN {
        int MaTK PK
        varchar TenDangNhap UK
        varchar MatKhauHash
        varchar MaVaiTro FK
        varchar MaNV FK
        varchar MaKH FK
        datetime2 LanDangNhapCuoi
        varchar TrangThai
        datetime2 NgayTao
    }
    LOAI_SAN_PHAM {
        varchar MaLoai PK
        nvarchar TenLoai UK
        nvarchar MoTa
        varchar TrangThai
    }
    SAN_PHAM {
        varchar MaSP PK
        nvarchar TenSP
        varchar MaVach UK
        nvarchar DonViTinh
        decimal GiaBan
        varchar ImageUrl
        int MucTonToiThieu
        varchar MaLoai FK
        varchar TrangThai
    }
    KHUYEN_MAI {
        varchar MaKM PK
        nvarchar TenKM
        varchar LoaiKM
        decimal GiaTri
        decimal GiaTriDonToiThieu
        decimal MucGiamToiDa
        datetime2 NgayBatDau
        datetime2 NgayKetThuc
        varchar TrangThai
    }
    KHUYEN_MAI_SAN_PHAM {
        varchar MaKM PK, FK
        varchar MaSP PK, FK
    }
    NHA_CUNG_CAP {
        varchar MaNCC PK
        nvarchar TenNCC
        varchar SDT UK
        varchar Email
        nvarchar DiaChi
        varchar MaSoThue UK
        varchar TrangThai
    }
    CA_LAM_VIEC {
        bigint MaCa PK
        varchar MaNV FK
        datetime2 GioBatDau
        datetime2 GioKetThuc
        decimal TienDauCa
        decimal TienCuoiCa
        varchar TrangThai
        nvarchar GhiChu
    }
    PHIEU_NHAP {
        varchar MaPN PK
        datetime2 NgayNhap
        varchar MaNV FK
        varchar MaNCC FK
        decimal TongTien
        varchar TrangThai
        datetime2 NgayXacNhan
        nvarchar GhiChu
    }
    LO_HANG {
        varchar MaLo PK
        varchar MaSP FK
        varchar SoLo UK
        date NgaySanXuat
        date HanSuDung
        decimal GiaNhap
        int SoLuongTon
        varchar TrangThai
    }
    CHI_TIET_PHIEU_NHAP {
        bigint MaCTPN PK
        varchar MaPN FK
        varchar MaLo FK
        int SoLuong
        decimal DonGiaNhap
        decimal ThanhTien
    }
    KIEM_KE {
        varchar MaKK PK
        datetime2 NgayKiemKe
        varchar MaNV FK
        varchar TrangThai
        nvarchar GhiChu
    }
    CHI_TIET_KIEM_KE {
        varchar MaKK PK, FK
        varchar MaLo PK, FK
        int SoLuongHeThong
        int SoLuongThucTe
        int ChenhLech
        nvarchar LyDo
    }
    GIAO_DICH_KHO {
        bigint MaGiaoDich PK
        varchar MaLo FK
        varchar LoaiGiaoDich
        int SoLuongBienDong
        datetime2 ThoiGian
        varchar MaThamChieu
        varchar MaNV FK
        nvarchar GhiChu
    }
    HOA_DON {
        varchar MaHD PK
        datetime2 NgayLap
        bigint MaCa FK
        varchar MaKH FK
        decimal TongTienHang
        decimal TongGiamGia
        decimal TongThanhToan
        int DiemSuDung
        int DiemTichLuy
        varchar TrangThai
        nvarchar GhiChu
    }
    CHI_TIET_HOA_DON {
        bigint MaCTHD PK
        varchar MaHD FK
        varchar MaSP FK
        varchar MaKM FK
        int SoLuong
        decimal DonGiaBan
        decimal TienGiam
        decimal ThanhTien
    }
    CHI_TIET_XUAT_LO {
        bigint MaCTHD PK, FK
        varchar MaLo PK, FK
        int SoLuong
    }
    THANH_TOAN {
        bigint MaThanhToan PK
        varchar MaHD FK
        datetime2 ThoiGian
        varchar PhuongThuc
        decimal SoTien
        varchar TrangThai
        varchar MaGiaoDichNgoai
    }
    PHIEU_TRA {
        varchar MaPT PK
        varchar MaHD FK
        varchar MaNV FK
        datetime2 NgayTra
        nvarchar LyDo
        decimal TongTienHoan
        varchar TrangThai
    }
    CHI_TIET_PHIEU_TRA {
        varchar MaPT PK, FK
        bigint MaCTHD PK, FK
        varchar MaLo PK, FK
        int SoLuongTra
        decimal TienHoan
        varchar TinhTrangHang
    }
    NHAT_KY_HE_THONG {
        bigint MaNhatKy PK
        int MaTK FK
        varchar HanhDong
        varchar TenBang
        varchar MaBanGhi
        nvarchar DuLieuCu
        nvarchar DuLieuMoi
        datetime2 ThoiGian
        varchar DiaChiIP
    }

    VAI_TRO ||--o{ TAI_KHOAN : "phân quyền"
    NHAN_VIEN o|--o| TAI_KHOAN : "sở hữu tài khoản"
    KHACH_HANG o|--o| TAI_KHOAN : "sở hữu tài khoản"

    LOAI_SAN_PHAM ||--o{ SAN_PHAM : "phân loại"
    KHUYEN_MAI ||--o{ KHUYEN_MAI_SAN_PHAM : "áp dụng"
    SAN_PHAM ||--o{ KHUYEN_MAI_SAN_PHAM : "được khuyến mãi"

    NHAN_VIEN ||--o{ CA_LAM_VIEC : "làm ca"
    NHAN_VIEN ||--o{ PHIEU_NHAP : "lập phiếu nhập"
    NHA_CUNG_CAP ||--o{ PHIEU_NHAP : "cung cấp"
    SAN_PHAM ||--o{ LO_HANG : "có lô"
    PHIEU_NHAP ||--o{ CHI_TIET_PHIEU_NHAP : "gồm"
    LO_HANG ||--o{ CHI_TIET_PHIEU_NHAP : "được nhập"

    NHAN_VIEN ||--o{ KIEM_KE : "thực hiện"
    KIEM_KE ||--o{ CHI_TIET_KIEM_KE : "gồm"
    LO_HANG ||--o{ CHI_TIET_KIEM_KE : "được kiểm"
    LO_HANG ||--o{ GIAO_DICH_KHO : "phát sinh biến động"
    NHAN_VIEN o|--o{ GIAO_DICH_KHO : "thực hiện"

    CA_LAM_VIEC ||--o{ HOA_DON : "phát sinh"
    KHACH_HANG o|--o{ HOA_DON : "mua hàng"
    HOA_DON ||--o{ CHI_TIET_HOA_DON : "gồm"
    SAN_PHAM ||--o{ CHI_TIET_HOA_DON : "được bán"
    KHUYEN_MAI o|--o{ CHI_TIET_HOA_DON : "được áp dụng"
    CHI_TIET_HOA_DON ||--o{ CHI_TIET_XUAT_LO : "xuất theo lô"
    LO_HANG ||--o{ CHI_TIET_XUAT_LO : "được xuất"
    HOA_DON ||--o{ THANH_TOAN : "được thanh toán"

    HOA_DON ||--o{ PHIEU_TRA : "có phiếu trả"
    NHAN_VIEN ||--o{ PHIEU_TRA : "xử lý"
    PHIEU_TRA ||--o{ CHI_TIET_PHIEU_TRA : "gồm"
    CHI_TIET_XUAT_LO ||--o{ CHI_TIET_PHIEU_TRA : "hoàn từ lô đã xuất"

    TAI_KHOAN o|--o{ NHAT_KY_HE_THONG : "tạo nhật ký"
```

## Quan hệ N–N đã được phân rã

| Quan hệ khái niệm | Bảng kết hợp/chi tiết | Khóa |
|---|---|---|
| `KHUYEN_MAI` ↔ `SAN_PHAM` | `KHUYEN_MAI_SAN_PHAM` | `(MaKM, MaSP)` |
| `PHIEU_NHAP` ↔ `LO_HANG` | `CHI_TIET_PHIEU_NHAP` | PK thay thế `MaCTPN`, UQ `(MaPN, MaLo)` |
| `KIEM_KE` ↔ `LO_HANG` | `CHI_TIET_KIEM_KE` | `(MaKK, MaLo)` |
| `CHI_TIET_HOA_DON` ↔ `LO_HANG` | `CHI_TIET_XUAT_LO` | `(MaCTHD, MaLo)` |
| `PHIEU_TRA` ↔ lô đã xuất | `CHI_TIET_PHIEU_TRA` | `(MaPT, MaCTHD, MaLo)` |

## Ghi chú cardinality quan trọng

- `TAI_KHOAN` phải thuộc đúng một trong hai loại chủ sở hữu: nhân viên hoặc khách hàng. `CK_TAI_KHOAN_OwnerExclusive` và `CK_TAI_KHOAN_OwnerRole` cưỡng chế quy tắc này.
- Mỗi nhân viên/khách hàng có tối đa một tài khoản nhờ `UX_TAI_KHOAN_MaNV` và `UX_TAI_KHOAN_MaKH`.
- `HOA_DON.MaKH`, `CHI_TIET_HOA_DON.MaKM`, `GIAO_DICH_KHO.MaNV` và `NHAT_KY_HE_THONG.MaTK` nullable, nên đầu FK tương ứng là tùy chọn.
- FK của `CHI_TIET_PHIEU_TRA` là FK ghép `(MaCTHD, MaLo)` đến `CHI_TIET_XUAT_LO`, bảo đảm chỉ hoàn một lô đã được xuất trên dòng hóa đơn đó.
