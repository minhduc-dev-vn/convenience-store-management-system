import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';
import CashierLayout from '../layouts/CashierLayout';
import CustomerLayout from '../layouts/CustomerLayout';
import ManagerLayout from '../layouts/ManagerLayout';
import WarehouseLayout from '../layouts/WarehouseLayout';
import ChangePasswordPage from '../pages/ChangePasswordPage';
import CashierDashboardPage from '../pages/cashier/CashierDashboardPage';
import CashierPosPage from '../pages/cashier/CashierPosPage';
import CustomerHistoryPage from '../pages/CustomerHistoryPage';
import CustomerOverviewPage from '../pages/CustomerOverviewPage';
import CustomerProfilePage from '../pages/CustomerProfilePage';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import AccountManagementPage from '../pages/manager/AccountManagementPage';
import CustomerMemberManagementPage from '../pages/manager/CustomerMemberManagementPage';
import EmployeeManagementPage from '../pages/manager/EmployeeManagementPage';
import ManagerInventoryPage from '../pages/manager/InventoryPage';
import ManagerDashboardPage from '../pages/manager/ManagerDashboardPage';
import ProductManagementPage from '../pages/manager/ProductManagementPage';
import ProductPricingPage from '../pages/manager/ProductPricingPage';
import PromotionManagementPage from '../pages/manager/PromotionManagementPage';
import SupplierManagementPage from '../pages/manager/SupplierManagementPage';
import NotFoundPage from '../pages/NotFoundPage';
import ProductCatalogPage from '../pages/customer/ProductCatalogPage';
import PromotionPage from '../pages/customer/PromotionPage';
import RegisterPage from '../pages/RegisterPage';
import ReceivingEditorPage from '../pages/warehouse/ReceivingEditorPage';
import ReceivingManagementPage from '../pages/warehouse/ReceivingManagementPage';
import WarehouseInventoryPage from '../pages/warehouse/InventoryPage';
import WarehouseDashboardPage from '../pages/warehouse/WarehouseDashboardPage';
import { ProtectedRoute, PublicOnlyRoute } from './RouteGuards';

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="public" element={<HomePage />} />
        <Route path="products" element={<ProductCatalogPage />} />
        <Route path="promotions" element={<PromotionPage />} />
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

        <Route element={<ProtectedRoute allowedRoles={['MANAGER']} />}>
          <Route path="manager" element={<ManagerLayout />}>
            <Route index element={<ManagerDashboardPage />} />
            <Route path="employees" element={<EmployeeManagementPage />} />
            <Route path="accounts" element={<AccountManagementPage />} />
            <Route path="customers" element={<CustomerMemberManagementPage />} />
            <Route path="products" element={<ProductManagementPage />} />
            <Route path="products/pricing" element={<ProductPricingPage />} />
            <Route path="promotions" element={<PromotionManagementPage />} />
            <Route path="suppliers" element={<SupplierManagementPage />} />
            <Route path="inventory" element={<ManagerInventoryPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['WAREHOUSE']} />}>
          <Route path="warehouse" element={<WarehouseLayout />}>
            <Route index element={<WarehouseDashboardPage />} />
            <Route path="receiving" element={<ReceivingManagementPage />} />
            <Route path="receiving/new" element={<ReceivingEditorPage />} />
            <Route path="receiving/:receiptId/edit" element={<ReceivingEditorPage />} />
            <Route path="inventory" element={<WarehouseInventoryPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['CASHIER']} />}>
          <Route path="cashier" element={<CashierLayout />}>
            <Route index element={<CashierDashboardPage />} />
            <Route path="pos" element={<CashierPosPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
