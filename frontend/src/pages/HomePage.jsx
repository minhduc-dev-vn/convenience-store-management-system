import { Link } from 'react-router-dom';

const workspaces = [
  { to: '/customer', code: '01', title: 'Khách hàng', caption: 'Thông tin và lịch sử cá nhân' },
  { to: '/cashier', code: '02', title: 'Thu ngân', caption: 'Bán hàng trực tiếp tại quầy' },
  { to: '/warehouse', code: '03', title: 'Nhân viên kho', caption: 'Nhập hàng và kiểm soát tồn' },
  { to: '/manager', code: '04', title: 'Quản lý', caption: 'Điều hành và theo dõi hoạt động' },
];

function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Nền tảng vận hành tập trung</p>
          <h1>Một không gian chung cho mọi vai trò tại cửa hàng.</h1>
          <p className="hero-description">
            Khung giao diện được thiết kế để mở rộng theo từng nghiệp vụ, từ quầy thu ngân
            đến kho hàng và quản trị — rõ ràng, nhất quán và dễ thao tác.
          </p>
          <div className="hero-actions">
            <Link className="button button--primary" to="/auth">Đi đến đăng nhập</Link>
            <a className="text-link" href="#workspaces">Xem các không gian</a>
          </div>
        </div>

        <aside className="foundation-card" aria-label="Trạng thái frontend">
          <span className="status-pill"><i /> Frontend foundation</span>
          <strong>Sẵn sàng để phát triển theo từng use case.</strong>
          <div className="foundation-meta">
            <span><b>04</b> vai trò</span>
            <span><b>01</b> hệ thống</span>
          </div>
        </aside>
      </section>

      <section className="workspace-section" id="workspaces">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Điều hướng theo vai trò</p>
            <h2>Các không gian làm việc</h2>
          </div>
          <p>Mỗi khu vực hiện là route nền tảng và chưa chứa chức năng nghiệp vụ.</p>
        </div>

        <div className="workspace-grid">
          {workspaces.map((workspace) => (
            <Link className="workspace-card" key={workspace.to} to={workspace.to}>
              <span className="workspace-code">{workspace.code}</span>
              <div>
                <h3>{workspace.title}</h3>
                <p>{workspace.caption}</p>
              </div>
              <span className="workspace-arrow" aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

export default HomePage;
