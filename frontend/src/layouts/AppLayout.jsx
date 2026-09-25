import { NavLink, Outlet } from 'react-router-dom';

const navigation = [
  { to: '/', label: 'Tổng quan', end: true },
  { to: '/auth', label: 'Đăng nhập' },
  { to: '/customer', label: 'Khách hàng' },
  { to: '/cashier', label: 'Thu ngân' },
  { to: '/warehouse', label: 'Kho' },
  { to: '/manager', label: 'Quản lý' },
];

function AppLayout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <NavLink className="brand" to="/" aria-label="Về trang tổng quan">
          <span className="brand-mark" aria-hidden="true">CS</span>
          <span>
            <strong>Cửa hàng tiện lợi</strong>
            <small>Nền tảng quản lý</small>
          </span>
        </NavLink>

        <nav className="primary-nav" aria-label="Điều hướng chính">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              end={item.end}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="page-content">
        <Outlet />
      </main>

      <footer className="site-footer">
        <span>Hệ thống quản lý cửa hàng tiện lợi</span>
        <span>ReactJS · Vite · REST API</span>
      </footer>
    </div>
  );
}

export default AppLayout;
