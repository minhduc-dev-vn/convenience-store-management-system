import { Route, Routes } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';
import AuthPage from '../pages/AuthPage';
import HomePage from '../pages/HomePage';
import NotFoundPage from '../pages/NotFoundPage';
import RoleHomePage from '../pages/RoleHomePage';

const roleRoutes = [
  {
    path: 'customer',
    eyebrow: 'CUSTOMER',
    title: 'Không gian khách hàng',
    description: 'Khung route dành cho trải nghiệm tra cứu và hồ sơ khách hàng.',
  },
  {
    path: 'cashier',
    eyebrow: 'CASHIER',
    title: 'Không gian thu ngân',
    description: 'Khung route dành cho các tác vụ bán hàng trực tiếp tại quầy.',
  },
  {
    path: 'warehouse',
    eyebrow: 'WAREHOUSE',
    title: 'Không gian kho',
    description: 'Khung route dành cho luồng nhập hàng, tồn kho và kiểm kê.',
  },
  {
    path: 'manager',
    eyebrow: 'MANAGER',
    title: 'Không gian quản lý',
    description: 'Khung route dành cho cấu hình, giám sát và báo cáo quản trị.',
  },
];

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="public" element={<HomePage />} />
        <Route path="auth" element={<AuthPage />} />
        {roleRoutes.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={(
              <RoleHomePage
                eyebrow={route.eyebrow}
                title={route.title}
                description={route.description}
              />
            )}
          />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
