import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const customerNavigation = [
  { to: '/customer', label: 'Tổng quan', end: true },
  { to: '/products', label: 'Sản phẩm' },
  { to: '/promotions', label: 'Khuyến mãi' },
  { to: '/customer/history', label: 'Lịch sử và điểm' },
  { to: '/customer/profile', label: 'Hồ sơ cá nhân' },
  { to: '/account/change-password', label: 'Đổi mật khẩu' },
];

function CustomerLayout() {
  const { logout, user } = useAuth();

  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <div>
          <p className="eyebrow">Cổng khách hàng</p>
          <strong>{user.displayName || user.username}</strong>
          <small>{user.username}</small>
        </div>
        <nav aria-label="Điều hướng khách hàng">
          {customerNavigation.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) => (isActive ? 'portal-link active' : 'portal-link')}
              end={item.end}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button className="button button--ghost" type="button" onClick={logout}>
          Đăng xuất
        </button>
      </aside>
      <div className="portal-content">
        <Outlet />
      </div>
    </div>
  );
}

export default CustomerLayout;
