import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS } from '../auth/roles';
import { getRoleNavigation } from './navigation';

function RolePortalLayout({ ariaLabel, eyebrow, portalClassName = '', contentClassName = '' }) {
  const { logout, user } = useAuth();
  const navigation = getRoleNavigation(user.role);

  return (
    <div className={`portal-shell ${portalClassName}`.trim()}>
      <aside className="portal-sidebar">
        <div className="portal-user">
          <p className="eyebrow">{eyebrow}</p>
          <strong>{user.displayName || user.username}</strong>
          <small>{ROLE_LABELS[user.role] || user.role} · {user.username}</small>
        </div>
        <nav aria-label={ariaLabel}>
          {navigation.map((item) => (
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
      <div className={`portal-content ${contentClassName}`.trim()}>
        <Outlet />
      </div>
    </div>
  );
}

export default RolePortalLayout;
