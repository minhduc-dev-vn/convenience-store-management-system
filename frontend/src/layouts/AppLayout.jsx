import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getRoleHomePath } from '../auth/roles';

function AppLayout() {
  const { isAuthenticated, logout, user } = useAuth();
  const navigation = isAuthenticated
    ? [
      { to: getRoleHomePath(user.role), label: 'Không gian của tôi' },
      { to: '/account/change-password', label: 'Đổi mật khẩu' },
    ]
    : [
      { to: '/', label: 'Tổng quan', end: true },
      { to: '/auth/login', label: 'Đăng nhập' },
      { to: '/auth/register', label: 'Đăng ký' },
    ];

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
          {isAuthenticated && (
            <button className="nav-button" type="button" onClick={logout}>Đăng xuất</button>
          )}
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
