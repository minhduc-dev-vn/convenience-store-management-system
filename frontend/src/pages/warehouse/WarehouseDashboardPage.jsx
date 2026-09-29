import { Link } from 'react-router-dom';
import { PageHeader } from '../../components';

function WarehouseDashboardPage() {
  return (
    <section className="workspace-page">
      <PageHeader
        eyebrow="WAREHOUSE"
        title="Trung tâm nhập kho"
        description="Lập phiếu nhập, kiểm tra chi tiết lô và xác nhận tăng tồn qua giao dịch SQL Server atomic."
      />
      <div className="dashboard-grid dashboard-grid--compact">
        <article className="action-card">
          <p className="eyebrow">MH-11 · F20</p>
          <h2>Lập phiếu nhập kho</h2>
          <p>Chọn nhà cung cấp, ghi nhận mặt hàng, số lô, ngày sản xuất, hạn dùng, số lượng và giá nhập.</p>
          <Link className="button button--primary" to="/warehouse/receiving/new">Tạo phiếu nhập</Link>
        </article>
        <article className="action-card">
          <p className="eyebrow">MH-12 · F21</p>
          <h2>Danh sách và xác nhận</h2>
          <p>Kiểm tra phiếu nháp, xác nhận nhập kho hoặc hủy phiếu không đạt yêu cầu.</p>
          <Link className="button button--primary" to="/warehouse/receiving">Mở danh sách phiếu</Link>
        </article>
        <article className="action-card action-card--wide">
          <p className="eyebrow">MH-13 · F22/F23/F24</p>
          <h2>Tồn kho, lô và cảnh báo</h2>
          <p>Tra cứu tồn tổng, xem chi tiết từng lô và lọc cảnh báo tồn thấp, sắp hết hạn hoặc đã hết hạn.</p>
          <Link className="button button--primary" to="/warehouse/inventory">Mở tra cứu tồn kho</Link>
        </article>
      </div>
    </section>
  );
}

export default WarehouseDashboardPage;
