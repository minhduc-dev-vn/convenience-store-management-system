# HƯỚNG DẪN SỬ DỤNG VÀ VẬN HÀNH HỆ THỐNG QUẢN LÝ CỬA HÀNG TIỆN LỢI

> Tài liệu bàn giao dành cho người dùng nghiệp vụ, quản lý cửa hàng và người vận hành kỹ thuật.
>
> Phiên bản tài liệu: 1.0 — cập nhật ngày 14/10/2026.
>
> Nguồn đúng cuối cùng: source code tại revision được checkout và bàn giao trong repository.

## Mục lục

1. Giới thiệu tài liệu
2. Tổng quan hệ thống
3. Truy cập, đăng ký và đăng nhập
4. Quy tắc sử dụng chung
5. Hướng dẫn khách hàng
6. Hướng dẫn thu ngân
7. Hướng dẫn nhân viên kho
8. Hướng dẫn quản lý
9. Quy trình nghiệp vụ liên vai trò
10. Quy tắc nghiệp vụ quan trọng
11. Bảng trạng thái và giá trị miền
12. Xử lý lỗi thường gặp
13. Khởi động hệ thống khi bàn giao
14. Vận hành production
15. Deployment hiện tại
16. Backup và restore
17. Bàn giao hệ thống
18. Bảng tra cứu nhanh
19. Giới hạn hệ thống và lưu ý đã biết
20. Phụ lục

## Chương 1. Giới thiệu tài liệu

### 1.1. Mục đích

Tài liệu này hướng dẫn đầy đủ cách sử dụng và vận hành hệ thống quản lý cửa hàng tiện lợi, từ thao tác hằng ngày của khách hàng, thu ngân, nhân viên kho và quản lý đến cài đặt, triển khai, migration, sao lưu, khôi phục và bàn giao kỹ thuật.

Tài liệu được viết từ:

- source frontend React/Vite và route đang hoạt động;
- source backend Express, quy tắc phân quyền, validation và hợp đồng API;
- schema, stored procedure, migration và script kiểm thử SQL Server;
- `README.md`, `frontend/README.md`, `backend/README.md`, `database/README.md`;
- báo cáo chi tiết do nhóm cung cấp ngoài repository, chủ yếu Chương 2, Chương 3 và Chương 5;
- tài liệu phân công do nhóm cung cấp ngoài repository.

Tên file báo cáo được yêu cầu trong nhiệm vụ không tồn tại nguyên văn trong workspace. Tài liệu này dùng file báo cáo chi tiết đã được dự án ghi nhận trong `.ai/PROJECT_CONTEXT.md` làm nguồn thay thế tương ứng.

### 1.2. Phạm vi

Tài liệu bao phủ 35 chức năng F01–F35 và 28 màn hình MH-01–MH-28 ở mức người dùng và vận hành. Hệ thống phục vụ một cửa hàng, một kho bán hàng tại cửa hàng, bốn vai trò chuẩn và 23 bảng nghiệp vụ cốt lõi.

Ngoài phạm vi hiện tại:

- nhiều chi nhánh hoặc nhiều kho độc lập;
- thanh toán trực tuyến thật qua cổng ngân hàng/ví điện tử;
- tiêu điểm thành viên;
- tính lợi nhuận kế toán chính thức;
- quy trình quên mật khẩu tự phục vụ;
- vai trò `ADMIN` riêng.

### 1.3. Quy ước trình bày

- Đường dẫn như `/cashier/pos` là route frontend.
- Định danh như `PAID`, `DRAFT`, `RESALABLE` là giá trị kỹ thuật thật và được giữ nguyên để đối chiếu.
- “Server xác nhận” nghĩa là frontend chỉ hỗ trợ nhập liệu; backend hoặc transaction SQL Server mới là nguồn quyết định cuối.
- “Xóa mềm” nghĩa là đổi trạng thái thay vì xóa bản ghi đã phát sinh giao dịch.
- Các URL, tài khoản và mật khẩu cụ thể của môi trường bàn giao phải được truyền qua kênh bí mật, không ghi trong tài liệu hoặc Git.

### 1.4. Nguyên tắc nguồn

Khi báo cáo, ảnh mockup và source khác nhau, tài liệu mô tả source hiện hành. Ảnh trong Chương 5 của báo cáo chỉ là thiết kế minh họa, không được xem là giao diện hiện tại. Các khác biệt đã biết được tổng hợp tại Chương 19 và Phụ lục D.

---

## Chương 2. Tổng quan hệ thống

### 2.1. Bài toán nghiệp vụ

Hệ thống thay thế việc quản lý rời rạc bằng sổ hoặc bảng tính cho các nhóm nghiệp vụ:

- tài khoản, nhân viên, khách hàng thành viên và phân quyền;
- danh mục, sản phẩm, giá bán và khuyến mãi;
- nhà cung cấp, phiếu nhập, lô hàng và hạn sử dụng;
- tồn kho, cảnh báo tồn thấp/cận hạn/hết hạn;
- bán hàng tại quầy, thanh toán, hóa đơn và đổi trả;
- ca làm việc và đối chiếu tiền cuối ca;
- kiểm kê và phê duyệt điều chỉnh kho;
- nhật ký thao tác và báo cáo kinh doanh.

### 2.2. Kiến trúc

| Lớp | Công nghệ | Trách nhiệm chính |
|---|---|---|
| Giao diện | ReactJS, Vite, React Router | Hiển thị, điều hướng, nhập liệu, trạng thái loading/error/empty |
| API | Node.js 20+, ExpressJS | Xác thực JWT, RBAC, validation, điều phối nghiệp vụ, trả lỗi chuẩn |
| Dữ liệu | Microsoft SQL Server | 23 bảng core, ràng buộc, view, stored procedure, transaction và báo cáo |
| Triển khai hiện tại | Vercel, Render, Azure SQL | Frontend tĩnh, backend API, cơ sở dữ liệu production |

Backend tổ chức theo luồng `Route -> Middleware -> Controller -> Service -> Repository -> SQL Server`. Các nghiệp vụ nhập kho, bán FEFO, đổi trả và phê duyệt kiểm kê được chốt bằng transaction SQL Server để tránh dữ liệu dở dang.

### 2.3. Vai trò

| Vai trò | Mục đích | Khu vực chính |
|---|---|---|
| `CUSTOMER` | Xem lịch sử mua hàng, điểm/hạng và cập nhật hồ sơ | `/customer/*` |
| `CASHIER` | Mở/đóng ca, POS, hóa đơn, đổi trả | `/cashier/*` |
| `WAREHOUSE` | Nhập hàng, tồn kho, lô, kiểm kê | `/warehouse/*` |
| `MANAGER` | Quản trị danh mục, con người, phê duyệt, audit, báo cáo | `/manager/*` |

Sản phẩm và khuyến mãi đang hiệu lực có thể xem công khai tại `/products` và `/promotions` mà không cần đăng nhập. Ẩn menu ở frontend chỉ hỗ trợ trải nghiệm; backend vẫn kiểm tra JWT, trạng thái tài khoản, chủ sở hữu và role ở mỗi API được bảo vệ.

### 2.4. Luồng dữ liệu quan trọng

1. Giá, trạng thái sản phẩm, tồn khả dụng và giảm giá được server đọc lại khi quote/checkout.
2. Tồn tổng là tổng từ `LO_HANG`; không có cột tổng tồn giả trên `SAN_PHAM`.
3. Bán hàng trừ lô theo FEFO: lô còn hàng, chưa hết hạn, hạn gần nhất trước.
4. Nhập kho, bán hàng, đổi trả và duyệt kiểm kê ghi `GIAO_DICH_KHO` trong cùng transaction.
5. Thao tác nhạy cảm được ghi `NHAT_KY_HE_THONG`; dữ liệu audit không được chứa mật khẩu, token hoặc secret.
6. Timestamp nghiệp vụ mới được lưu theo UTC; ngày người dùng nhập được hiểu theo ngày nghiệp vụ Việt Nam (`SE Asia Standard Time`).

### 2.5. Sơ đồ điều hướng rút gọn

```text
Trang công khai
├── /products
├── /promotions
├── /auth/login
└── /auth/register
    └── Đăng nhập thành công
        ├── CUSTOMER  -> /customer
        ├── CASHIER   -> /cashier
        ├── WAREHOUSE -> /warehouse
        └── MANAGER   -> /manager
```

---

## Chương 3. Truy cập, đăng ký và đăng nhập

### 3.1. Truy cập công khai

Người chưa đăng nhập có thể:

- mở `/products` để tìm sản phẩm đang kinh doanh và xem giá công khai;
- mở `/promotions` để xem chương trình đang hiệu lực;
- mở `/auth/register` để đăng ký tài khoản khách hàng;
- mở `/auth/login` để đăng nhập.

Khi nhập trực tiếp một route được bảo vệ mà chưa có session, frontend chuyển về trang đăng nhập. Sau đăng nhập, route sai role sẽ được chuyển về trang chính của role; nếu gọi API trái quyền, backend trả `403`.

### 3.2. Đăng ký khách hàng — MH-02

Tại `/auth/register`:

1. Nhập họ tên.
2. Nhập số điện thoại từ 9 đến 15 chữ số, có thể bắt đầu bằng `+`.
3. Nhập email nếu có; email phải đúng định dạng.
4. Nhập ngày sinh nếu có; không được là ngày tương lai.
5. Nhập mật khẩu ít nhất 6 ký tự và không quá 72 byte UTF-8.
6. Nhập lại mật khẩu giống hệt.
7. Chọn hoàn tất đăng ký.

Số điện thoại trở thành tên đăng nhập. Hệ thống tạo hồ sơ `KHACH_HANG` với điểm ban đầu 0, hạng `BRONZE` và tài khoản role `CUSTOMER`. Trùng số điện thoại hoặc email bị từ chối rõ ràng. Không chia sẻ một số điện thoại cho nhiều thành viên.

### 3.3. Đăng nhập — MH-01

Tại `/auth/login`:

1. Nhập tên đăng nhập, số điện thoại hoặc email vào ô định danh.
2. Nhập mật khẩu.
3. Tùy chọn “Ghi nhớ đăng nhập”:
   - bật: session được lưu trong `localStorage`;
   - tắt: session được lưu trong `sessionStorage` và kết thúc theo phiên trình duyệt.
4. Chọn **Đăng nhập**.

Kết quả thường gặp:

- đúng thông tin, tài khoản/chủ sở hữu đang hoạt động: chuyển đến dashboard đúng role;
- sai thông tin: `401` và thông báo xác thực thất bại;
- tài khoản `LOCKED`: `403 ACCOUNT_LOCKED`;
- tài khoản hoặc chủ sở hữu không hoạt động: `403 ACCOUNT_INACTIVE`;
- token hết hạn/không hợp lệ: yêu cầu đăng nhập lại.

Không có chức năng “Quên mật khẩu” tự phục vụ. Khách hàng cần liên hệ quản lý theo quy trình hỗ trợ ngoài hệ thống; nhân viên được quản lý cấp lại mật khẩu tại MH-20.

### 3.4. Đổi mật khẩu — MH-03

Mọi role đã đăng nhập dùng `/account/change-password`:

1. Nhập mật khẩu hiện tại.
2. Nhập mật khẩu mới ít nhất 6 ký tự, không quá 72 byte UTF-8 và khác mật khẩu cũ.
3. Xác nhận mật khẩu mới.
4. Lưu thay đổi.

Backend kiểm tra mật khẩu hiện tại, băm mật khẩu mới và ghi audit. Không ghi mật khẩu rõ hoặc hash vào log.

### 3.5. Đăng xuất và bảo vệ phiên

- Chọn **Đăng xuất** ở thanh điều hướng role để xóa token và thông tin phiên, sau đó trở về MH-01.
- Không dùng tài khoản chung.
- Không chụp, gửi hoặc dán token JWT vào ticket/chat.
- Trên máy dùng chung, không bật ghi nhớ đăng nhập và phải đóng trình duyệt sau khi đăng xuất.
- Sau khi khóa tài khoản, các request tiếp theo không được backend chấp nhận dù token cũ còn hạn.

> **[CHỖ CHÈN ẢNH THỰC TẾ 01]** MH-01 đăng nhập và thông báo lỗi. Chỉ dùng ảnh chụp từ phiên bản đang chạy; che toàn bộ mật khẩu, token và dữ liệu cá nhân không cần thiết.

---

## Chương 4. Quy tắc sử dụng chung

### 4.1. Giao diện và điều hướng

- Header hiển thị nhận diện hệ thống; khu vực đã đăng nhập có sidebar theo role.
- Footer chỉ xuất hiện ở trang công khai, không xuất hiện trong workspace `/customer/*`, `/cashier/*`, `/warehouse/*`, `/manager/*`.
- Các bảng rộng có vùng cuộn ngang trên màn hình nhỏ; không kéo cả trang ngang nếu có thể cuộn trong bảng.
- Nút gửi bị khóa trong lúc request đang chạy để hạn chế gửi lặp.
- Màn hình dữ liệu có trạng thái loading, error, empty và nút thử lại phù hợp.
- Refresh trực tiếp route sâu vẫn phục hồi session nếu token còn hợp lệ.

### 4.2. Tìm kiếm, bộ lọc và phân trang

- Nhập từ khóa rồi chọn nút lọc/tìm hoặc nhấn Enter theo từng màn hình.
- Khi đổi bộ lọc, hệ thống thường trở về trang 1.
- Khoảng ngày dùng định dạng giao diện của trình duyệt nhưng API gửi `YYYY-MM-DD`, với `from <= to`.
- Ngày lọc là ngày nghiệp vụ Việt Nam; hệ thống chuyển biên ngày sang UTC ở tầng dữ liệu.
- Xóa bộ lọc hoặc dùng giá trị “Tất cả” để trở về danh sách đầy đủ trong phạm vi quyền.

### 4.3. Trạng thái và xóa mềm

Sản phẩm, loại sản phẩm, nhà cung cấp, nhân viên và tài khoản đã liên quan giao dịch không bị hard delete. Người dùng đổi `ACTIVE`/`INACTIVE` hoặc khóa/mở theo API. Bản ghi lịch sử, hóa đơn hoàn tất, audit và giao dịch kho không có luồng xóa thông thường.

### 4.4. Xác nhận thao tác nhạy cảm

Các thao tác như khóa/mở tài khoản, đổi trạng thái, đổi giá, xác nhận nhập, checkout, trả hàng, duyệt kiểm kê và đóng ca có hộp xác nhận. Trước khi xác nhận:

1. đọc mã đối tượng và nội dung thay đổi;
2. kiểm tra tổng tiền/số lượng/chênh lệch;
3. bảo đảm không còn request cũ đang chạy;
4. chỉ bấm một lần và chờ kết quả.

### 4.5. Dữ liệu cá nhân và bí mật

- Chỉ nhập dữ liệu cần cho nghiệp vụ.
- Không nhập mật khẩu, token, chuỗi kết nối hoặc thông tin thẻ vào ghi chú/lý do.
- Không xuất ảnh chụp chứa dữ liệu cá nhân ra kênh công khai.
- `PasswordHash` không được API hoặc giao diện trả về.
- Audit trước/sau được lọc khóa nhạy cảm.

### 4.6. Lỗi chuẩn

API trả cấu trúc lỗi nhất quán gồm `success: false` và `error.code`, `error.message`. Production không trả stack trace, raw SQL error hoặc secret. Người dùng nên ghi nhận thời gian, route, mã đối tượng và `error.code`; không sao chép Authorization header.

---

## Chương 5. Hướng dẫn khách hàng

### 5.1. Cổng sản phẩm công khai — MH-26

Route: `/products`.

1. Mở trang không cần đăng nhập.
2. Tìm theo tên hoặc mã sản phẩm; chọn loại sản phẩm nếu cần.
3. Chuyển trang bằng phân trang.
4. Chọn **Xem chi tiết** để xem ảnh, loại, đơn vị tính và giá bán.
5. Chỉ sản phẩm và loại đang `ACTIVE` được trả về.

Ảnh sản phẩm dùng `ImageUrl` HTTP(S) nếu có; nếu thiếu hoặc tải lỗi, component dùng fallback an toàn. Giá ở đây là giá công khai hiện tại, nhưng POS vẫn đọc lại giá khi quote và checkout.

### 5.2. Khuyến mãi công khai — MH-26

Route: `/promotions` và khu ưu đãi trên `/products`.

- Chỉ chương trình `ACTIVE`, trong thời gian hiệu lực và có sản phẩm áp dụng được hiển thị.
- Loại giảm là `PERCENT` hoặc `AMOUNT`.
- Điều kiện có thể gồm đơn hàng tối thiểu, sản phẩm áp dụng và mức giảm tối đa với giảm phần trăm.
- Việc hiển thị không đảm bảo tự động áp dụng; tại POS, server đánh giá lại toàn bộ điều kiện.
- Hệ thống không tự cộng dồn nhiều khuyến mãi và không tự chọn chương trình thay người dùng.

### 5.3. Tổng quan thành viên

Route: `/customer`.

Sau đăng nhập `CUSTOMER`, trang tổng quan hiển thị hồ sơ tóm tắt, điểm, hạng và liên kết nhanh đến lịch sử mua hàng/hồ sơ. Điểm và hạng chỉ đọc.

### 5.4. Lịch sử mua hàng và điểm — MH-27

Route: `/customer/history`.

1. Chọn khoảng ngày nếu cần.
2. Xem danh sách hóa đơn `PAID` hoặc `REFUNDED` thuộc chính khách hàng đang đăng nhập.
3. Chuyển trang.
4. Mở chi tiết để xem dòng hàng, thanh toán và dữ liệu liên quan.

Backend lấy `customerId` từ token/owner, không tin `customerId` do client tự truyền. Khách hàng không xem được hóa đơn của người khác. Điểm tích lũy hiện tại và hạng thành viên không thể tự chỉnh sửa.

### 5.5. Cập nhật hồ sơ — MH-28

Route: `/customer/profile`.

Có thể sửa:

- họ tên, tối đa 100 ký tự;
- email hợp lệ, tối đa 100 ký tự, có thể để trống;
- địa chỉ, tối đa 255 ký tự, có thể để trống.

Không thể sửa:

- số điện thoại/tên đăng nhập;
- điểm tích lũy;
- hạng thành viên;
- ngày đăng ký;
- trạng thái tài khoản.

Nếu API lỗi, form giữ dữ liệu đang nhập để người dùng chỉnh và gửi lại.

> **[CHỖ CHÈN ẢNH THỰC TẾ 02]** Cổng sản phẩm công khai với ảnh sản phẩm và khuyến mãi hiện hành.
>
> **[CHỖ CHÈN ẢNH THỰC TẾ 03]** Lịch sử mua hàng của một tài khoản test, đã ẩn dữ liệu cá nhân.

---

## Chương 6. Hướng dẫn thu ngân

### 6.1. Dashboard và trạng thái ca — MH-04/MH-05

Route: `/cashier`.

Dashboard gọi API lấy ca `OPEN` hiện tại, không chỉ dựa vào state trình duyệt. Nếu ca được mở từ ngày nghiệp vụ trước, hệ thống hiển thị cảnh báo ca mang sang; thu ngân cần đối chiếu và đóng ca cũ trước khi mở ca mới.

#### Mở ca

1. Đăng nhập bằng role `CASHIER`.
2. Nhập tiền mặt đầu ca, giá trị lớn hơn hoặc bằng 0.
3. Nhập ghi chú nếu cần, tối đa 255 ký tự.
4. Chọn **Mở ca và vào POS**.

Hệ thống ghi thời điểm mở, nhân viên và trạng thái `OPEN`. Một thu ngân không thể mở hai ca chồng nhau.

### 6.2. Tìm sản phẩm và lập giỏ — MH-06

Route: `/cashier/pos`. POS chỉ hoạt động khi có ca `OPEN`.

1. Đặt con trỏ tại ô quét/tìm.
2. Quét barcode rồi nhấn Enter để lookup chính xác; hoặc nhập một phần mã/tên/barcode để tìm thủ công.
3. Chỉ sản phẩm `ACTIVE`, thuộc loại `ACTIVE` và có tồn bán được từ lô chưa hết hạn được trả về.
4. Thêm sản phẩm vào giỏ.
5. Tăng/giảm số lượng hoặc xóa dòng.
6. Nhập số điện thoại thành viên nếu khách cung cấp.
7. Chọn khuyến mãi cụ thể nếu phù hợp.
8. Yêu cầu quote để server đọc lại giá, trạng thái, tồn và điều kiện khuyến mãi.

Không dựa vào tổng tính ở trình duyệt. Nếu khách sửa request hoặc giá client, backend bỏ qua giá/giảm giá đó và tính lại từ database.

### 6.3. Quote và khuyến mãi — MH-06/MH-07

Quote trả breakdown:

- đơn giá và thành tiền từng dòng;
- tạm tính;
- khuyến mãi được chọn và số giảm server-side;
- tổng phải thanh toán;
- thông tin thành viên hợp lệ;
- điểm dự kiến cộng: `floor(TongTien / 10.000)` theo source hiện hành.

Khuyến mãi hết hạn, sai sản phẩm, chưa đạt đơn tối thiểu hoặc không hoạt động sẽ không áp dụng. Hệ thống chưa có tiêu điểm; không hứa hoặc nhập tỷ lệ quy đổi điểm.

### 6.4. Thanh toán và hóa đơn — MH-07

1. Kiểm tra quote cuối.
2. Chọn `CASH`, `CARD`, `TRANSFER` hoặc `EWALLET`.
3. Với `CASH`, nhập tiền khách đưa để giao diện tính tiền thối; tiền nhận phải đủ.
4. Với phương thức không tiền mặt, đây là ghi nhận/mô phỏng nghiệp vụ, không gọi cổng thanh toán thật.
5. Chọn xác nhận một lần. Nút bị khóa khi đang gửi.
6. Khi thành công, mở hóa đơn chỉ đọc tại `/cashier/receipts/:invoiceId` và có thể in bằng trình duyệt.

Backend revalidate ca, giỏ, khách hàng và khuyến mãi, sau đó gọi transaction FEFO. Thành công mới đồng thời tạo hóa đơn, chi tiết, xuất lô, giao dịch kho, thanh toán và điểm. Thiếu tồn hoặc lỗi SQL làm rollback toàn bộ. `invoiceId` được dùng làm khóa idempotency ở mức thiết kế hiện tại để request lặp giống nhau không trừ kho hai lần.

### 6.5. Tra cứu hóa đơn — MH-08

Route: `/cashier/invoices`.

- lọc theo một phần mã hóa đơn và khoảng ngày;
- xem danh sách có phân trang;
- mở chi tiết chỉ đọc;
- thu ngân chỉ thấy hóa đơn theo phạm vi backend hiện hành;
- từ hóa đơn đủ điều kiện có thể đi đến luồng đổi trả.

### 6.6. Đổi/trả hàng — MH-09

Route khởi đầu: `/cashier/returns`; xử lý: `/cashier/returns/:invoiceId`.

1. Tìm và mở hóa đơn gốc ở trạng thái `PAID`.
2. Với từng dòng/lô cần trả, xem số đã mua, đã trả trước và còn được trả.
3. Nhập số lượng trả lần này; không vượt số còn lại.
4. Chọn tình trạng:
   - `RESALABLE`: hàng có thể bán lại, cộng về đúng lô;
   - `DAMAGED`: không cộng vào tồn bán được.
5. Nhập lý do, tối đa 255 ký tự.
6. Kiểm tra số tiền hoàn do server tính.
7. Xác nhận một lần.

Backend không tin số tiền hoàn hoặc số lượng do client tự tính. Dòng trả phải khớp `CHI_TIET_XUAT_LO` của hóa đơn; over-return bị từ chối. Return lặp một phần vẫn đúng theo phần đã trả trước. Hóa đơn từng dùng điểm (`DiemSuDung > 0`) bị chặn vì chính sách tiêu điểm chưa chốt. API hiện không có trường chọn phương thức hoàn tiền và chưa có ngưỡng quản lý phê duyệt.

### 6.7. Đối chiếu và đóng ca — MH-05

1. Trở lại `/cashier`.
2. Làm mới số liệu đối chiếu.
3. Kiểm tra doanh thu gộp, tiền hoàn, doanh thu thuần, tiền mặt, không tiền mặt và số hóa đơn.
4. Nếu còn hóa đơn `DRAFT`, xử lý trước; hệ thống không cho đóng ca.
5. Nhập tiền mặt thực tế cuối ca và ghi chú chênh lệch nếu cần.
6. Kiểm tra:
   - tiền dự kiến = tiền đầu ca + doanh thu tiền mặt thuần;
   - chênh lệch = tiền kiểm đếm - tiền dự kiến.
7. Xác nhận đóng ca.
8. In phiếu bàn giao nếu cần.

Ca chuyển sang `CLOSED`; POS không tiếp tục sử dụng ca đó và double-close bị từ chối.

> **[CHỖ CHÈN ẢNH THỰC TẾ 04]** Dashboard thu ngân có ca `OPEN` và cảnh báo ca mang sang nếu có.
>
> **[CHỖ CHÈN ẢNH THỰC TẾ 05]** POS sau khi server trả quote, không chứa dữ liệu thanh toán thật.
>
> **[CHỖ CHÈN ẢNH THỰC TẾ 06]** Phiếu đối chiếu ca đã đóng.

---

## Chương 7. Hướng dẫn nhân viên kho

### 7.1. Dashboard kho — MH-04

Route: `/warehouse`.

Dashboard dùng API thật để hiển thị cảnh báo tồn thấp và lô cận/hết hạn, đồng thời cung cấp liên kết nhanh đến nhập hàng, tồn kho và kiểm kê. Role `WAREHOUSE` không có quyền quản lý nhà cung cấp, duyệt kiểm kê hoặc sửa tồn trực tiếp.

### 7.2. Danh sách phiếu nhập — MH-12

Route: `/warehouse/receiving`.

- tìm theo mã phiếu hoặc nhà cung cấp;
- lọc theo `DRAFT`, `CONFIRMED`, `CANCELLED`;
- phân trang và mở chi tiết;
- tạo phiếu mới;
- phiếu `DRAFT` có thể sửa, hủy hoặc xác nhận;
- phiếu đã `CONFIRMED`/`CANCELLED` chỉ đọc.

### 7.3. Tạo và sửa phiếu nhập — MH-11

Route tạo: `/warehouse/receiving/new`; route sửa: `/warehouse/receiving/:receiptId/edit`.

#### Tạo phần đầu phiếu

1. Chọn nhà cung cấp đang `ACTIVE`.
2. Chọn thời điểm nhận nếu giao diện yêu cầu; để trống thì backend dùng thời điểm phù hợp.
3. Nhập ghi chú nếu cần.
4. Lưu để nhận mã phiếu `DRAFT`.

#### Thêm dòng hàng

Mỗi dòng gồm:

- sản phẩm đang hợp lệ;
- số lô của nhà sản xuất;
- ngày sản xuất nếu có;
- hạn sử dụng nếu có;
- số lượng nguyên lớn hơn 0;
- đơn giá nhập lớn hơn hoặc bằng 0.

Hạn sử dụng phải sau ngày sản xuất khi có cả hai. Không tạo trùng tổ hợp lô trái ràng buộc. Có thể sửa/xóa dòng khi phiếu còn `DRAFT`; chưa có thay đổi tồn kho ở bước này.

### 7.4. Xác nhận nhập kho — MH-12

Trước khi xác nhận:

1. đối chiếu nhà cung cấp và hàng thực nhận;
2. kiểm tra mã sản phẩm, số lô, NSX/HSD trên bao bì;
3. kiểm tra số lượng và giá nhập;
4. bảo đảm phiếu có ít nhất một dòng;
5. đọc lại cảnh báo và xác nhận.

Stored procedure/transaction thực hiện nguyên tử:

- kiểm tra phiếu còn `DRAFT`;
- chuyển phiếu sang `CONFIRMED`;
- tạo hoặc cập nhật lô đúng thiết kế;
- tăng `SoLuongTon`;
- ghi `GIAO_DICH_KHO` loại `IMPORT`;
- ghi audit xác nhận.

Xác nhận lặp bị từ chối. Nếu một dòng lỗi, toàn bộ transaction rollback và không để tồn kho tăng dở dang.

### 7.5. Tra cứu tồn kho, lô và cảnh báo — MH-13

Route: `/warehouse/inventory`.

1. Tìm theo mã/tên sản phẩm.
2. Chọn chế độ `ALL`, `LOW_STOCK`, `NEAR_EXPIRY` hoặc `EXPIRED`.
3. Xem tồn tổng, tồn bán được, mức tồn tối thiểu và trạng thái tồn thấp.
4. Chọn sản phẩm để drill-down lô.
5. Lọc lô theo `ALL`, `VALID`, `NEAR_EXPIRY`, `EXPIRED` và trạng thái lô `ACTIVE`, `BLOCKED`, `EXPIRED` nếu cần.

Mặc định ngưỡng cận hạn là 30 ngày ở API. Tồn tổng được tính từ lô; lô hết hạn không được tính là tồn bán được tại POS. Màn hình không có nút đặt stock trực tiếp.

### 7.6. Kiểm kê — MH-14

Route: `/warehouse/stocktakes`.

#### Tạo đợt

1. Bảo đảm không có đợt `DRAFT` đang thực hiện.
2. Chọn tạo đợt kiểm kê.
3. Hệ thống snapshot `SoLuongHeThong` theo từng lô tại thời điểm tạo.

Snapshot không tự đổi theo giao dịch phát sinh sau đó. Nếu kho chưa có lô, hệ thống không tạo đợt rỗng.

#### Nhập số lượng thực tế

1. Chọn dòng lô.
2. Nhập `SoLuongThucTe` là số nguyên từ 0 trở lên.
3. Hệ thống/server tính `ChenhLech = SoLuongThucTe - SoLuongHeThong`.
4. Nếu có chênh lệch, lý do là bắt buộc.
5. Lưu từng thay đổi khi đợt còn cho phép sửa.

#### Gửi đề nghị

1. Hoàn tất các dòng cần kiểm đếm.
2. Bảo đảm có ít nhất một chênh lệch và mọi chênh lệch đều có lý do.
3. Chọn gửi đề nghị và xác nhận.

Sau khi ở quy trình `PENDING_APPROVAL`, nhân viên kho không sửa. Nếu quản lý từ chối, quy trình trở thành `RECOUNT_REQUIRED`; nhân viên kho kiểm lại, cập nhật và gửi lại. Nhân viên kho không có quyền approve hoặc set stock.

> **[CHỖ CHÈN ẢNH THỰC TẾ 07]** Phiếu nhập `DRAFT` có dòng lô/NSX/HSD.
>
> **[CHỖ CHÈN ẢNH THỰC TẾ 08]** Màn hình tồn kho drill-down lô và cảnh báo.
>
> **[CHỖ CHÈN ẢNH THỰC TẾ 09]** Đợt kiểm kê đang nhập số lượng thực tế.

---

## Chương 8. Hướng dẫn quản lý

### 8.1. Dashboard quản lý — MH-04

Route: `/manager`.

Dashboard lấy KPI điều hành từ API báo cáo, hiển thị liên kết phê duyệt kiểm kê và thao tác nhanh đến sản phẩm, giá, khuyến mãi, nhà cung cấp, nhân sự, tài khoản, khách hàng, audit và báo cáo. Không có số liệu hardcode; khi API không có dữ liệu, giao diện dùng trạng thái empty.

### 8.2. Nhà cung cấp — MH-10

Route: `/manager/suppliers`.

- tìm theo tên, số điện thoại hoặc mã phù hợp;
- xem mã, tên, số điện thoại, email, địa chỉ, mã số thuế và trạng thái;
- thêm/sửa hồ sơ;
- đổi `ACTIVE`/`INACTIVE` sau xác nhận;
- không hard delete.

Tên, số điện thoại là dữ liệu bắt buộc theo API; số điện thoại và mã số thuế phải không trùng theo constraint. Role khác `MANAGER` bị chặn.

### 8.3. Sản phẩm và loại sản phẩm — MH-16

Route: `/manager/products`.

#### Sản phẩm

- tìm kiếm, lọc loại/trạng thái và phân trang;
- thêm/sửa mã sản phẩm, tên, barcode, đơn vị tính, loại, giá bán, mức tồn tối thiểu, URL ảnh và trạng thái;
- giá phải lớn hơn 0; mức tồn tối thiểu lớn hơn hoặc bằng 0;
- barcode nếu có phải duy nhất;
- loại sản phẩm phải đang hợp lệ;
- `ImageUrl` nếu có phải là HTTP(S), tối đa 500 ký tự;
- chuyển `INACTIVE` thay vì xóa.

#### Loại sản phẩm

Quản lý tạo/sửa/đổi trạng thái loại. Mã và tên phải duy nhất; loại đã có sản phẩm không hard delete. Khi loại `INACTIVE`, sản phẩm thuộc loại không được public/POS xem như đang kinh doanh.

### 8.4. Điều chỉnh giá — MH-17

Route: `/manager/products/pricing`.

1. Tìm và chọn sản phẩm.
2. Nhập giá mới lớn hơn 0 và khác giá hiện tại.
3. Nhập lý do, tối đa 255 ký tự.
4. Kiểm tra giá cũ/mới và xác nhận.
5. Làm mới danh sách/lịch sử.

Backend cập nhật giá và ghi audit gồm giá cũ, giá mới, actor và thời gian. Không có bảng `LICH_SU_GIA`; lịch sử giá đọc từ `NHAT_KY_HE_THONG`.

### 8.5. Khuyến mãi — MH-18

Route: `/manager/promotions`.

Khi tạo/sửa:

- nhập mã, tên và mô tả phù hợp;
- chọn `PERCENT` hoặc `AMOUNT`;
- giá trị giảm lớn hơn 0; `PERCENT` không vượt 100;
- nhập đơn tối thiểu lớn hơn hoặc bằng 0;
- mức giảm tối đa chỉ áp dụng cho `PERCENT`;
- thời điểm kết thúc phải sau thời điểm bắt đầu;
- chọn từ 1 đến 100 sản phẩm, không trùng;
- chọn trạng thái `ACTIVE`/`INACTIVE`.

Chỉ promotion trong thời gian hiệu lực mới xuất hiện ở public. POS áp dụng chương trình do thu ngân chọn và server đánh giá; không có stacking/auto-best-promotion rule.

### 8.6. Nhân viên — MH-19

Route: `/manager/employees`.

- tìm kiếm, lọc trạng thái, phân trang;
- thêm/sửa họ tên, số điện thoại, ngày sinh, giới tính `MALE`/`FEMALE`/`OTHER`, email, địa chỉ, ngày vào làm, lương cơ bản và trạng thái;
- số điện thoại bắt buộc và duy nhất;
- ngày sinh không ở tương lai;
- chuyển `ACTIVE`/`INACTIVE`, không hard delete.

Vô hiệu hóa hồ sơ nhân viên làm ảnh hưởng khả năng xác thực của account sở hữu; cần bàn giao ca/công việc trước khi thực hiện.

### 8.7. Tài khoản và phân quyền — MH-20

Route: `/manager/accounts`.

#### Tạo tài khoản

- account có owner type `EMPLOYEE` hoặc `CUSTOMER`;
- khách hàng chỉ được role `CUSTOMER`;
- nhân viên chỉ được `CASHIER`, `WAREHOUSE` hoặc `MANAGER`;
- mỗi owner chỉ có một account;
- username duy nhất;
- mật khẩu được băm, không trả hash ra API.

#### Thao tác quản trị

- đổi role hợp lệ;
- khóa `ACTIVE -> LOCKED` hoặc mở `LOCKED -> ACTIVE`;
- cấp lại mật khẩu cho nhân viên;
- xem owner và trạng thái account;
- mọi thao tác nhạy cảm được audit.

Không có role `ADMIN`. Schema/API hiện không có cờ “bắt đổi mật khẩu lần đăng nhập kế tiếp”; khi cấp lại mật khẩu, quản lý phải truyền đạt an toàn và yêu cầu nhân viên tự đổi tại MH-03 theo quy trình tổ chức.

### 8.8. Khách hàng thành viên — MH-21

Route: `/manager/customers`.

- tìm theo tên, số điện thoại, email;
- lọc hạng và trạng thái;
- xem mã khách hàng, hồ sơ, điểm, hạng, ngày đăng ký, trạng thái;
- xem lịch sử hóa đơn theo quyền quản lý, tách biệt API self-ownership của khách hàng;
- khóa/mở account khách hàng sau xác nhận và ghi audit.

Không có chức năng sửa tay điểm tích lũy. Không được đổi role account khách hàng sang role nhân viên.

### 8.9. Tồn kho và hóa đơn

- `/manager/inventory`: quyền đọc tồn tổng/lô/cảnh báo giống MH-13, không set stock.
- `/manager/invoices`: lọc mã, khoảng ngày và thu ngân; mở chi tiết phục vụ đối soát.
- hóa đơn hoàn tất không bị xóa.

### 8.10. Phê duyệt kiểm kê — MH-15

Route: `/manager/stocktakes`.

1. Lọc `PENDING_APPROVAL`.
2. Mở đề nghị và xem snapshot, số thực tế, chênh lệch, lý do.
3. Nếu đúng, nhập nhận xét tùy chọn và xác nhận phê duyệt.
4. Nếu cần kiểm lại, nhập nhận xét bắt buộc và từ chối.

Khi approve, DB kiểm tra snapshot không lỗi thời, cập nhật lô theo chênh lệch, ghi `GIAO_DICH_KHO` loại `ADJUSTMENT` với `SoLuongBienDong` có dấu, khóa đợt và ghi audit trong một transaction. Quản lý không sửa trực tiếp `LO_HANG`.

### 8.11. Nhật ký thao tác — MH-22

Route: `/manager/audit-logs`.

- lọc thời gian, actor/username, action, table và record;
- xem actor, action, target, thời gian, IP;
- mở chi tiết dữ liệu trước/sau ở dạng đọc được;
- phân trang;
- audit là append-only ở luồng ứng dụng: không có API cập nhật/xóa thông thường;
- payload nhạy cảm như password/token/secret bị chặn hoặc loại bỏ.

### 8.12. Báo cáo — MH-23/MH-24/MH-25

Dashboard: `/manager/reports`.

#### Doanh thu — `/manager/reports/revenue`

- chọn `from`/`to`, với `from <= to`;
- xem số hóa đơn hoàn tất, doanh thu gộp, tiền hoàn, doanh thu thuần;
- xem xu hướng theo ngày và bảng nguồn;
- **Xuất PDF** gọi chức năng in của trình duyệt;
- nút **Xuất Excel** hiện tải tệp CSV, không phải workbook `.xlsx`.

#### Hàng hóa và nhập hàng — `/manager/reports/merchandise`

- sản phẩm bán chạy/chậm theo số lượng bán, trả, thuần và doanh thu;
- phân bố theo loại;
- tổng tồn, tồn bán được, bị khóa, hết hạn, số lô và giá trị theo giá nhập;
- phiếu nhập đã xác nhận, số nhà cung cấp, số lượng và chi phí nhập.

#### Nhân viên và ca — `/manager/reports/workforce`

- doanh thu theo nhân viên;
- số ca, số hóa đơn, doanh thu gộp/hoàn/thuần;
- tiền đầu/cuối ca và chênh lệch tiền mặt;
- lịch sử ca trong kỳ.

Báo cáo không hiển thị lợi nhuận vì chưa có công thức nghiệp vụ được duyệt. Không suy diễn lợi nhuận đơn giản từ giá bán trừ giá nhập.

> **[CHỖ CHÈN ẢNH THỰC TẾ 10]** Danh sách sản phẩm quản lý và form sửa.
>
> **[CHỖ CHÈN ẢNH THỰC TẾ 11]** Màn hình phê duyệt chênh lệch kiểm kê.
>
> **[CHỖ CHÈN ẢNH THỰC TẾ 12]** Báo cáo doanh thu với kỳ và dữ liệu test đã kiểm soát.

---

## Chương 9. Quy trình nghiệp vụ liên vai trò

### 9.1. Nhập hàng đến bán hàng

```text
MANAGER tạo/duy trì nhà cung cấp và sản phẩm
    -> WAREHOUSE tạo phiếu nhập DRAFT
    -> WAREHOUSE thêm dòng lô, số lượng, giá nhập, NSX/HSD
    -> WAREHOUSE xác nhận nhập
    -> DB tăng tồn theo lô + ghi IMPORT
    -> CASHIER mở ca và tìm sản phẩm bán được
    -> Server quote giá/khuyến mãi/tồn
    -> CASHIER checkout
    -> DB trừ lô FEFO + ghi SALE + hóa đơn + thanh toán
```

Điểm kiểm soát: phiếu draft chưa tăng tồn; lô hết hạn không bán; checkout lỗi rollback; giá client không authoritative.

### 9.2. Đổi/trả và phục hồi tồn

```text
CASHIER tra hóa đơn PAID
    -> chọn đúng dòng và lô đã xuất
    -> nhập số lượng còn được trả + tình trạng
    -> server tính refund
    -> DB tạo phiếu trả
       ├── RESALABLE -> cộng đúng lô + RETURN
       └── DAMAGED   -> không cộng tồn bán
    -> cập nhật trạng thái/điểm theo transaction hiện hành
```

Điểm kiểm soát: không over-return, không tin refund client, không xử lý hóa đơn đã tiêu điểm, không có manager approval threshold khi chưa có quyết định.

### 9.3. Kiểm kê và điều chỉnh

```text
WAREHOUSE tạo snapshot theo lô
    -> nhập actual count và lý do
    -> gửi PENDING_APPROVAL
    -> MANAGER xem variance
       ├── từ chối -> RECOUNT_REQUIRED -> WAREHOUSE kiểm lại
       └── phê duyệt -> DB ADJUSTMENT có dấu + audit -> APPROVED
```

Điểm kiểm soát: chênh lệch do server/DB tính, warehouse không approve, manager không sửa lô trực tiếp, snapshot lỗi thời bị từ chối.

### 9.4. Nhân sự và tài khoản

```text
MANAGER tạo hồ sơ nhân viên
    -> tạo account gắn owner EMPLOYEE
    -> gán CASHIER/WAREHOUSE/MANAGER
    -> nhân viên đăng nhập và đổi mật khẩu
    -> khi nghỉ/ngưng công việc: khóa account hoặc chuyển hồ sơ INACTIVE
```

Thay role, khóa/mở và reset mật khẩu đều phải có audit. Không xóa hồ sơ đã có giao dịch.

### 9.5. Ca bán hàng và bàn giao

```text
CASHIER mở ca với tiền đầu ca
    -> bán hàng/hoàn trả trong ca
    -> xem reconciliation
    -> xử lý hóa đơn DRAFT còn lại
    -> nhập tiền thực đếm
    -> đóng ca
    -> in phiếu bàn giao
```

Nếu ca mang sang ngày khác, cảnh báo chỉ mang tính thông tin; ca vẫn phải được chính thu ngân sở hữu đối chiếu và đóng hợp lệ.

---

## Chương 10. Quy tắc nghiệp vụ quan trọng

### 10.1. Giá, giảm giá và tổng tiền

- Giá bán đọc lại từ database ở quote và checkout.
- Client không được gửi giá hoặc discount làm nguồn quyết định.
- Khuyến mãi chỉ áp dụng khi đúng thời gian, trạng thái, sản phẩm và đơn tối thiểu.
- `PERCENT` bị giới hạn bởi giá trị phần trăm và mức giảm tối đa nếu có.
- Hệ thống không có rule cộng dồn nhiều promotion.
- Tổng thanh toán lưu trong hóa đơn phải khớp transaction authoritative.

### 10.2. FEFO và tồn kho

- FEFO chọn lô chưa hết hạn, còn tồn, theo hạn gần nhất.
- Không để `SoLuongTon` âm.
- Lô hết hạn bị bỏ qua khi tính bán được.
- Không có API/UI set tồn trực tiếp.
- Mọi tăng/giảm hợp lệ đi qua `IMPORT`, `SALE`, `RETURN` hoặc `ADJUSTMENT`.

### 10.3. Điểm và hạng thành viên

- Thành viên mới: 0 điểm, hạng `BRONZE`.
- Source hiện hành dự kiến cộng `floor(TongTien / 10.000)` khi bán thành công.
- Điểm/hạng chỉ đọc với khách hàng và quản lý không sửa tay.
- Tiêu điểm chưa được triển khai vì tỷ lệ/quy tắc chưa chốt.
- Return có thể điều chỉnh điểm đã cộng theo transaction; return bị chặn nếu hóa đơn đã dùng điểm.

### 10.4. Ngày và múi giờ

- Timestamp mới lưu UTC và API trả ISO UTC.
- Frontend hiển thị theo locale/múi giờ người dùng.
- Bộ lọc `from`/`to` được hiểu là ngày nghiệp vụ Việt Nam.
- Giá trị cột SQL `DATE` là ngày thuần túy, không tự gắn timezone.
- Migration `002_fix_business_timezone.sql` không viết lại timestamp lịch sử.

### 10.5. Tính nguyên tử và gửi lặp

- Import, checkout, return và approve stocktake dùng transaction DB.
- Lỗi giữa chừng rollback toàn bộ.
- Confirm phiếu nhập/đóng ca/approve lặp bị từ chối theo trạng thái.
- Checkout dùng mã hóa đơn/idempotency hiện có; cùng ID nhưng payload khác bị conflict.
- Giao diện khóa nút khi gửi, nhưng người dùng vẫn phải tránh refresh/gửi lại tùy tiện.

### 10.6. Phân quyền và quyền sở hữu

- `CUSTOMER` chỉ truy cập hồ sơ/hóa đơn của chính mình.
- `CASHIER` chỉ vận hành ca/POS/hóa đơn/return trong phạm vi API.
- `WAREHOUSE` không quản lý nhà cung cấp và không duyệt kiểm kê.
- `MANAGER` không dùng API self-ownership của khách hàng để xem lịch sử; có API admin riêng.
- Menu ẩn không thay thế kiểm tra backend.

### 10.7. Audit và dữ liệu bất biến

- Giá, lock/unlock, role, reset mật khẩu, xác nhận nhập, return, duyệt kiểm kê và thao tác quản trị phù hợp được audit.
- Không ghi password, token, secret, Authorization header hay raw SQL error.
- Không có update/delete audit thông thường.
- Hóa đơn hoàn tất và giao dịch kho không hard delete.

---

## Chương 11. Bảng trạng thái và giá trị miền

### 11.1. Trạng thái đối tượng chính

| Đối tượng | Giá trị hiện hành | Ý nghĩa vận hành |
|---|---|---|
| Nhân viên `NHAN_VIEN` | `ACTIVE`, `INACTIVE` | Đang làm việc hoặc ngưng hoạt động |
| Khách hàng `KHACH_HANG` | `ACTIVE`, `INACTIVE` | Hồ sơ thành viên hoạt động hoặc ngưng |
| Tài khoản `TAI_KHOAN` | `ACTIVE`, `LOCKED`, `INACTIVE` | Đăng nhập được, bị khóa, hoặc không hoạt động |
| Loại sản phẩm | `ACTIVE`, `INACTIVE` | Đang/không kinh doanh |
| Sản phẩm | `ACTIVE`, `INACTIVE` | Đang/không kinh doanh |
| Khuyến mãi | `ACTIVE`, `INACTIVE` | Cho phép/không cho phép đánh giá áp dụng; vẫn phải đúng thời gian |
| Nhà cung cấp | `ACTIVE`, `INACTIVE` | Đang/ngưng hợp tác |
| Ca làm việc | `OPEN`, `CLOSED` | Đang bán hoặc đã đối chiếu/đóng |
| Phiếu nhập | `DRAFT`, `CONFIRMED`, `CANCELLED` | Đang sửa, đã nhập kho, đã hủy |
| Lô hàng | `ACTIVE`, `BLOCKED`, `EXPIRED` | Có thể dùng, bị chặn, hoặc hết hạn |
| Hóa đơn | `DRAFT`, `PAID`, `CANCELLED`, `REFUNDED` | Chưa hoàn tất, đã thanh toán, đã hủy, đã hoàn |
| Thanh toán | `SUCCESS`, `FAILED`, `REFUNDED` | Kết quả ghi nhận thanh toán/hoàn |
| Phiếu trả | `CREATED`, `COMPLETED`, `CANCELLED` | Mới tạo, hoàn tất, hoặc hủy |

### 11.2. Quy trình kiểm kê

Schema `KIEM_KE` dùng `DRAFT`, `APPROVED`, `CANCELLED`. Service suy ra trạng thái quy trình từ trạng thái schema và audit:

| Quy trình hiển thị | Ý nghĩa | Ai được thao tác tiếp |
|---|---|---|
| `DRAFT` | Đang kiểm kê/nhập số thực tế | `WAREHOUSE` |
| `PENDING_APPROVAL` | Đã gửi, chờ quản lý | `MANAGER` quyết định |
| `RECOUNT_REQUIRED` | Quản lý yêu cầu kiểm lại | `WAREHOUSE` sửa và gửi lại |
| `APPROVED` | Đã điều chỉnh tồn | Chỉ đọc |
| `CANCELLED` | Đã hủy | Chỉ đọc |

Không thêm trạng thái `COMPLETED` vào schema hiện hành.

### 11.3. Trạng thái cảnh báo hạn dùng

| Giá trị | Điều kiện khái quát |
|---|---|
| `VALID` | Còn hạn ngoài ngưỡng cảnh báo |
| `NEAR_EXPIRY` | Còn hạn trong ngưỡng, mặc định 30 ngày |
| `EXPIRED` | Hạn sử dụng nhỏ hơn hoặc bằng ngày hiện tại theo query |

### 11.4. Giá trị khác

- Hạng thành viên: `BRONZE`, `SILVER`, `GOLD`, `DIAMOND`.
- Loại giảm: `PERCENT`, `AMOUNT`.
- Phương thức thanh toán: `CASH`, `CARD`, `TRANSFER`, `EWALLET`.
- Tình trạng hàng trả: `RESALABLE`, `DAMAGED`.
- Giao dịch kho: `IMPORT`, `SALE`, `SALE_CANCEL`, `RETURN`, `ADJUSTMENT`.
- Giới tính nhân viên: `MALE`, `FEMALE`, `OTHER`.

---

## Chương 12. Xử lý lỗi thường gặp

### 12.1. Lỗi người dùng

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý an toàn |
|---|---|---|
| Không đăng nhập được | Sai định danh/mật khẩu | Kiểm tra bàn phím, thử tên đăng nhập/số điện thoại/email; không thử hàng loạt |
| `ACCOUNT_LOCKED` | Quản lý đã khóa account | Liên hệ quản lý, không tạo account thay thế tùy tiện |
| `ACCOUNT_INACTIVE` | Account hoặc owner không hoạt động | Quản lý kiểm tra đồng thời hồ sơ và tài khoản |
| Bị đưa về trang đăng nhập | Token hết hạn/không hợp lệ | Đăng nhập lại; nếu lặp, xóa session của đúng site rồi thử lại |
| Route bị chuyển hướng/`403` | Sai role | Dùng đúng tài khoản; không sửa URL để vượt quyền |
| Form báo validation | Thiếu trường, sai email/phone/date/range | Đọc lỗi theo trường, sửa dữ liệu rồi gửi lại |
| Danh sách trống | Bộ lọc quá hẹp hoặc chưa có dữ liệu | Xóa bộ lọc, kiểm tra kỳ ngày và trạng thái |
| Bảng rộng trên điện thoại | Nhiều cột | Cuộn ngang trong vùng bảng; không thu phóng trình duyệt quá mức |

### 12.2. Lỗi POS và ca

| Hiện tượng | Kiểm tra | Xử lý |
|---|---|---|
| POS báo chưa có ca | API current shift trả rỗng | Về `/cashier`, mở ca hợp lệ |
| Không mở được ca | Đã có ca `OPEN` | Dùng ca hiện tại; nếu là ca cũ, đối chiếu/đóng trước |
| Không thấy sản phẩm | Inactive, loại inactive, hết tồn bán được hoặc chỉ có lô hết hạn | Kiểm tra catalog/tồn/lô với quản lý hoặc kho |
| Quote thay đổi | Giá/tồn/promotion vừa đổi | Dùng quote mới nhất và thông báo khách |
| Checkout thiếu tồn | Giao dịch khác đã lấy tồn | Làm mới giỏ/quote, giảm số lượng hoặc bỏ dòng |
| Thanh toán gửi lại | Mạng chậm/timeout | Không tạo ID mới ngay; tra hóa đơn theo ID cũ trước để tránh nhầm lặp |
| Không đóng được ca | Còn hóa đơn `DRAFT` | Mở danh sách và hoàn tất/xử lý hóa đơn dở dang |
| Cảnh báo ca mang sang | Ca mở từ ngày nghiệp vụ trước | Xác minh chủ ca, đối chiếu và đóng; sau đó mở ca mới |

### 12.3. Lỗi nhập kho, tồn và kiểm kê

| Hiện tượng | Nguyên nhân | Xử lý |
|---|---|---|
| HSD không hợp lệ | HSD không sau NSX | Sửa ngày trên dòng phiếu |
| Trùng lô | Cùng sản phẩm/số lô vi phạm constraint | Đối chiếu lô thật; sửa số lô hoặc dùng dữ liệu đúng hiện có |
| Confirm phiếu bị từ chối | Không còn `DRAFT`, dòng rỗng/sai | Làm mới phiếu, không xác nhận lặp |
| Tồn không đổi sau lưu draft | Đúng thiết kế | Chỉ confirm mới tăng tồn |
| Không tạo được kiểm kê | Có draft khác hoặc chưa có lô | Hoàn tất/hủy đợt cũ hoặc nhập lô trước |
| Không gửi đề nghị | Không có chênh lệch hoặc thiếu lý do | Nhập actual đúng và bổ sung lý do cho mọi dòng lệch |
| Approve bị báo snapshot cũ | Tồn đã thay đổi sau snapshot | Quản lý không ép duyệt; yêu cầu kiểm lại/tạo quy trình phù hợp |

### 12.4. Lỗi backend/database

| Dấu hiệu | Chẩn đoán | Hành động |
|---|---|---|
| `/api/health` không `200` | Process backend không sống | Xem log runtime không chứa secret, kiểm tra `PORT`, restart có kiểm soát |
| `/api/health` tốt nhưng `/api/health/db` lỗi | SQL Server/readiness lỗi | Kiểm tra mạng, firewall, tên DB, credential/TLS và pool |
| CORS trên trình duyệt | Origin frontend chưa nằm trong danh sách | Sửa `CORS_ALLOWED_ORIGINS` thành origin chính xác, redeploy backend |
| `PAYLOAD_TOO_LARGE` | Body vượt `REQUEST_BODY_LIMIT` | Giảm payload; chỉ tăng limit sau đánh giá |
| `INVALID_JSON` | Request JSON hỏng | Sửa client/request; không retry nguyên request lỗi |
| `INTERNAL_SERVER_ERROR` | Lỗi bất ngờ đã được che | Dùng request ID/thời gian/route để tra log; không bật lộ stack ở production |
| Pool timeout | SQL chậm hoặc quá tải | Kiểm tra connection, query plan, lock và chỉ số; không tăng pool tùy tiện |

### 12.5. Lỗi migration

| Mã/tình huống | Ý nghĩa | Cách xử lý |
|---|---|---|
| `ALLOW_DB_MIGRATIONS` chưa bật | Cổng an toàn đang chặn | Chỉ bật trong terminal/release job thực thi migration |
| `APPLIED_MIGRATION_MODIFIED` | File đã apply bị thay đổi checksum | Khôi phục file đúng lịch sử; tạo migration mới, không sửa metadata/bypass |
| Có migration pending thấp hơn bản đã apply | Lịch sử out-of-order | Dừng release và review lịch sử/source |
| Không lấy được application lock | Có runner khác hoặc timeout | Xác minh job đang chạy, chờ/kết thúc đúng cách; không chạy song song |
| Migration SQL lỗi | Migration hiện tại đã rollback | Sửa bằng file mới/review trước khi chạy lại; kiểm tra metadata không bị ghi dở |

### 12.6. Thông tin cần thu thập khi báo sự cố

- môi trường và thời gian theo múi giờ;
- role, route, thao tác và mã đối tượng;
- mã HTTP và `error.code`;
- ảnh chụp đã che dữ liệu nhạy cảm;
- kết quả health/readiness;
- commit/release đang chạy;
- trạng thái migration (`APPLIED`/`PENDING`).

Không gửi `.env`, DB password, JWT, Authorization header, ảnh mật khẩu hoặc file backup qua ticket thông thường.

---

## Chương 13. Khởi động hệ thống khi bàn giao

### 13.1. Yêu cầu máy

- Node.js 20 trở lên;
- Microsoft SQL Server 2016 trở lên;
- `npm` đi kèm Node.js;
- `sqlcmd` cho init/test backup-restore;
- Git và PowerShell trên Windows nếu dùng các lệnh ví dụ;
- quyền tạo database ở môi trường local/test.

### 13.2. Lấy source và cài dependency

```powershell
git clone <repository-url>
Set-Location convenience-store-management-system

Set-Location backend
npm install
Copy-Item .env.example .env

Set-Location ..\frontend
npm install
Copy-Item .env.example .env
```

Không commit hai file `.env`. Điền giá trị qua kênh bàn giao bí mật.

### 13.3. Dựng database local/test từ rỗng

Tạo database nếu chưa có:

```powershell
Set-Location database
sqlcmd -S "localhost" -E -C -i ".\create_database.sql"
```

Với SQL Server Express có thể dùng `-S ".\SQLEXPRESS"`.

Sau khi kiểm tra chính xác server và tên database local/test:

```powershell
sqlcmd -S ".\SQLEXPRESS" -E -C -I -d "ConvenienceStore" -b -f 65001 -i ".\init.sql"
```

> **CẢNH BÁO:** `database/init.sql` xóa/dựng lại 23 bảng core, reset migration history và nạp development seed. Chỉ dùng cho development/test. Không chạy trên production hoặc database cần giữ dữ liệu.

Ghi nhận/apply migrations hiện hành:

```powershell
Set-Location ..\backend
npm run db:migrate:status
$env:ALLOW_DB_MIGRATIONS='true'
npm run db:migrate
Remove-Item Env:ALLOW_DB_MIGRATIONS
npm run db:migrate:status
```

### 13.4. Cấu hình backend local

Các nhóm biến bắt buộc trong `backend/.env`:

- runtime: `NODE_ENV`, `PORT`;
- CORS/security: `CORS_ALLOWED_ORIGINS`, `REQUEST_BODY_LIMIT`, `TRUST_PROXY`;
- SQL Server: driver, server/instance/port/name/user/password/trusted/encrypt/certificate;
- pool: max/min/idle timeout;
- JWT/bcrypt: `JWT_SECRET`, `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS`;
- migration: giữ `ALLOW_DB_MIGRATIONS=false` cho web process.

Local Windows Authentication thường dùng `DB_DRIVER=msnodesqlv8` và `DB_TRUSTED_CONNECTION=true`. SQL Authentication dùng `tedious`, `DB_USER`, `DB_PASSWORD`.

### 13.5. Cấu hình frontend local

`frontend/.env`:

```dotenv
VITE_API_BASE_URL=/api
DEV_API_PROXY_TARGET=http://127.0.0.1:3000
```

Có thể đặt `VITE_API_BASE_URL=http://localhost:3000/api` khi không dùng proxy. Biến bắt đầu `VITE_` được đưa vào bundle trình duyệt, vì vậy tuyệt đối không đặt secret trong đó.

### 13.6. Thứ tự khởi động

Terminal 1:

```powershell
Set-Location backend
npm run dev
```

Kiểm tra:

```powershell
Invoke-WebRequest http://127.0.0.1:3000/api/health
Invoke-WebRequest http://127.0.0.1:3000/api/health/db
```

Terminal 2:

```powershell
Set-Location frontend
npm run dev
```

Mở URL Vite hiển thị trong terminal. Seed không cung cấp credential dùng chung; tạo tài khoản test riêng theo quy trình demo và không ghi password vào repository.

### 13.7. Kiểm tra trước bàn giao

Backend:

```powershell
npm test
npm run test:security
```

Frontend:

```powershell
npm test
npm run build
npm run preview
npm run test:routes
```

Database test chỉ chạy trên DB test riêng theo `database/README.md`; không bật `RUN_DB_INTEGRATION_TESTS=true` khi cấu hình đang trỏ production.

---

## Chương 14. Vận hành production

### 14.1. Nguyên tắc cấu hình

- đặt `NODE_ENV=production`;
- `JWT_SECRET` ngẫu nhiên tối thiểu 32 byte, không dùng giá trị mẫu;
- `CORS_ALLOWED_ORIGINS` là danh sách origin frontend chính xác, không wildcard;
- chỉ đặt `TRUST_PROXY=true` sau reverse proxy được kiểm soát;
- giới hạn request bằng `REQUEST_BODY_LIMIT` phù hợp;
- không log request body nhạy cảm, Authorization, password, token hoặc raw SQL error;
- TLS được kết thúc tại hạ tầng/reverse proxy;
- web process luôn giữ `ALLOW_DB_MIGRATIONS=false`.

### 14.2. Kết nối Azure SQL

Production migration/backend dùng cấu hình an toàn:

- `DB_DRIVER=tedious`;
- `DB_TRUSTED_CONNECTION=false`;
- SQL Authentication qua TCP;
- `DB_PORT=1433`;
- `DB_INSTANCE` để trống;
- `DB_ENCRYPT=true`;
- `DB_TRUST_SERVER_CERTIFICATE=false`.

Không ghi credential vào command, source, tài liệu, screenshot hoặc log. Quản lý secret bằng hệ thống biến môi trường của nền tảng triển khai.

### 14.3. Bootstrap database production mới

Chỉ với Azure SQL database hoàn toàn mới, không có bảng `dbo`:

```powershell
Set-Location database
sqlcmd -S "<server>.database.windows.net" -d "ConvenienceStore" `
  -G -N -I -b -f 65001 -i ".\init.production.sql"
```

Script chỉ seed bốn role và từ chối database đã có bảng `dbo`; không có development seed. Sau đó, từ `backend/`, chạy migration runner để ghi baseline/apply migrations.

Không chạy lại `init.production.sql` trên production đã có dữ liệu. Không bao giờ chạy `init.sql` trên production.

### 14.4. Release database hiện hữu

1. Xác nhận backup/point-in-time restore policy và bản restore test gần nhất.
2. Chạy `npm run db:migrate:status` với cấu hình production.
3. Review toàn bộ `PENDING`, checksum và release commit.
4. Bảo đảm chỉ một release job chạy migration.
5. Bật tạm `ALLOW_DB_MIGRATIONS=true` trong job đó.
6. Chạy `npm run db:migrate`.
7. Tắt/xóa cờ khỏi môi trường job.
8. Chạy lại status; tất cả file hiện hành phải `APPLIED`.
9. Kiểm tra `/api/health` và `/api/health/db`.
10. Smoke public catalog, đăng nhập và một route theo role trước khi chuyển traffic đầy đủ.

Mỗi migration có checksum SHA-256, application lock và transaction riêng. Không sửa, đổi tên hoặc xóa migration đã apply. Không chạy down script tự động; dùng forward migration đã review hoặc point-in-time restore/backup khi cần.

### 14.5. Giám sát hằng ngày

- liveness `/api/health`;
- readiness `/api/health/db`;
- tỷ lệ lỗi 4xx/5xx theo route, không log payload bí mật;
- latency API và pool SQL;
- dung lượng database/log và chính sách backup;
- tài khoản `LOCKED`/`INACTIVE` bất thường;
- ca `OPEN` mang sang ngày mới;
- lô hết hạn/cận hạn và tồn thấp;
- migration status sau release;
- lỗi audit/transaction hoặc lock kéo dài.

### 14.6. Ứng phó sự cố

1. Khoanh vùng frontend, backend hay database bằng health/readiness.
2. Nếu migration đang chạy, không khởi chạy runner thứ hai.
3. Nếu dữ liệu nghiệp vụ nghi ngờ sai, tạm dừng thao tác liên quan; không sửa trực tiếp bảng production.
4. Lưu thời gian, release, request ID và mã bản ghi.
5. Khôi phục traffic/release theo runbook nền tảng.
6. Với migration đã commit, quyết định forward migration hoặc restore đã thử; không sửa tay `SCHEMA_MIGRATIONS`.
7. Sau phục hồi, kiểm tra transaction, audit, đối chiếu ca/tồn và các health endpoint.

---

## Chương 15. Deployment hiện tại

### 15.1. Sơ đồ

```text
Trình duyệt
    -> Frontend React/Vite trên Vercel
        -> REST API Node.js/Express trên Render
            -> Microsoft Azure SQL
```

Repository cấu hình header và SPA rewrite ở `frontend/vercel.json`. CSP hiện cho phép `connect-src` đến `https://convenience-store-api-5bjd.onrender.com`, đây là endpoint backend Render được source frontend khai báo. URL frontend Vercel cụ thể không được hardcode trong tài liệu/source đã đọc; lấy từ dashboard môi trường bàn giao.

### 15.2. Vercel frontend

- Build command theo project frontend: `npm run build`.
- Output Vite: `dist`.
- Cấu hình `VITE_API_BASE_URL` phải trỏ đúng `/api` backend production trước build.
- `vercel.json` rewrite mọi route về `index.html` để deep-route React hoạt động.
- Các security header gồm CSP, HSTS và các header bảo vệ trình duyệt theo file hiện hành.
- Khi đổi backend domain, cập nhật đồng thời API base URL và `connect-src` CSP rồi chạy test/build.

### 15.3. Render backend

- Runtime Node.js 20+.
- Start command: `npm start` trong `backend` theo cấu hình service thực tế.
- Khai báo env production tại nền tảng, không upload `.env`.
- Cho phép CORS đúng origin Vercel.
- `TRUST_PROXY` chỉ bật theo topology Render/reverse proxy đã xác minh.
- Health check dùng `/api/health`; readiness DB dùng `/api/health/db`.
- Migration là release command/job riêng, không gắn tự động vào mọi web instance start.

### 15.4. Azure SQL

- Chỉ mở firewall/network cho nguồn cần thiết.
- Dùng kết nối mã hóa và certificate hợp lệ.
- Tài khoản ứng dụng chỉ có quyền cần thiết; tài khoản migration/backup có thể tách riêng.
- Theo dõi point-in-time retention, dung lượng, DTU/vCore và failed connection.
- Full `BACKUP DATABASE` trong script local/SQL Server không đồng nghĩa runbook Azure SQL; production Azure ưu tiên cơ chế backup/PITR của dịch vụ và phải thử restore sang database khác.

### 15.5. Smoke sau deploy

1. Mở public `/products` và `/promotions`.
2. Gọi liveness/readiness.
3. Đăng nhập một tài khoản test cho từng role.
4. Refresh route sâu.
5. Kiểm tra menu đúng role và API trái quyền trả 403.
6. Chạy một luồng đọc không phá dữ liệu; với luồng ghi, dùng dữ liệu test đã duyệt.
7. Kiểm tra log không lộ stack/SQL/secret.
8. Kiểm tra migration status không còn pending ngoài kế hoạch.

---

## Chương 16. Backup và restore

### 16.1. Mục tiêu

Backup chỉ có giá trị khi có thể restore và kiểm tra. Chính sách vận hành phải xác định riêng:

- người chịu trách nhiệm;
- tần suất và thời gian lưu;
- RPO/RTO được chấp nhận;
- nơi lưu mã hóa, phân quyền và bản sao ngoài hệ thống chính;
- lịch thử restore sang database khác;
- quy trình phê duyệt xóa backup.

Repository không chứa file `.bak` hoặc credential.

### 16.2. Script smoke backup/restore của repository

`database/maintenance/backup_restore_test.sql` thực hiện:

1. `BACKUP DATABASE ... WITH COPY_ONLY, CHECKSUM`;
2. `RESTORE VERIFYONLY`;
3. restore sang database test khác tên và chưa tồn tại;
4. `DBCC CHECKDB` trên bản restore;
5. xác minh 23 bảng core, bốn role, seed development và constraint FK/CHECK enabled/trusted.

Script từ chối database hệ thống, từ chối source và target cùng tên, và không ghi đè database đã tồn tại.

Ví dụ cho SQL Server local/test:

```powershell
Set-Location database
sqlcmd -S ".\SQLEXPRESS" -E -C -I -d "master" -b -f 65001 `
  -v SourceDatabase="ConvenienceStoreTest" RestoreDatabase="ConvenienceStoreRestoreTest" `
  -i ".\maintenance\backup_restore_test.sql"
```

Chọn source test và một target test chưa tồn tại. Mặc định `.bak` vào `InstanceDefaultBackupPath`; nếu truyền đường dẫn khác, SQL Server service account phải có quyền. Sau khi xác minh và ghi nhận kết quả, xóa database restore test/file backup theo chính sách môi trường; không đưa `.bak` vào Git.

### 16.3. Quy trình restore an toàn

1. Không restore đè database nguồn.
2. Xác minh đúng server, tenant/subscription, database và thời điểm backup.
3. Tạo database đích mới có hậu tố rõ như `_RestoreTest`.
4. Hạn chế người truy cập database đích.
5. Restore/point-in-time restore.
6. Chạy kiểm tra toàn vẹn và kiểm tra 23 bảng/object quan trọng.
7. Kiểm tra số lượng bản ghi và mẫu giao dịch nhập/bán/trả/kiểm kê.
8. Chạy backend readiness bằng cấu hình tạm chỉ trỏ database restore khi được phép.
9. Ghi biên bản thời gian, người thực hiện, source, target, kết quả và cleanup.
10. Chỉ quyết định failover/khôi phục production sau phê duyệt của chủ hệ thống.

### 16.4. Azure SQL

Azure SQL dùng backup tự động/point-in-time restore của dịch vụ thay vì dựa vào lệnh full backup local. Thực hiện restore sang database Azure SQL khác, không ghi đè database đang phục vụ. Sau restore:

- kiểm tra schema/migration history;
- kiểm tra timezone và dữ liệu kỳ gần nhất;
- chạy DB health/readiness;
- kiểm tra quyền đăng nhập ứng dụng;
- đối chiếu audit, hóa đơn, tồn lô và ca;
- xóa database thử khi hết thời hạn lưu.

### 16.5. Lịch diễn tập đề xuất

- kiểm tra trạng thái backup/PITR hằng ngày;
- kiểm tra cảnh báo dung lượng hằng tuần;
- restore thử tối thiểu theo chu kỳ do chủ hệ thống phê duyệt;
- restore thử trước thay đổi schema rủi ro cao;
- lưu bằng chứng kết quả, không lưu secret.

Đây là đề xuất vận hành; RPO/RTO và tần suất chính thức phải do đơn vị tiếp nhận chốt.

---

## Chương 17. Bàn giao hệ thống

### 17.1. Gói bàn giao

- repository và commit/release được duyệt;
- tài liệu này cùng các README theo lớp;
- sơ đồ môi trường Vercel/Render/Azure SQL;
- danh sách owner và quyền truy cập nền tảng;
- danh sách biến môi trường, nhưng giá trị secret truyền riêng;
- chính sách backup/PITR và bằng chứng restore gần nhất;
- migration status và danh sách migration đã apply;
- kết quả test/build/smoke của release;
- danh sách tài khoản test/demo, mật khẩu gửi qua secret manager;
- danh sách giới hạn, quyết định chưa chốt và backlog.

### 17.2. Checklist kỹ thuật trước bàn giao

- [ ] Nhánh/release chính xác, working tree sạch hoặc thay đổi đã được giải thích.
- [ ] Node.js và SQL Server đúng phiên bản yêu cầu.
- [ ] Backend/frontend cài dependency từ lockfile.
- [ ] `.env` không được track; `.env.example` đủ biến và không có secret.
- [ ] `JWT_SECRET` production đã thay, tối thiểu 32 byte.
- [ ] CORS chỉ chứa origin hợp lệ.
- [ ] TLS/DB encryption đúng production.
- [ ] `ALLOW_DB_MIGRATIONS=false` ở web service.
- [ ] Migration status đã review, không checksum mismatch.
- [ ] `/api/health` và `/api/health/db` đạt.
- [ ] Frontend production build đạt và deep-route hoạt động.
- [ ] Backup/PITR và restore sang database khác đã thử.
- [ ] Log không lộ secret/stack/SQL internals.
- [ ] CSP cho phép đúng backend và không mở rộng quá mức.
- [ ] Monitoring/alert và người trực được cấu hình.

### 17.3. Checklist nghiệp vụ bốn role

- [ ] Public xem được sản phẩm/khuyến mãi active.
- [ ] `CUSTOMER` đăng ký, đăng nhập, xem lịch sử của chính mình, sửa hồ sơ.
- [ ] `CASHIER` mở ca, tìm hàng, quote, checkout, in hóa đơn, return và đóng ca.
- [ ] `WAREHOUSE` tạo/confirm phiếu nhập, xem tồn/lô, tạo/gửi kiểm kê.
- [ ] `MANAGER` quản lý catalog/promotion/supplier/employee/account/customer.
- [ ] `MANAGER` duyệt/từ chối kiểm kê, xem audit và báo cáo.
- [ ] API sai role trả `403`; customer ownership được giữ.
- [ ] Không có dữ liệu mock trong luồng chính.
- [ ] Loading/error/empty và double-submit đã smoke.
- [ ] Responsive đã kiểm tra trên laptop, tablet và điện thoại.

### 17.4. Thay đổi quyền sở hữu

Khi chuyển người quản trị:

1. thêm tài khoản cá nhân mới trên Git hosting, Vercel, Render và Azure;
2. kiểm tra quyền tối thiểu;
3. chuyển ownership/billing theo quy trình nền tảng;
4. rotate JWT secret, DB credential và token triển khai nếu có rủi ro lộ;
5. thu hồi tài khoản người rời dự án;
6. kiểm tra audit nền tảng;
7. không chia sẻ một tài khoản quản trị chung.

### 17.5. Biên bản nghiệm thu

Biên bản nên ghi release/commit, ngày giờ, môi trường, phiên bản schema, kết quả 4-role smoke, health/readiness, backup/restore, danh sách deviation và người chấp thuận. Không đính kèm secret hoặc dữ liệu khách hàng thật.

---

## Chương 18. Bảng tra cứu nhanh

### 18.1. Route frontend

| Nhu cầu | Route | Quyền |
|---|---|---|
| Trang công khai | `/`, `/public` | Công khai |
| Sản phẩm | `/products` | Công khai |
| Khuyến mãi | `/promotions` | Công khai |
| Đăng nhập | `/auth/login` | Công khai |
| Đăng ký khách hàng | `/auth/register` | Công khai |
| Đổi mật khẩu | `/account/change-password` | Đã đăng nhập |
| Tổng quan khách hàng | `/customer` | `CUSTOMER` |
| Lịch sử mua hàng | `/customer/history` | `CUSTOMER` |
| Hồ sơ khách hàng | `/customer/profile` | `CUSTOMER` |
| Dashboard/mở đóng ca | `/cashier` | `CASHIER` |
| POS | `/cashier/pos` | `CASHIER` |
| Hóa đơn đã lưu | `/cashier/receipts/:invoiceId` | `CASHIER` |
| Tra hóa đơn | `/cashier/invoices` | `CASHIER` |
| Tìm hóa đơn để trả | `/cashier/returns` | `CASHIER` |
| Xử lý trả | `/cashier/returns/:invoiceId` | `CASHIER` |
| Dashboard kho | `/warehouse` | `WAREHOUSE` |
| Phiếu nhập | `/warehouse/receiving` | `WAREHOUSE` |
| Tạo phiếu nhập | `/warehouse/receiving/new` | `WAREHOUSE` |
| Sửa draft nhập | `/warehouse/receiving/:receiptId/edit` | `WAREHOUSE` |
| Tồn kho | `/warehouse/inventory` | `WAREHOUSE` |
| Kiểm kê | `/warehouse/stocktakes` | `WAREHOUSE` |
| Dashboard quản lý | `/manager` | `MANAGER` |
| Nhân viên | `/manager/employees` | `MANAGER` |
| Tài khoản | `/manager/accounts` | `MANAGER` |
| Khách hàng | `/manager/customers` | `MANAGER` |
| Sản phẩm | `/manager/products` | `MANAGER` |
| Giá bán | `/manager/products/pricing` | `MANAGER` |
| Khuyến mãi | `/manager/promotions` | `MANAGER` |
| Nhà cung cấp | `/manager/suppliers` | `MANAGER` |
| Tồn kho | `/manager/inventory` | `MANAGER` |
| Duyệt kiểm kê | `/manager/stocktakes` | `MANAGER` |
| Hóa đơn | `/manager/invoices` | `MANAGER` |
| Audit | `/manager/audit-logs` | `MANAGER` |
| Báo cáo | `/manager/reports` | `MANAGER` |
| Doanh thu | `/manager/reports/revenue` | `MANAGER` |
| Hàng hóa | `/manager/reports/merchandise` | `MANAGER` |
| Nhân sự/ca | `/manager/reports/workforce` | `MANAGER` |

### 18.2. API health và lệnh vận hành

| Mục tiêu | Lệnh/đường dẫn |
|---|---|
| Backend liveness | `GET /api/health` |
| Database readiness | `GET /api/health/db` |
| Chạy backend dev | `cd backend; npm run dev` |
| Chạy backend thường | `cd backend; npm start` |
| Test backend | `cd backend; npm test` |
| Security smoke | `cd backend; npm run test:security` |
| Migration status | `cd backend; npm run db:migrate:status` |
| Apply migration | bật cờ tạm rồi `npm run db:migrate` |
| Chạy frontend dev | `cd frontend; npm run dev` |
| Test frontend | `cd frontend; npm test` |
| Build frontend | `cd frontend; npm run build` |
| Preview frontend | `cd frontend; npm run preview` |
| Smoke deep-route | `cd frontend; npm run test:routes` |

### 18.3. Ai xử lý việc gì

| Tình huống | Người xử lý đầu tiên |
|---|---|
| Sai giá/khuyến mãi | `MANAGER` kiểm tra cấu hình; kỹ thuật kiểm tra API nếu cần |
| Hàng không bán được | `WAREHOUSE`/`MANAGER` kiểm tra lô, hạn, trạng thái và tồn |
| Ca mang sang | Thu ngân sở hữu ca đối chiếu/đóng; quản lý giám sát |
| Tài khoản bị khóa | `MANAGER` xác minh và mở khóa |
| Phiếu nhập sai trước confirm | `WAREHOUSE` sửa draft |
| Phiếu đã confirm nghi sai | Dừng sửa tay; quản lý/kỹ thuật điều tra audit và transaction |
| Chênh lệch kiểm kê | `WAREHOUSE` nêu lý do; `MANAGER` duyệt/từ chối |
| API/DB không sẵn sàng | Người vận hành kỹ thuật |
| Migration/checksum lỗi | Người phụ trách database/release |

---

## Chương 19. Giới hạn hệ thống và lưu ý đã biết

1. Hệ thống thiết kế cho một cửa hàng/một kho tại cửa hàng; chưa có multi-branch/multi-warehouse.
2. Không có role `ADMIN`; role cao nhất hiện hành là `MANAGER`.
3. Không có quên mật khẩu tự phục vụ.
4. Reset mật khẩu nhân viên chưa có cờ bắt đổi ở lần đăng nhập kế tiếp.
5. Tiêu điểm chưa triển khai vì tỷ lệ/chính sách chưa chốt; chỉ có tích điểm theo source hiện hành.
6. Hóa đơn từng dùng điểm bị chặn return để tránh xung đột chưa có quy tắc.
7. Không có ngưỡng “vượt quyền thu ngân” để manager approve return.
8. API return hiện không nhận phương thức hoàn tiền riêng.
9. `CARD`, `TRANSFER`, `EWALLET` là ghi nhận/mô phỏng; không tích hợp gateway thật.
10. Promotion không có stacking hoặc tự chọn tốt nhất; thu ngân chọn một chương trình và server đánh giá.
11. Không có bảng lịch sử giá riêng; lịch sử lấy từ audit.
12. Không có bảng đơn vị tính; `DonViTinh` nằm trên sản phẩm.
13. Không có endpoint/UI set stock trực tiếp; thay đổi tồn qua transaction nghiệp vụ.
14. Lợi nhuận chưa hiển thị vì công thức chưa được chốt.
15. Nút “Xuất Excel” báo cáo doanh thu tạo CSV; PDF dùng chức năng in của trình duyệt.
16. Ca mang sang ngày khác chỉ được cảnh báo, không tự động đóng.
17. Ảnh sản phẩm lưu bằng URL, không có upload/hosting ảnh nhị phân trong hệ thống.
18. Full backup script phù hợp SQL Server local/test; Azure SQL production cần runbook PITR của dịch vụ.
19. URL frontend production cụ thể và credential không được lưu trong repository, phải bàn giao riêng.
20. Dữ liệu lịch sử trước migration timezone không được rewrite; cần hiểu theo contract UTC hiện hành khi đối soát.
21. Giao diện report có dữ liệu thật nhưng không thay thế hệ thống kế toán/tài chính được chứng nhận.
22. Ảnh mockup trong báo cáo không phản ánh chắc chắn UI hiện tại; luôn kiểm tra bản deploy/source.

---

## Chương 20. Phụ lục

### Phụ lục A. Đối chiếu F01–F35

| Mã | Chức năng | Vai trò chính | Màn hình/route hiện hành |
|---|---|---|---|
| F01 | Đăng ký tài khoản khách hàng | Công khai | MH-02 `/auth/register` |
| F02 | Đăng nhập | Tất cả | MH-01 `/auth/login` |
| F03 | Cập nhật hồ sơ khách hàng | `CUSTOMER` | MH-28 `/customer/profile` |
| F04 | Đổi mật khẩu | Đã đăng nhập | MH-03 `/account/change-password` |
| F05 | Xem sản phẩm | Công khai/khách hàng | MH-26 `/products` |
| F06 | Xem khuyến mãi | Công khai/khách hàng | MH-26 `/promotions` |
| F07 | Xem hóa đơn/lịch sử mua | `CUSTOMER` | MH-27 `/customer/history` |
| F08 | Xem điểm tích lũy | `CUSTOMER` | MH-27, điểm chỉ đọc |
| F09 | Mở ca | `CASHIER` | MH-05 `/cashier` |
| F10 | Quét/tìm sản phẩm | `CASHIER` | MH-06 `/cashier/pos` |
| F11 | Lập hóa đơn | `CASHIER` | MH-06/MH-07 |
| F12 | Tính tiền | `CASHIER` | Quote server-side MH-06/MH-07 |
| F13 | Áp dụng khuyến mãi | `CASHIER` | Quote/evaluation MH-06/MH-07 |
| F14 | Ghi nhận thanh toán | `CASHIER` | MH-07 checkout |
| F15 | In/xem hóa đơn | `CASHIER` | `/cashier/receipts/:invoiceId` |
| F16 | Tra cứu hóa đơn | `CASHIER`, `MANAGER` | MH-08 `/cashier/invoices`, `/manager/invoices` |
| F17 | Xử lý đổi/trả | `CASHIER` | MH-09 `/cashier/returns/*` |
| F18 | Đóng ca/đối chiếu | `CASHIER` | MH-05 `/cashier` |
| F19 | Quản lý nhà cung cấp | `MANAGER` | MH-10 `/manager/suppliers` |
| F20 | Lập phiếu nhập | `WAREHOUSE` | MH-11 `/warehouse/receiving/new` |
| F21 | Xác nhận nhập kho | `WAREHOUSE` | MH-12 `/warehouse/receiving` |
| F22 | Tra cứu tồn kho | `WAREHOUSE`, `MANAGER` | MH-13 inventory routes |
| F23 | Theo dõi lô/HSD | `WAREHOUSE`, `MANAGER` | MH-13 drill-down lô |
| F24 | Cảnh báo tồn thấp/hạn | `WAREHOUSE`, `MANAGER` | MH-04/MH-13 |
| F25 | Tạo đợt kiểm kê | `WAREHOUSE` | MH-14 `/warehouse/stocktakes` |
| F26 | Ghi số lượng thực tế | `WAREHOUSE` | MH-14 |
| F27 | Lập đề nghị điều chỉnh | `WAREHOUSE` | MH-14 |
| F28 | Quản lý sản phẩm | `MANAGER` | MH-16 `/manager/products` |
| F29 | Cập nhật giá bán | `MANAGER` | MH-17 `/manager/products/pricing` |
| F30 | Quản lý khuyến mãi | `MANAGER` | MH-18 `/manager/promotions` |
| F31 | Quản lý nhân viên | `MANAGER` | MH-19 `/manager/employees` |
| F32 | Quản lý tài khoản/role | `MANAGER` | MH-20 `/manager/accounts`; hỗ trợ MH-21 |
| F33 | Duyệt điều chỉnh kho | `MANAGER` | MH-15 `/manager/stocktakes` |
| F34 | Tra cứu nhật ký | `MANAGER` | MH-22 `/manager/audit-logs` |
| F35 | Xem báo cáo kinh doanh | `MANAGER` | MH-23–25 `/manager/reports/*` |

### Phụ lục B. Đối chiếu MH-01–MH-28

| Mã | Tên màn hình | Implementation hiện hành |
|---|---|---|
| MH-01 | Đăng nhập | `/auth/login` |
| MH-02 | Đăng ký khách hàng | `/auth/register` |
| MH-03 | Đổi mật khẩu | `/account/change-password` |
| MH-04 | Dashboard theo role | `/cashier`, `/warehouse`, `/manager`; khách hàng dùng portal riêng |
| MH-05 | Mở/đóng ca | `/cashier` |
| MH-06 | POS | `/cashier/pos` |
| MH-07 | Thanh toán/in hóa đơn | Checkout tại POS và `/cashier/receipts/:invoiceId` |
| MH-08 | Tra cứu hóa đơn | `/cashier/invoices`, `/manager/invoices` |
| MH-09 | Đổi/trả | `/cashier/returns/:invoiceId` |
| MH-10 | Nhà cung cấp | `/manager/suppliers` |
| MH-11 | Lập phiếu nhập | `/warehouse/receiving/new`, route edit draft |
| MH-12 | Xác nhận nhập | `/warehouse/receiving` |
| MH-13 | Tồn/lô/cảnh báo | Inventory routes warehouse/manager |
| MH-14 | Kiểm kê | `/warehouse/stocktakes` |
| MH-15 | Duyệt điều chỉnh | `/manager/stocktakes` |
| MH-16 | Danh mục/sản phẩm | `/manager/products` |
| MH-17 | Giá/lịch sử giá | `/manager/products/pricing` |
| MH-18 | Khuyến mãi | `/manager/promotions` |
| MH-19 | Nhân viên | `/manager/employees` |
| MH-20 | Tài khoản/role | `/manager/accounts` |
| MH-21 | Khách hàng thành viên | `/manager/customers` |
| MH-22 | Audit | `/manager/audit-logs` |
| MH-23 | Báo cáo doanh thu | `/manager/reports/revenue` |
| MH-24 | Báo cáo hàng hóa/nhập/tồn | `/manager/reports/merchandise` |
| MH-25 | Báo cáo nhân viên/ca | `/manager/reports/workforce` |
| MH-26 | Cổng sản phẩm/ưu đãi | `/products`, `/promotions` |
| MH-27 | Lịch sử/điểm | `/customer/history` |
| MH-28 | Hồ sơ khách hàng | `/customer/profile` |

### Phụ lục C. Nguồn đã đọc

Các nguồn chính được dùng để lập tài liệu:

- `README.md`;
- `frontend/README.md`, route, layout, trang, component, service và test liên quan;
- `backend/README.md`, `.env.example`, app/routes, middleware, validation, service, repository và test;
- `database/README.md`, `database/migrations/README.md`;
- schema, constraints, view, procedure, migration, test và `maintenance/backup_restore_test.sql`;
- báo cáo chi tiết: Chương 2 (hiện trạng/yêu cầu), Chương 3 (tác nhân và F01–F35), Chương 4 (schema cần đối chiếu) và Chương 5 (phân quyền, MH-01–MH-28);
- tài liệu phân chia công việc để đối chiếu phạm vi.

### Phụ lục D. Khác biệt giữa báo cáo và source hiện hành

| Chủ đề | Báo cáo/mô tả thiết kế | Source hiện hành được tài liệu ưu tiên |
|---|---|---|
| Hóa đơn hoàn tất | Một số mô tả dùng `COMPLETED` | Schema/API dùng `PAID`; có `DRAFT`, `CANCELLED`, `REFUNDED` |
| Kiểm kê | Mô tả `IN_PROGRESS`/`COMPLETED` | Schema dùng `DRAFT`/`APPROVED`/`CANCELLED`; service suy ra trạng thái quy trình |
| Loại điều chỉnh | Mô tả `ADJUST_UP`/`ADJUST_DOWN` | Dùng `ADJUSTMENT`, tăng/giảm bằng dấu `SoLuongBienDong` |
| Tiêu điểm | Màn POS/bán hàng đề cập tích/tiêu | Chỉ tích điểm; tiêu điểm bị loại vì policy chưa chốt |
| Reset mật khẩu | Mô tả chuỗi mặc định và bắt đổi lần sau | API reset bằng mật khẩu được cung cấp/hash; schema không có cờ bắt đổi |
| Approval return | Báo cáo nói trường hợp vượt quyền cần quản lý | Chưa có điều kiện/ngưỡng; luồng hiện tại không phụ thuộc approval |
| Refund method | Giao diện thiết kế có thể gợi ý lựa chọn | API/schema return hiện không có trường chọn phương thức hoàn |
| Thanh toán điện tử | Mô tả thẻ/chuyển khoản/QR/ví | Chỉ ghi nhận/mô phỏng; không gateway thật |
| Lợi nhuận | MH-23 đề cập lợi nhuận ước tính | Không hiển thị vì chưa có công thức được duyệt |
| Xuất Excel | Nhãn thao tác “Xuất Excel” | Implementation tải CSV; PDF là print-to-PDF trình duyệt |
| Giao diện | Hình Chương 5 là mockup/minh họa | UI React trong source/deploy là hiện trạng |

### Phụ lục E. Kế hoạch ảnh chụp

Tài liệu hiện không nhúng ảnh chụp vì phiên biên soạn không có bộ screenshot môi trường đã được duyệt và làm sạch dữ liệu. Có 12 placeholder đã đánh số trong các chương 3, 5, 6, 7 và 8. Khi bổ sung:

1. chỉ chụp UI của commit/release đang bàn giao;
2. dùng dữ liệu test, không dùng dữ liệu khách hàng thật;
3. che username, số điện thoại, email, IP, token và số tiền nhạy cảm nếu không cần;
4. không dùng hình/mockup lấy từ file báo cáo để đại diện UI hiện tại;
5. ghi caption gồm route, role và release;
6. kiểm tra ảnh không làm lộ thanh địa chỉ chứa token/query nhạy cảm.

### Phụ lục F. Mẫu checklist smoke bốn role

#### Công khai/khách hàng

- [ ] `/products` tìm, lọc, phân trang, mở chi tiết ảnh/ảnh thay thế.
- [ ] `/promotions` chỉ hiển thị ưu đãi hiện hành.
- [ ] Đăng ký hợp lệ và các lỗi số điện thoại/email/mật khẩu.
- [ ] Đăng nhập, đăng xuất và làm mới đường dẫn sâu.
- [ ] Lịch sử chỉ thuộc chủ sở hữu; hồ sơ được kiểm tra hợp lệ và lưu thành công.

#### Thu ngân

- [ ] Trạng thái ca hiện tại sau khi làm mới trang; mở ca; cảnh báo ca mang sang.
- [ ] Tra mã vạch chính xác và tìm kiếm một phần.
- [ ] Giỏ hàng, báo giá server, khách hàng và khuyến mãi hợp lệ/không hợp lệ.
- [ ] Thanh toán và chống nhấp đúp; xem/in hóa đơn.
- [ ] Lọc và xem chi tiết hóa đơn.
- [ ] Trả một phần hợp lệ, trả vượt số lượng bị chặn, `RESALABLE`/`DAMAGED`.
- [ ] Đối chiếu, hóa đơn dở dang và đóng ca lặp.

#### Kho

- [ ] Tạo/sửa/xóa dòng phiếu nhập bản nháp.
- [ ] Kiểm tra NSX/HSD/số lượng/giá nhập/lô trùng.
- [ ] Xác nhận và phiếu chuyển sang chỉ đọc.
- [ ] Lọc tồn kho và xem chi tiết lô.
- [ ] Tạo snapshot, kiểm đếm/lý do, gửi đề nghị, kiểm lại.
- [ ] Không thấy/không gọi được thao tác phê duyệt.

#### Quản lý

- [ ] Dashboard KPI từ API.
- [ ] Sản phẩm/loại/giá/khuyến mãi/nhà cung cấp.
- [ ] Nhân viên/tài khoản/khách hàng; kiểm tra hồi quy khóa/đăng nhập.
- [ ] Tồn kho/hóa đơn chỉ đọc.
- [ ] Phê duyệt/từ chối kiểm kê và kiểm tra audit.
- [ ] Lọc/chi tiết audit không lộ secret.
- [ ] Ba nhóm báo cáo, đổi kỳ, CSV/in PDF.

### Phụ lục G. Xác nhận phạm vi tài liệu

- Tài liệu gồm đúng 20 chương chính.
- Bao phủ bốn role `CUSTOMER`, `CASHIER`, `WAREHOUSE`, `MANAGER` cùng route công khai.
- Bao phủ F01–F35 và MH-01–MH-28 bằng bảng đối chiếu.
- Bao phủ sử dụng, vận hành kỹ thuật, production, deployment, migration, backup/restore và bàn giao.
- Toàn bộ phần diễn giải người dùng được viết bằng tiếng Việt; chỉ giữ thuật ngữ/identifier kỹ thuật cần thiết.
- Không dùng ảnh mockup trong báo cáo làm ảnh giao diện hiện tại.
