import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS } from '../auth/roles';
import PageHeader from './PageHeader';

function RoleDashboardHeader({ description, title }) {
  const { user } = useAuth();
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  return (
    <PageHeader
      title={title}
      description={description}
      actions={(
        <div className="role-identity" aria-label="Thông tin người dùng đang đăng nhập">
          <span>{roleLabel}</span>
          <strong>{user.displayName || user.username}</strong>
          <small>{user.username}</small>
        </div>
      )}
    />
  );
}

export default RoleDashboardHeader;
