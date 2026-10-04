# Frontend vận hành và kịch bản demo

Frontend sử dụng ReactJS, JavaScript, Vite và React Router. Ứng dụng đọc dữ liệu từ REST API thật; giá bán, giảm giá, tồn kho và tổng thanh toán luôn được backend xác nhận lại.

## Cài đặt và cấu hình

Yêu cầu Node.js 20 trở lên.

```bash
cd frontend
npm install
copy .env.example .env
```

Thiết lập URL backend trong `.env`:

```dotenv
VITE_API_BASE_URL=http://localhost:3000/api
```

Không lưu token, mật khẩu hoặc credential database trong file env được commit.

## Chạy và kiểm tra

```bash
npm run dev
npm test
npm run build
npm run preview
```

Sau khi `npm run preview` đang chạy, kiểm tra tất cả deep-route của bản production:

```bash
npm run test:routes
```

Các màn hình được tách theo route để trình duyệt chỉ tải bundle cần thiết. Bảng dữ liệu có vùng cuộn ngang và giao diện có breakpoint cho laptop, tablet và điện thoại.

## Checklist MH-01 đến MH-28

Mỗi mục dưới đây dùng route thật, được bảo vệ theo role tại frontend và vẫn phải qua authorization của backend. Các màn hình đọc dữ liệu đều dùng trạng thái loading/error/empty dùng chung; màn hình form giữ input khi API lỗi và khóa nút trong lúc gửi.

| Màn hình | Route chính | Quyền | API/thao tác chính |
|---|---|---|---|
| MH-01 Đăng nhập | `/auth/login` | PUBLIC | Đăng nhập, hiển thị lỗi xác thực |
| MH-02 Đăng ký | `/auth/register` | PUBLIC | Tạo tài khoản CUSTOMER |
| MH-03 Đổi mật khẩu | `/account/change-password` | Đã đăng nhập | Đổi mật khẩu hiện tại |
| MH-04 Dashboard theo role | `/cashier`, `/warehouse`, `/manager` | CASHIER, WAREHOUSE, MANAGER | Ca hiện tại, cảnh báo kho, KPI quản lý |
| MH-05 Mở/đóng ca | `/cashier` | CASHIER | Mở ca, đối chiếu và đóng ca |
| MH-06 POS | `/cashier/pos` | CASHIER | Barcode/tìm kiếm, giỏ hàng, quote server-side |
| MH-07 Thanh toán/hóa đơn | `/cashier/pos`, `/cashier/receipts/:invoiceId` | CASHIER | Checkout, chống gửi lặp, hóa đơn chỉ đọc/in |
| MH-08 Tra cứu hóa đơn | `/cashier/invoices`, `/manager/invoices` | CASHIER, MANAGER | Filter, phân trang, chi tiết hóa đơn |
| MH-09 Đổi/trả | `/cashier/returns/:invoiceId` | CASHIER | Trả một phần, RESALABLE/DAMAGED, refund server-side |
| MH-10 Nhà cung cấp | `/manager/suppliers` | MANAGER | Tìm, thêm, sửa, đổi trạng thái |
| MH-11 Lập phiếu nhập | `/warehouse/receiving/new` | WAREHOUSE | Tạo draft và dòng hàng |
| MH-12 Xác nhận nhập | `/warehouse/receiving` | WAREHOUSE | Danh sách, chi tiết, xác nhận atomic |
| MH-13 Tồn kho/lô/cảnh báo | `/warehouse/inventory`, `/manager/inventory` | WAREHOUSE, MANAGER | Tồn tổng, drill-down lô, cảnh báo |
| MH-14 Kiểm kê | `/warehouse/stocktakes` | WAREHOUSE | Snapshot, nhập thực tế, gửi đề nghị |
| MH-15 Duyệt điều chỉnh | `/manager/stocktakes` | MANAGER | Xem chênh lệch, duyệt/từ chối |
| MH-16 Sản phẩm | `/manager/products` | MANAGER | CRUD mềm sản phẩm và loại |
| MH-17 Giá bán | `/manager/products/pricing` | MANAGER | Đổi giá, xem lịch sử audit |
| MH-18 Khuyến mãi | `/manager/promotions` | MANAGER | Tạo, sửa, trạng thái, sản phẩm áp dụng |
| MH-19 Nhân viên | `/manager/employees` | MANAGER | Tìm, phân trang, hồ sơ, trạng thái |
| MH-20 Tài khoản/role | `/manager/accounts` | MANAGER | Tạo, khóa/mở, đổi role, cấp lại mật khẩu |
| MH-21 Khách hàng thành viên | `/manager/customers` | MANAGER | Hồ sơ, hóa đơn, khóa/mở tài khoản |
| MH-22 Nhật ký thao tác | `/manager/audit-logs` | MANAGER | Filter, phân trang, old/new detail an toàn |
| MH-23 Báo cáo doanh thu | `/manager/reports/revenue` | MANAGER | Khoảng ngày, KPI, xu hướng, xuất CSV/in PDF |
| MH-24 Báo cáo hàng hóa | `/manager/reports/merchandise` | MANAGER | Best/slow, tồn kho, nhập hàng |
| MH-25 Báo cáo nhân sự | `/manager/reports/workforce` | MANAGER | Doanh thu nhân viên và lịch sử ca |
| MH-26 Cổng sản phẩm | `/products`, `/promotions` | PUBLIC, CUSTOMER | Sản phẩm active và ưu đãi hiện hành |
| MH-27 Lịch sử/điểm | `/customer/history` | CUSTOMER | Hóa đơn thuộc chính khách hàng, điểm chỉ đọc |
| MH-28 Hồ sơ | `/customer/profile` | CUSTOMER | Xem và cập nhật hồ sơ cá nhân |

Tỷ lệ quy đổi điểm chưa được chốt nên giao diện không cung cấp thao tác tiêu điểm. Báo cáo không hiển thị lợi nhuận khi chưa có công thức nghiệp vụ được phê duyệt.

## Kịch bản smoke bốn role

Chuẩn bị database demo bằng runner trong `database/README.md`, khởi động backend, sau đó chạy frontend. Dùng tài khoản test riêng của môi trường; không đưa credential vào source hoặc tài liệu này.

### CUSTOMER

1. Mở `/products` khi chưa đăng nhập, tìm sản phẩm và xem ưu đãi đang hiệu lực.
2. Đăng nhập CUSTOMER, refresh trực tiếp `/customer/history` và xác nhận session được phục hồi.
3. Kiểm tra phân trang lịch sử, chi tiết hóa đơn chỉ thuộc chính tài khoản và điểm tích lũy chỉ đọc.
4. Cập nhật hồ sơ tại `/customer/profile`, thử lỗi validation và tải lại dữ liệu.

### CASHIER

1. Đăng nhập CASHIER, xác nhận dashboard lấy trạng thái ca từ API.
2. Mở ca, vào POS, quét/tìm sản phẩm, sửa số lượng và yêu cầu quote.
3. Thanh toán một lần; nút submit phải bị khóa trong lúc xử lý. Mở hóa đơn đã lưu và thử bản in.
4. Tra cứu hóa đơn, thực hiện một return hợp lệ và một return vượt số lượng để kiểm tra lỗi.
5. Đối chiếu tiền cuối ca, đóng ca và xác nhận POS không tiếp tục dùng ca đã đóng.

### WAREHOUSE

1. Đăng nhập WAREHOUSE, kiểm tra cảnh báo tồn thấp/cận hạn trên dashboard.
2. Tạo phiếu nhập draft, thêm/sửa dòng, xác nhận nhập và kiểm tra phiếu chuyển read-only.
3. Mở tồn kho, dùng filter low-stock/near-expiry/expired và drill-down lô.
4. Tạo kiểm kê, nhập số lượng thực tế/lý do và gửi đề nghị; không có thao tác duyệt.

### MANAGER

1. Đăng nhập MANAGER, xác nhận KPI dashboard và navigation chỉ có module quản lý.
2. Smoke sản phẩm/giá, khuyến mãi, nhà cung cấp, nhân viên, tài khoản và khách hàng thành viên.
3. Duyệt/từ chối đề nghị kiểm kê và xác nhận bản đã xử lý không còn sửa được.
4. Filter audit log; mở ba báo cáo, thay khoảng ngày và kiểm tra bảng/biểu đồ không dùng số liệu mẫu.

Với mỗi flow, kiểm tra thêm: loading khi request đang chạy, error có thể retry, empty khi không có dữ liệu, bảng không làm vỡ chiều ngang ở màn hình nhỏ và route không đúng role bị chuyển hướng hoặc trả 403 từ backend.
