import { Link } from 'react-router-dom';
import { PageHeader } from '../../components';

function ManagerDashboardPage() {
  return (
    <section className="workspace-page">
      <PageHeader
        eyebrow="MANAGER"
        title="Trung tâm quản trị"
        description="Quản lý hồ sơ nhân viên, tài khoản và quyền truy cập từ một khu vực thống nhất."
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
      </div>
    </section>
  );
}

export default ManagerDashboardPage;
