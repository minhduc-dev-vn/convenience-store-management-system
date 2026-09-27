import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS } from '../auth/roles';
import { PageHeader } from '../components';

const workspaceCopy = {
  CASHIER: 'Khu vực thao tác dành cho nghiệp vụ bán hàng và ca làm việc.',
  WAREHOUSE: 'Khu vực thao tác dành cho nhập hàng, tồn kho và kiểm kê.',
  MANAGER: 'Khu vực điều hành dành cho quản trị, phê duyệt và báo cáo.',
};

function StaffWorkspacePage() {
  const { logout, user } = useAuth();

  return (
    <section className="workspace-page">
      <PageHeader
        eyebrow={user.role}
        title={`Xin chào, ${user.displayName || user.username}`}
        description={workspaceCopy[user.role]}
      />
      <div className="dashboard-grid dashboard-grid--compact">
        <article className="metric-card metric-card--accent">
          <span>Vai trò hiện tại</span>
          <strong>{ROLE_LABELS[user.role]}</strong>
          <p>Quyền truy cập được xác nhận lại tại backend cho từng yêu cầu.</p>
        </article>
        <article className="action-card">
          <p className="eyebrow">Tài khoản</p>
          <h2>Bảo mật phiên làm việc</h2>
          <p>Bạn có thể đổi mật khẩu dùng chung cho mọi vai trò hoặc kết thúc phiên hiện tại.</p>
          <div className="inline-actions">
            <Link className="button button--primary" to="/account/change-password">
              Đổi mật khẩu
            </Link>
            <button className="button button--ghost" type="button" onClick={logout}>
              Đăng xuất
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}

export default StaffWorkspacePage;
