import { Navigate, Route, Routes } from 'react-router-dom';
import { ROLES } from '../auth/roles';
import AppLayout from '../layouts/AppLayout';
import CustomerLayout from '../layouts/CustomerLayout';
import ChangePasswordPage from '../pages/ChangePasswordPage';
import CustomerHistoryPage from '../pages/CustomerHistoryPage';
import CustomerOverviewPage from '../pages/CustomerOverviewPage';
import CustomerProfilePage from '../pages/CustomerProfilePage';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import NotFoundPage from '../pages/NotFoundPage';
import RegisterPage from '../pages/RegisterPage';
import StaffWorkspacePage from '../pages/StaffWorkspacePage';
import { ProtectedRoute, PublicOnlyRoute } from './RouteGuards';

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="public" element={<HomePage />} />
        <Route path="auth" element={<Navigate replace to="/auth/login" />} />
        <Route element={<PublicOnlyRoute />}>
          <Route path="auth/login" element={<LoginPage />} />
          <Route path="auth/register" element={<RegisterPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="account/change-password" element={<ChangePasswordPage />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['CUSTOMER']} />}>
          <Route path="customer" element={<CustomerLayout />}>
            <Route index element={<CustomerOverviewPage />} />
            <Route path="history" element={<CustomerHistoryPage />} />
            <Route path="profile" element={<CustomerProfilePage />} />
          </Route>
        </Route>

        {ROLES.filter((role) => role !== 'CUSTOMER').map((role) => (
          <Route key={role} element={<ProtectedRoute allowedRoles={[role]} />}>
            <Route path={role.toLowerCase()} element={<StaffWorkspacePage />} />
          </Route>
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
