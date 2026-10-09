import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getPrimaryNavigation } from './navigation';

function AppLayout() {
  const { isAuthenticated, logout, user } = useAuth();
  const { pathname } = useLocation();
  const navigation = getPrimaryNavigation(isAuthenticated, user?.role);
  const isPortalRoute = /^\/(customer|cashier|warehouse|manager)(?:\/|$)/.test(pathname);
  const portalModifier = isPortalRoute ? ' app-shell--portal' : '';

  return (
    <div className={`app-shell${portalModifier}`}>
      <header className={`site-header${isPortalRoute ? ' site-header--portal' : ''}`}>
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

      <main className={`page-content${isPortalRoute ? ' page-content--portal' : ''}`}>
        <Outlet />
      </main>

      <footer className={`site-footer${isPortalRoute ? ' site-footer--portal' : ''}`}>
        <span>Hệ thống quản lý cửa hàng tiện lợi</span>
        <span>ReactJS · Vite · REST API</span>
      </footer>
    </div>
  );
}

export default AppLayout;
