import { Link } from 'react-router-dom';
import { HealthCheckPanel } from '../components';

const workspaces = [
  { code: '01', title: 'Khách hàng', caption: 'Hồ sơ, hóa đơn và điểm tích lũy cá nhân' },
  { code: '02', title: 'Thu ngân', caption: 'Truy cập theo quyền của tài khoản thu ngân' },
  { code: '03', title: 'Nhân viên kho', caption: 'Truy cập theo quyền của tài khoản kho' },
  { code: '04', title: 'Quản lý', caption: 'Truy cập theo quyền của tài khoản quản lý' },
];

function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>Một không gian chung cho mọi vai trò tại cửa hàng.</h1>
          <p className="hero-description">
            Đăng nhập một lần để hệ thống điều hướng đến đúng không gian làm việc theo vai trò,
            đồng thời bảo vệ dữ liệu cá nhân ở cả giao diện và API.
          </p>
          <div className="hero-actions">
            <Link className="button button--primary" to="/auth/login">Đi đến đăng nhập</Link>
            <a className="text-link" href="#workspaces">Xem các không gian</a>
          </div>
        </div>

        <aside className="foundation-card" aria-label="Truy cập tài khoản">
          <span className="status-pill"><i /> Kết nối an toàn</span>
          <strong>Tài khoản và dữ liệu đúng theo vai trò.</strong>
          <div className="foundation-meta">
            <span><b>04</b> vai trò</span>
            <span><b>01</b> hệ thống</span>
          </div>
        </aside>
      </section>

      <section className="workspace-section" id="workspaces">
        <div className="section-heading">
          <div>
            <h2>Các không gian làm việc</h2>
          </div>
          <p>Hệ thống chỉ mở khu vực tương ứng với vai trò sau khi xác thực thành công.</p>
        </div>

        <div className="workspace-grid">
          {workspaces.map((workspace) => (
            <article className="workspace-card" key={workspace.code}>
              <span className="workspace-code">{workspace.code}</span>
              <div>
                <h3>{workspace.title}</h3>
                <p>{workspace.caption}</p>
              </div>
              <span className="workspace-arrow" aria-hidden="true">✓</span>
            </article>
          ))}
        </div>
      </section>

      <HealthCheckPanel />
    </>
  );
}

export default HomePage;
