import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const cashierNavigation = [
  { to: '/cashier', label: 'Ca làm việc', end: true },
  { to: '/cashier/pos', label: 'Bán hàng tại quầy' },
  { to: '/cashier/invoices', label: 'Tra cứu hóa đơn' },
  { to: '/cashier/returns', label: 'Đổi / trả hàng' },
  { to: '/account/change-password', label: 'Đổi mật khẩu' },
];

function CashierLayout() {
  const { logout, user } = useAuth();

  return (
    <div className="portal-shell cashier-portal">
      <aside className="portal-sidebar">
        <div>
          <p className="eyebrow">Khu vực thu ngân</p>
          <strong>{user.displayName || user.username}</strong>
          <small>{user.username}</small>
        </div>
        <nav aria-label="Điều hướng thu ngân">
          {cashierNavigation.map((item) => (
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
        <button className="button button--ghost" type="button" onClick={logout}>Đăng xuất</button>
      </aside>
      <div className="portal-content portal-content--cashier">
        <Outlet />
      </div>
    </div>
  );
}

export default CashierLayout;
