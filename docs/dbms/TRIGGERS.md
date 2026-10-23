# Database triggers

Phase 4 bổ sung bốn trigger bảo vệ invariant nghiệp vụ vào trigger audit đã có, đưa trạng thái cuối lên đúng 5 trigger `dbo`. Migration authoritative là `database/migrations/005_add_dbms_business_triggers.sql`; `database/triggers/` chứa năm source trình bày, mỗi file đúng một `CREATE OR ALTER TRIGGER` và không dùng dynamic SQL. Clean bootstrap vẫn chỉ include trigger audit để runner thực sự áp dụng migration 005.

Các trigger đều là `AFTER`, xử lý `inserted`/`deleted` theo tập hợp, dùng `SET NOCOUNT ON`, không mở/commit transaction và không tự sửa dữ liệu. Cùng contract với trigger audit hiện hữu, `sysadmin` và thành viên `db_owner` có đường bảo trì dữ liệu; các invariant dưới đây áp dụng cho principal ứng dụng không đặc quyền. Phase 5 sẽ cấu hình quyền ứng dụng theo nguyên tắc này.

## Tổng quan

| Trigger | Parent table | Event | Invariant | Lỗi |
|---|---|---|---|---|
| `trg_NHAT_KY_HE_THONG_AppendOnly` | `NHAT_KY_HE_THONG` | UPDATE, DELETE | Audit log là append-only | `51820` — `Audit log entries are append-only and cannot be updated or deleted.` |
| `trg_GIAO_DICH_KHO_AppendOnly` | `GIAO_DICH_KHO` | UPDATE, DELETE | Sổ movement kho là append-only | `53200` — `Inventory movements are append-only and cannot be updated or deleted.` |
| `trg_CHI_TIET_PHIEU_NHAP_ChiSuaKhiDraft` | `CHI_TIET_PHIEU_NHAP` | INSERT, UPDATE, DELETE | Dòng phiếu nhập chỉ mutable khi parent là `DRAFT` | `53201` — `Receipt details can only be changed while the receipt is DRAFT.` |
| `trg_CHI_TIET_HOA_DON_ChiSuaKhiDraft` | `CHI_TIET_HOA_DON` | INSERT, UPDATE, DELETE | Dòng hóa đơn chỉ mutable khi parent là `DRAFT` | `53202` — `Invoice details can only be changed while the invoice is DRAFT.` |
| `trg_LO_HANG_BaoVeSanPhamSauPhatSinh` | `LO_HANG` | UPDATE | Không đổi sản phẩm của lô sau khi có lịch sử nghiệp vụ | `53203` — `A lot product cannot be reassigned after the lot has business history.` |

## `trg_NHAT_KY_HE_THONG_AppendOnly`

- Mục đích: giữ lịch sử audit bất biến sau khi ghi.
- Hợp lệ: `INSERT` qua `usp_NHAT_KY_HE_THONG_Ghi` hoặc insert hợp lệ trực tiếp.
- Không hợp lệ: application principal `UPDATE` hoặc `DELETE` bản ghi audit.
- Stored procedure liên quan: `usp_NHAT_KY_HE_THONG_Ghi`, `usp_NHAT_KY_HE_THONG_TraCuu`.
- Vì sao dùng trigger: `CHECK` chỉ kiểm tra giá trị một row và FK chỉ kiểm tra tham chiếu; cả hai không thể cấm riêng UPDATE/DELETE.

```sql
UPDATE dbo.NHAT_KY_HE_THONG
SET HanhDong = 'MUTATED'
WHERE MaNhatKy = 1;
-- Principal ứng dụng: lỗi 51820.
```

## `trg_GIAO_DICH_KHO_AppendOnly`

- Mục đích: bảo vệ ledger `IMPORT`, `SALE`, `RETURN`, `ADJUSTMENT`; sửa sai phải ghi movement bù thay vì viết lại lịch sử.
- Hợp lệ: `INSERT` movement mới.
- Không hợp lệ: mọi UPDATE/DELETE có ít nhất một row; statement nhiều dòng bị rollback toàn bộ.
- Stored procedure liên quan: `usp_PHIEU_NHAP_XacNhan`, `usp_HOA_DON_HoanTatBanHang`, `usp_PHIEU_TRA_HoanTat`, `usp_KIEM_KE_PheDuyetDieuChinh`. Cả bốn chỉ INSERT movement.
- Vì sao dùng trigger: invariant phụ thuộc loại thao tác DML, không thể biểu diễn bằng CHECK/FK.

```sql
UPDATE dbo.GIAO_DICH_KHO
SET GhiChu = N'Sửa lịch sử'
WHERE MaGiaoDich = 1;
-- Principal ứng dụng: lỗi 53200; row giữ nguyên.
```

## `trg_CHI_TIET_PHIEU_NHAP_ChiSuaKhiDraft`

- Mục đích: khóa dòng nhập sau khi phiếu chuyển sang `CONFIRMED` hoặc `CANCELLED`.
- Hợp lệ: INSERT/UPDATE/DELETE khi `PHIEU_NHAP.TrangThai = 'DRAFT'`.
- Không hợp lệ: thay đổi dòng thuộc parent không còn DRAFT, kể cả UPDATE đổi parent; trigger xét cả parent cũ và mới.
- Stored procedure liên quan: `usp_CHI_TIET_PHIEU_NHAP_LuuNhap`, `usp_CHI_TIET_PHIEU_NHAP_Xoa`, `usp_PHIEU_NHAP_XacNhan`, `usp_PHIEU_NHAP_Huy`.
- Vì sao dùng trigger: trạng thái nằm ở bảng parent nên CHECK trên bảng chi tiết không thể tham chiếu và cưỡng chế invariant xuyên bảng này.

```sql
DELETE FROM dbo.CHI_TIET_PHIEU_NHAP
WHERE MaPN = 'PN_CONFIRMED';
-- Principal ứng dụng: lỗi 53201 nếu phiếu không còn DRAFT.
```

## `trg_CHI_TIET_HOA_DON_ChiSuaKhiDraft`

- Mục đích: giữ nguyên dòng của hóa đơn đã `PAID`, `CANCELLED` hoặc `REFUNDED`.
- Hợp lệ: checkout tạo header `DRAFT`, insert dòng, phân bổ FEFO rồi mới đổi header sang `PAID`.
- Không hợp lệ: INSERT/UPDATE/DELETE dòng sau khi invoice đã final; statement nhiều dòng rollback toàn bộ.
- Stored procedure liên quan: `usp_HOA_DON_HoanTatBanHang`, `usp_PHIEU_TRA_HoanTat`. Luồng return chỉ đọc invoice line và thêm record trả hàng, không sửa dòng đã thanh toán.
- Vì sao dùng trigger: đây là state-machine invariant xuyên bảng, không thể biểu diễn bằng CHECK hoặc FK.

```sql
UPDATE dbo.CHI_TIET_HOA_DON
SET SoLuong = SoLuong + 1
WHERE MaHD = 'HD_PAID';
-- Principal ứng dụng: lỗi 53202 nếu hóa đơn không còn DRAFT.
```

## `trg_LO_HANG_BaoVeSanPhamSauPhatSinh`

- Mục đích: bảo toàn ý nghĩa lịch sử sau chuẩn hóa 3NF, nơi sản phẩm của movement được suy ra qua `GIAO_DICH_KHO.MaLo → LO_HANG.MaSP`.
- Hợp lệ: sửa thuộc tính khác của lô; hoặc đổi `MaSP` khi lô hoàn toàn chưa có history.
- Không hợp lệ: đổi `MaSP` khi lô xuất hiện trong phiếu nhập `CONFIRMED`, `GIAO_DICH_KHO`, `CHI_TIET_XUAT_LO`, `CHI_TIET_PHIEU_TRA` hoặc `CHI_TIET_KIEM_KE`.
- Stored procedure liên quan: các procedure nhập/bán/trả/kiểm kê chỉ cập nhật tồn, giá nhập hoặc trạng thái lô; không đổi `MaSP`.
- Vì sao dùng trigger: history nằm ở nhiều bảng và chỉ cần kiểm tra khi giá trị `MaSP` thực sự đổi; CHECK/FK không thể diễn đạt điều kiện tồn tại xuyên nhiều quan hệ.

```sql
UPDATE dbo.LO_HANG
SET MaSP = 'SP_OTHER'
WHERE MaLo = 'LOT_WITH_HISTORY';
-- Principal ứng dụng: lỗi 53203; multi-row statement cũng rollback toàn bộ.
```

## Vì sao không có trigger tự động cập nhật tồn kho hoặc audit

Tồn kho hiện do các stored procedure nhập hàng, FEFO sale, return và stocktake cập nhật trong transaction nghiệp vụ, đồng thời ghi `GIAO_DICH_KHO`. Thêm trigger mutation sẽ gây double update/double movement và thay đổi thứ tự khóa. Audit cũng đã đi qua `usp_NHAT_KY_HE_THONG_Ghi`; auto-audit trigger sẽ tạo sự kiện trùng. Vì vậy Phase 4 chỉ thêm validation/protection trigger, không thêm mutation orchestration.

## Kiểm chứng

- `database/tests/12_trigger_tests.sql` kiểm tra 5 trigger enabled/đúng parent, valid/invalid direct DML, error number, dữ liệu không đổi sau lỗi và multi-row atomicity.
- Suite chạy official receiving, checkout và return dưới principal test không đặc quyền để chứng minh compatibility khi trigger thực sự enforce.
- Principal `C60TriggerDmlTestUser` chỉ tồn tại trong test, không có login và bị xóa cuối suite; migration 005 không tạo user/role/quyền.
- `database/tests/10_integrity_packaging_tests.sql` khóa metadata ở đúng 5 function và 5 enabled trigger.
