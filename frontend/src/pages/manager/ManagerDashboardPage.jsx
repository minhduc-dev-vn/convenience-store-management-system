import { Link } from 'react-router-dom';
import { PageHeader } from '../../components';

function ManagerDashboardPage() {
  return (
    <section className="workspace-page">
      <PageHeader
        eyebrow="MANAGER"
        title="Trung tâm quản trị"
        description="Quản lý nhân sự, tài khoản, khách hàng, hàng hóa, khuyến mãi và đối tác cung cấp từ một khu vực thống nhất."
      />
      <div className="dashboard-grid dashboard-grid--compact">
        <article className="action-card">
          <p className="eyebrow">MH-19 · F31</p>
          <h2>Nhân viên</h2>
          <p>Tra cứu, thêm và cập nhật hồ sơ; chuyển trạng thái mà không xóa dữ liệu đã phát sinh.</p>
          <Link className="button button--primary" to="/manager/employees">Mở danh sách nhân viên</Link>
        </article>
        <article className="action-card">
          <p className="eyebrow">MH-20 · F32</p>
          <h2>Tài khoản và phân quyền</h2>
          <p>Tạo tài khoản, gán role, khóa/mở khóa và cấp lại mật khẩu nhân viên.</p>
          <Link className="button button--primary" to="/manager/accounts">Mở quản lý tài khoản</Link>
        </article>
        <article className="action-card">
          <p className="eyebrow">MH-21 · F16/F32</p>
          <h2>Khách hàng thành viên</h2>
          <p>Tra cứu thành viên, theo dõi điểm và hạng, xem lịch sử hóa đơn, khóa hoặc mở tài khoản khách hàng.</p>
          <Link className="button button--primary" to="/manager/customers">Mở danh sách khách hàng</Link>
        </article>
        <article className="action-card">
          <p className="eyebrow">MH-16 · F28</p>
          <h2>Sản phẩm và loại hàng</h2>
          <p>Tra cứu, thêm, cập nhật và chuyển trạng thái sản phẩm, đồng thời duy trì danh mục loại hàng.</p>
          <Link className="button button--primary" to="/manager/products">Mở quản lý sản phẩm</Link>
        </article>
        <article className="action-card action-card--wide">
          <p className="eyebrow">MH-17 · F29</p>
          <h2>Giá bán và lịch sử</h2>
          <p>Cập nhật giá có xác nhận, lý do và theo dõi lịch sử audit cho từng sản phẩm.</p>
          <Link className="button button--primary" to="/manager/products/pricing">Mở quản lý giá</Link>
        </article>
        <article className="action-card">
          <p className="eyebrow">MH-18 · F30</p>
          <h2>Chương trình khuyến mãi</h2>
          <p>Tạo, cập nhật, kích hoạt chương trình và quản lý danh sách sản phẩm áp dụng.</p>
          <Link className="button button--primary" to="/manager/promotions">Mở quản lý khuyến mãi</Link>
        </article>
        <article className="action-card">
          <p className="eyebrow">MH-10 · F19</p>
          <h2>Nhà cung cấp</h2>
          <p>Tra cứu, thêm và cập nhật hồ sơ đối tác; thay đổi trạng thái hợp tác mà không xóa dữ liệu đã phát sinh.</p>
          <Link className="button button--primary" to="/manager/suppliers">Mở quản lý nhà cung cấp</Link>
        </article>
      </div>
    </section>
  );
}

export default ManagerDashboardPage;
