import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const warehouseNavigation = [
  { to: '/warehouse', label: 'Tổng quan', end: true },
  { to: '/warehouse/receiving/new', label: 'Lập phiếu nhập' },
  { to: '/warehouse/receiving', label: 'Xác nhận nhập kho', end: true },
  { to: '/warehouse/inventory', label: 'Tồn kho và cảnh báo' },
  { to: '/account/change-password', label: 'Đổi mật khẩu' },
];

function WarehouseLayout() {
  const { logout, user } = useAuth();

  return (
    <div className="portal-shell warehouse-portal">
      <aside className="portal-sidebar">
        <div>
          <p className="eyebrow">Khu vực kho</p>
          <strong>{user.displayName || user.username}</strong>
          <small>{user.username}</small>
        </div>
        <nav aria-label="Điều hướng nhân viên kho">
          {warehouseNavigation.map((item) => (
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
      <div className="portal-content">
        <Outlet />
      </div>
    </div>
  );
}

export default WarehouseLayout;
