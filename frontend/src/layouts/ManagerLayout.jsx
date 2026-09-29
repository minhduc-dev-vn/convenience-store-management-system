import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const managerNavigation = [
  { to: '/manager', label: 'Tổng quan', end: true },
  { to: '/manager/employees', label: 'Quản lý nhân viên' },
  { to: '/manager/accounts', label: 'Tài khoản và phân quyền' },
  { to: '/manager/customers', label: 'Khách hàng thành viên' },
  { to: '/manager/products', label: 'Quản lý sản phẩm', end: true },
  { to: '/manager/products/pricing', label: 'Cập nhật giá bán' },
  { to: '/manager/promotions', label: 'Quản lý khuyến mãi' },
  { to: '/manager/suppliers', label: 'Quản lý nhà cung cấp' },
  { to: '/manager/inventory', label: 'Tồn kho và cảnh báo' },
  { to: '/account/change-password', label: 'Đổi mật khẩu' },
];

function ManagerLayout() {
  const { logout, user } = useAuth();

  return (
    <div className="portal-shell manager-portal">
      <aside className="portal-sidebar">
        <div>
          <p className="eyebrow">Khu vực quản lý</p>
          <strong>{user.displayName || user.username}</strong>
          <small>{user.username}</small>
        </div>
        <nav aria-label="Điều hướng quản lý">
          {managerNavigation.map((item) => (
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

export default ManagerLayout;
