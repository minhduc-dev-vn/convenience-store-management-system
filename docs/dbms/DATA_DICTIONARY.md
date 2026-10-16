# Data Dictionary

## Quy ước

- Kiểu dữ liệu, độ dài, nullability và constraint mô tả trạng thái cuối sau khi Node migration runner áp dụng 000–006. Clean bootstrap riêng lẻ là baseline pre-003/pre-004/pre-005/pre-006 và chưa phải schema hoàn chỉnh; migration 004/005/006 không đổi cột hay constraint bảng.
- `UTC now` là `SYSUTCDATETIME()`; riêng ngày vào làm được chuyển sang múi giờ `SE Asia Standard Time` rồi lấy phần ngày.
- `UX filtered` là unique index chỉ áp dụng cho giá trị khác `NULL`.
- Phần CHECK tập trung vào constraint nghiệp vụ; danh sách kiểm kê đầy đủ vẫn nằm trong DDL.

## A. Identity / Account

### 1. VAI_TRO

Danh mục vai trò ứng dụng; baseline gồm `CUSTOMER`, `CASHIER`, `MANAGER`, `WAREHOUSE`.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaVaiTro | `VARCHAR(20)` | Không | PK | Mã vai trò ổn định dùng để phân quyền. |
| TenVaiTro | `NVARCHAR(50)` | Không | UQ | Tên hiển thị duy nhất của vai trò. |
| MoTa | `NVARCHAR(255)` | Có | — | Mô tả phạm vi vai trò. |

### 2. NHAN_VIEN

Hồ sơ nhân viên cửa hàng.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaNV | `VARCHAR(10)` | Không | PK | Mã nhân viên. |
| HoTen | `NVARCHAR(100)` | Không | — | Họ tên nhân viên. |
| NgaySinh | `DATE` | Có | — | Ngày sinh. |
| GioiTinh | `VARCHAR(10)` | Có | CHECK `MALE/FEMALE/OTHER` | Giới tính chuẩn hóa. |
| SDT | `VARCHAR(15)` | Không | UQ | Số điện thoại duy nhất. |
| Email | `VARCHAR(100)` | Có | — | Địa chỉ email. |
| DiaChi | `NVARCHAR(255)` | Có | — | Địa chỉ liên hệ. |
| NgayVaoLam | `DATE` | Không | DEFAULT ngày hiện tại theo giờ Đông Dương | Ngày bắt đầu làm việc. |
| LuongCoBan | `DECIMAL(18,2)` | Không | DEFAULT `0`; CHECK `>= 0` | Lương cơ bản. |
| TrangThai | `VARCHAR(20)` | Không | DEFAULT `ACTIVE`; CHECK `ACTIVE/INACTIVE` | Trạng thái làm việc. |

### 3. KHACH_HANG

Hồ sơ khách hàng và thông tin thành viên.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaKH | `VARCHAR(10)` | Không | PK | Mã khách hàng. |
| HoTen | `NVARCHAR(100)` | Không | — | Họ tên khách hàng. |
| SDT | `VARCHAR(15)` | Không | UQ | Số điện thoại duy nhất. |
| Email | `VARCHAR(100)` | Có | — | Địa chỉ email. |
| DiaChi | `NVARCHAR(255)` | Có | — | Địa chỉ liên hệ. |
| NgaySinh | `DATE` | Có | — | Ngày sinh. |
| DiemTichLuy | `INT` | Không | DEFAULT `0`; CHECK `>= 0` | Số điểm hiện có. |
| HangThanhVien | `VARCHAR(20)` | Không | DEFAULT `BRONZE`; CHECK `BRONZE/SILVER/GOLD/DIAMOND` | Hạng thành viên. |
| NgayDangKy | `DATETIME2(0)` | Không | DEFAULT UTC now | Thời điểm đăng ký. |
| TrangThai | `VARCHAR(20)` | Không | DEFAULT `ACTIVE`; CHECK `ACTIVE/INACTIVE` | Trạng thái hồ sơ. |

### 4. TAI_KHOAN

Tài khoản xác thực của một nhân viên hoặc một khách hàng.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaTK | `INT` | Không | PK; IDENTITY(1,1) | Định danh tài khoản. |
| TenDangNhap | `VARCHAR(50)` | Không | UX | Tên đăng nhập duy nhất. |
| MatKhauHash | `VARCHAR(255)` | Không | — | Chuỗi hash mật khẩu; không phải mật khẩu rõ. |
| MaVaiTro | `VARCHAR(20)` | Không | FK → `VAI_TRO.MaVaiTro` | Vai trò của tài khoản. |
| MaNV | `VARCHAR(10)` | Có | FK → `NHAN_VIEN.MaNV`; UX filtered | Chủ sở hữu nhân viên, nếu có. |
| MaKH | `VARCHAR(10)` | Có | FK → `KHACH_HANG.MaKH`; UX filtered | Chủ sở hữu khách hàng, nếu có. |
| LanDangNhapCuoi | `DATETIME2(0)` | Có | — | Lần đăng nhập thành công gần nhất. |
| TrangThai | `VARCHAR(20)` | Không | DEFAULT `ACTIVE`; CHECK `ACTIVE/LOCKED/INACTIVE` | Trạng thái xác thực. |
| NgayTao | `DATETIME2(0)` | Không | DEFAULT UTC now | Thời điểm tạo tài khoản. |

CHECK quan trọng: `OwnerExclusive` yêu cầu đúng một trong `MaNV`, `MaKH`; `OwnerRole` yêu cầu `CUSTOMER` gắn khách hàng, các vai trò nhân sự gắn nhân viên.

## B. Catalog / Promotion / Supplier

### 5. LOAI_SAN_PHAM

Danh mục phân loại sản phẩm.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaLoai | `VARCHAR(10)` | Không | PK | Mã loại sản phẩm. |
| TenLoai | `NVARCHAR(100)` | Không | UQ | Tên loại duy nhất. |
| MoTa | `NVARCHAR(255)` | Có | — | Mô tả loại. |
| TrangThai | `VARCHAR(20)` | Không | DEFAULT `ACTIVE`; CHECK `ACTIVE/INACTIVE` | Trạng thái sử dụng. |

### 6. SAN_PHAM

Danh mục hàng hóa bán tại cửa hàng.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaSP | `VARCHAR(10)` | Không | PK | Mã sản phẩm. |
| TenSP | `NVARCHAR(150)` | Không | — | Tên sản phẩm. |
| MaVach | `VARCHAR(30)` | Có | UX filtered | Mã vạch duy nhất nếu được khai báo. |
| DonViTinh | `NVARCHAR(20)` | Không | — | Đơn vị bán/kiểm kê. |
| GiaBan | `DECIMAL(18,2)` | Không | CHECK `> 0` | Giá bán hiện hành. |
| ImageUrl | `VARCHAR(500)` | Có | — | URL ảnh sản phẩm. |
| MucTonToiThieu | `INT` | Không | DEFAULT `0`; CHECK `>= 0` | Ngưỡng cảnh báo tồn kho. |
| MaLoai | `VARCHAR(10)` | Không | FK → `LOAI_SAN_PHAM.MaLoai` | Loại sản phẩm. |
| TrangThai | `VARCHAR(20)` | Không | DEFAULT `ACTIVE`; CHECK `ACTIVE/INACTIVE` | Trạng thái kinh doanh. |

### 7. KHUYEN_MAI

Chương trình giảm giá theo phần trăm hoặc số tiền.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaKM | `VARCHAR(12)` | Không | PK | Mã khuyến mãi. |
| TenKM | `NVARCHAR(150)` | Không | — | Tên chương trình. |
| LoaiKM | `VARCHAR(20)` | Không | CHECK `PERCENT/AMOUNT` | Cách tính giảm giá. |
| GiaTri | `DECIMAL(18,2)` | Không | CHECK `> 0`, phần trăm `<= 100` | Giá trị giảm. |
| GiaTriDonToiThieu | `DECIMAL(18,2)` | Không | DEFAULT `0`; CHECK `>= 0` | Giá trị đơn tối thiểu. |
| MucGiamToiDa | `DECIMAL(18,2)` | Có | CHECK `NULL` hoặc `> 0` | Trần giảm giá. |
| NgayBatDau | `DATETIME2(0)` | Không | — | Thời điểm bắt đầu. |
| NgayKetThuc | `DATETIME2(0)` | Không | CHECK `> NgayBatDau` | Thời điểm kết thúc. |
| TrangThai | `VARCHAR(20)` | Không | DEFAULT `ACTIVE`; CHECK `ACTIVE/INACTIVE` | Trạng thái chương trình. |

### 8. KHUYEN_MAI_SAN_PHAM

Bảng kết hợp N–N giữa khuyến mãi và sản phẩm.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaKM | `VARCHAR(12)` | Không | PK(1); FK → `KHUYEN_MAI.MaKM` | Khuyến mãi được gán. |
| MaSP | `VARCHAR(10)` | Không | PK(2); FK → `SAN_PHAM.MaSP` | Sản phẩm được áp dụng. |

### 9. NHA_CUNG_CAP

Thông tin đối tác cung ứng hàng hóa.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaNCC | `VARCHAR(10)` | Không | PK | Mã nhà cung cấp. |
| TenNCC | `NVARCHAR(150)` | Không | — | Tên nhà cung cấp. |
| SDT | `VARCHAR(15)` | Không | UQ | Số điện thoại duy nhất. |
| Email | `VARCHAR(100)` | Có | — | Email liên hệ. |
| DiaChi | `NVARCHAR(255)` | Có | — | Địa chỉ. |
| MaSoThue | `VARCHAR(20)` | Có | UX filtered | Mã số thuế duy nhất nếu có. |
| TrangThai | `VARCHAR(20)` | Không | DEFAULT `ACTIVE`; CHECK `ACTIVE/INACTIVE` | Trạng thái hợp tác. |

## C. Inventory / Receiving / Stocktake

### 10. CA_LAM_VIEC

Phiên làm việc và đối soát tiền của nhân viên.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaCa | `BIGINT` | Không | PK; IDENTITY(1,1) | Định danh ca làm việc. |
| MaNV | `VARCHAR(10)` | Không | FK → `NHAN_VIEN.MaNV` | Nhân viên phụ trách. |
| GioBatDau | `DATETIME2(0)` | Không | DEFAULT UTC now | Thời điểm mở ca. |
| GioKetThuc | `DATETIME2(0)` | Có | CHECK `NULL` hoặc `>= GioBatDau` | Thời điểm đóng ca. |
| TienDauCa | `DECIMAL(18,2)` | Không | DEFAULT `0`; CHECK `>= 0` | Tiền mặt đầu ca. |
| TienCuoiCa | `DECIMAL(18,2)` | Có | CHECK `NULL` hoặc `>= 0` | Tiền mặt chốt ca. |
| TrangThai | `VARCHAR(20)` | Không | DEFAULT `OPEN`; CHECK `OPEN/CLOSED` | Trạng thái ca. |
| GhiChu | `NVARCHAR(255)` | Có | — | Ghi chú đối soát. |

### 11. PHIEU_NHAP

Chứng từ nhập hàng từ nhà cung cấp.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaPN | `VARCHAR(15)` | Không | PK | Mã phiếu nhập. |
| NgayNhap | `DATETIME2(0)` | Không | DEFAULT UTC now | Thời điểm lập/nhập hàng. |
| MaNV | `VARCHAR(10)` | Không | FK → `NHAN_VIEN.MaNV` | Nhân viên lập phiếu. |
| MaNCC | `VARCHAR(10)` | Không | FK → `NHA_CUNG_CAP.MaNCC` | Nhà cung cấp. |
| TongTien | `DECIMAL(18,2)` | Không | DEFAULT `0`; CHECK `>= 0` | Tổng tiền phiếu nhập. |
| TrangThai | `VARCHAR(20)` | Không | DEFAULT `DRAFT`; CHECK `DRAFT/CONFIRMED/CANCELLED` | Trạng thái xử lý. |
| NgayXacNhan | `DATETIME2(0)` | Có | — | Thời điểm xác nhận. |
| GhiChu | `NVARCHAR(255)` | Có | — | Ghi chú phiếu nhập. |

### 12. LO_HANG

Lô tồn kho của một sản phẩm.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaLo | `VARCHAR(20)` | Không | PK | Mã lô nội bộ. |
| MaSP | `VARCHAR(10)` | Không | FK → `SAN_PHAM.MaSP`; UQ cùng `SoLo` | Sản phẩm của lô. |
| SoLo | `VARCHAR(50)` | Không | UQ cùng `MaSP` | Số lô từ nguồn hàng. |
| NgaySanXuat | `DATE` | Có | — | Ngày sản xuất. |
| HanSuDung | `DATE` | Có | CHECK sau ngày sản xuất khi cả hai có giá trị | Hạn sử dụng. |
| GiaNhap | `DECIMAL(18,2)` | Không | CHECK `>= 0` | Giá nhập tham chiếu của lô. |
| SoLuongTon | `INT` | Không | DEFAULT `0`; CHECK `>= 0` | Số lượng còn lại. |
| TrangThai | `VARCHAR(20)` | Không | DEFAULT `ACTIVE`; CHECK `ACTIVE/BLOCKED/EXPIRED` | Khả năng sử dụng lô. |

### 13. CHI_TIET_PHIEU_NHAP

Dòng hàng/lô thuộc phiếu nhập.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaCTPN | `BIGINT` | Không | PK; IDENTITY(1,1) | Định danh dòng nhập. |
| MaPN | `VARCHAR(15)` | Không | FK → `PHIEU_NHAP.MaPN`; UQ cùng `MaLo` | Phiếu nhập cha. |
| MaLo | `VARCHAR(20)` | Không | FK → `LO_HANG.MaLo`; UQ cùng `MaPN` | Lô được nhập. |
| SoLuong | `INT` | Không | CHECK `> 0` | Số lượng nhập. |
| DonGiaNhap | `DECIMAL(18,2)` | Không | CHECK `>= 0` | Đơn giá tại lần nhập. |
| ThanhTien | `DECIMAL(18,2)` | Không | COMPUTED PERSISTED `SoLuong × DonGiaNhap` | Thành tiền do SQL Server tính. |

### 14. KIEM_KE

Phiếu kiểm kê tồn kho theo lô.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaKK | `VARCHAR(15)` | Không | PK | Mã phiếu kiểm kê. |
| NgayKiemKe | `DATETIME2(0)` | Không | DEFAULT UTC now | Thời điểm kiểm kê. |
| MaNV | `VARCHAR(10)` | Không | FK → `NHAN_VIEN.MaNV` | Nhân viên thực hiện. |
| TrangThai | `VARCHAR(20)` | Không | DEFAULT `DRAFT`; CHECK `DRAFT/APPROVED/CANCELLED` | Trạng thái phiếu. |
| GhiChu | `NVARCHAR(255)` | Có | — | Ghi chú chung. |

### 15. CHI_TIET_KIEM_KE

Kết quả kiểm kê của từng lô trong một phiếu.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaKK | `VARCHAR(15)` | Không | PK(1); FK → `KIEM_KE.MaKK` | Phiếu kiểm kê. |
| MaLo | `VARCHAR(20)` | Không | PK(2); FK → `LO_HANG.MaLo` | Lô được kiểm. |
| SoLuongHeThong | `INT` | Không | CHECK `>= 0` | Tồn kho hệ thống tại thời điểm kiểm. |
| SoLuongThucTe | `INT` | Không | CHECK `>= 0` | Số đếm thực tế. |
| ChenhLech | `INT` | Không | COMPUTED PERSISTED `SoLuongThucTe - SoLuongHeThong` | Chênh lệch do SQL Server tính. |
| LyDo | `NVARCHAR(255)` | Có | — | Giải thích chênh lệch. |

### 16. GIAO_DICH_KHO

Sổ biến động tồn kho theo lô; sản phẩm được suy ra bằng cách join `LO_HANG` qua `MaLo`.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaGiaoDich | `BIGINT` | Không | PK; IDENTITY(1,1) | Định danh giao dịch kho. |
| MaLo | `VARCHAR(20)` | Không | FK → `LO_HANG.MaLo` | Lô phát sinh biến động. |
| LoaiGiaoDich | `VARCHAR(30)` | Không | CHECK `IMPORT/SALE/SALE_CANCEL/RETURN/ADJUSTMENT` | Loại biến động kho. |
| SoLuongBienDong | `INT` | Không | CHECK `<> 0` | Lượng tăng/giảm có dấu. |
| ThoiGian | `DATETIME2(0)` | Không | DEFAULT UTC now | Thời điểm phát sinh. |
| MaThamChieu | `VARCHAR(20)` | Có | — | Mã chứng từ nghiệp vụ liên quan. |
| MaNV | `VARCHAR(10)` | Có | FK → `NHAN_VIEN.MaNV` | Nhân viên thực hiện, nếu có. |
| GhiChu | `NVARCHAR(255)` | Có | — | Diễn giải giao dịch. |

Không lưu `MaSP` trong bảng này. Khi cần lọc hoặc hiển thị sản phẩm, truy vấn join `GIAO_DICH_KHO.MaLo = LO_HANG.MaLo` rồi lấy `LO_HANG.MaSP`.

## D. Sales / Shift / Payment

### 17. HOA_DON

Phần đầu hóa đơn bán hàng trong một ca.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaHD | `VARCHAR(15)` | Không | PK | Mã hóa đơn. |
| NgayLap | `DATETIME2(0)` | Không | DEFAULT UTC now | Thời điểm lập hóa đơn. |
| MaCa | `BIGINT` | Không | FK → `CA_LAM_VIEC.MaCa` | Ca bán hàng. |
| MaKH | `VARCHAR(10)` | Có | FK → `KHACH_HANG.MaKH` | Khách thành viên; null cho khách lẻ. |
| TongTienHang | `DECIMAL(18,2)` | Không | DEFAULT `0`; CHECK `>= 0` | Tổng tiền trước giảm. |
| TongGiamGia | `DECIMAL(18,2)` | Không | DEFAULT `0`; CHECK `>= 0` | Tổng giảm giá. |
| TongThanhToan | `DECIMAL(18,2)` | Không | DEFAULT `0`; CHECK `>= 0` | Số tiền cần thanh toán. |
| DiemSuDung | `INT` | Không | DEFAULT `0`; CHECK `>= 0` | Điểm đã dùng. |
| DiemTichLuy | `INT` | Không | DEFAULT `0`; CHECK `>= 0` | Điểm phát sinh từ hóa đơn. |
| TrangThai | `VARCHAR(20)` | Không | DEFAULT `DRAFT`; CHECK `DRAFT/PAID/CANCELLED/REFUNDED` | Trạng thái hóa đơn. |
| GhiChu | `NVARCHAR(255)` | Có | — | Ghi chú bán hàng. |

### 18. CHI_TIET_HOA_DON

Dòng sản phẩm trong hóa đơn, lưu giá và giảm giá tại thời điểm bán.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaCTHD | `BIGINT` | Không | PK; IDENTITY(1,1) | Định danh dòng hóa đơn. |
| MaHD | `VARCHAR(15)` | Không | FK → `HOA_DON.MaHD`; UQ cùng `MaSP` | Hóa đơn cha. |
| MaSP | `VARCHAR(10)` | Không | FK → `SAN_PHAM.MaSP`; UQ cùng `MaHD` | Sản phẩm bán. |
| MaKM | `VARCHAR(12)` | Có | FK → `KHUYEN_MAI.MaKM` | Khuyến mãi áp dụng, nếu có. |
| SoLuong | `INT` | Không | CHECK `> 0` | Số lượng bán. |
| DonGiaBan | `DECIMAL(18,2)` | Không | CHECK `> 0` | Đơn giá chốt tại thời điểm bán. |
| TienGiam | `DECIMAL(18,2)` | Không | DEFAULT `0`; CHECK từ `0` đến `SoLuong × DonGiaBan` | Tiền giảm của dòng. |
| ThanhTien | `DECIMAL(18,2)` | Không | COMPUTED PERSISTED `(SoLuong × DonGiaBan) - TienGiam` | Thành tiền do SQL Server tính. |

### 19. CHI_TIET_XUAT_LO

Phân bổ số lượng của một dòng hóa đơn xuống các lô xuất thực tế.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaCTHD | `BIGINT` | Không | PK(1); FK → `CHI_TIET_HOA_DON.MaCTHD` | Dòng hóa đơn. |
| MaLo | `VARCHAR(20)` | Không | PK(2); FK → `LO_HANG.MaLo` | Lô xuất bán. |
| SoLuong | `INT` | Không | CHECK `> 0` | Số lượng lấy từ lô. |

### 20. THANH_TOAN

Các lần thanh toán của hóa đơn.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaThanhToan | `BIGINT` | Không | PK; IDENTITY(1,1) | Định danh lần thanh toán. |
| MaHD | `VARCHAR(15)` | Không | FK → `HOA_DON.MaHD` | Hóa đơn được thanh toán. |
| ThoiGian | `DATETIME2(0)` | Không | DEFAULT UTC now | Thời điểm thanh toán. |
| PhuongThuc | `VARCHAR(20)` | Không | CHECK `CASH/CARD/TRANSFER/EWALLET` | Phương thức thanh toán. |
| SoTien | `DECIMAL(18,2)` | Không | CHECK `> 0` | Số tiền của giao dịch. |
| TrangThai | `VARCHAR(20)` | Không | DEFAULT `SUCCESS`; CHECK `SUCCESS/FAILED/REFUNDED` | Kết quả thanh toán. |
| MaGiaoDichNgoai | `VARCHAR(100)` | Có | — | Mã giao dịch từ hệ thống thanh toán ngoài. |

## E. Returns

### 21. PHIEU_TRA

Phần đầu giao dịch trả hàng của một hóa đơn.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaPT | `VARCHAR(15)` | Không | PK | Mã phiếu trả. |
| MaHD | `VARCHAR(15)` | Không | FK → `HOA_DON.MaHD` | Hóa đơn gốc. |
| MaNV | `VARCHAR(10)` | Không | FK → `NHAN_VIEN.MaNV` | Nhân viên xử lý. |
| NgayTra | `DATETIME2(0)` | Không | DEFAULT UTC now | Thời điểm trả hàng. |
| LyDo | `NVARCHAR(255)` | Không | — | Lý do trả. |
| TongTienHoan | `DECIMAL(18,2)` | Không | DEFAULT `0`; CHECK `>= 0` | Tổng tiền hoàn. |
| TrangThai | `VARCHAR(20)` | Không | DEFAULT `CREATED`; CHECK `CREATED/COMPLETED/CANCELLED` | Trạng thái phiếu trả. |

### 22. CHI_TIET_PHIEU_TRA

Dòng trả hàng gắn với đúng dòng hóa đơn và lô đã xuất.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaPT | `VARCHAR(15)` | Không | PK(1); FK → `PHIEU_TRA.MaPT` | Phiếu trả cha. |
| MaCTHD | `BIGINT` | Không | PK(2); FK ghép → `CHI_TIET_XUAT_LO` | Dòng hóa đơn gốc. |
| MaLo | `VARCHAR(20)` | Không | PK(3); FK ghép → `CHI_TIET_XUAT_LO` | Lô hàng đã xuất. |
| SoLuongTra | `INT` | Không | CHECK `> 0` | Số lượng trả. |
| TienHoan | `DECIMAL(18,2)` | Không | CHECK `>= 0` | Tiền hoàn cho dòng. |
| TinhTrangHang | `VARCHAR(20)` | Không | DEFAULT `RESALABLE`; CHECK `RESALABLE/DAMAGED` | Khả năng nhập lại kho. |

## F. Audit

### 23. NHAT_KY_HE_THONG

Nhật ký thay đổi và hành động quan trọng của hệ thống.

| Cột | Kiểu | Null | Khóa / ràng buộc | Ý nghĩa |
|---|---|---|---|---|
| MaNhatKy | `BIGINT` | Không | PK; IDENTITY(1,1) | Định danh bản ghi audit. |
| MaTK | `INT` | Có | FK → `TAI_KHOAN.MaTK` | Tài khoản thực hiện; null cho tác vụ hệ thống. |
| HanhDong | `VARCHAR(50)` | Không | — | Tên hành động. |
| TenBang | `VARCHAR(128)` | Không | — | Đối tượng/bảng bị tác động. |
| MaBanGhi | `VARCHAR(100)` | Có | — | Khóa logic của bản ghi liên quan. |
| DuLieuCu | `NVARCHAR(MAX)` | Có | CHECK không chứa dữ liệu nhạy cảm | Ảnh dữ liệu trước thay đổi. |
| DuLieuMoi | `NVARCHAR(MAX)` | Có | CHECK không chứa dữ liệu nhạy cảm | Ảnh dữ liệu sau thay đổi. |
| ThoiGian | `DATETIME2(0)` | Không | DEFAULT UTC now | Thời điểm ghi nhật ký. |
| DiaChiIP | `VARCHAR(45)` | Có | — | Địa chỉ IPv4/IPv6 của nguồn yêu cầu. |

CHECK `NoSensitiveData` tìm không phân biệt hoa thường trên `DuLieuCu + DuLieuMoi` và từ chối các từ khóa `matkhau`, `mật khẩu`, `password`, `token`, `secret`, `authorization`, `jwt`.

## Tổng hợp khóa và ràng buộc

| Nhóm | Kết quả |
|---|---:|
| Bảng được mô tả | 23 |
| Bảng có PK | 23 |
| FK | 30 |
| UQ khai báo bằng constraint | 8 |
| Unique index nghiệp vụ nổi bật | `TAI_KHOAN.TenDangNhap`, `TAI_KHOAN.MaNV`, `TAI_KHOAN.MaKH`, `SAN_PHAM.MaVach`, `NHA_CUNG_CAP.MaSoThue` |
| Cột tính toán persisted | 3 |
| Tổng số cột của 23 bảng | 163 |
