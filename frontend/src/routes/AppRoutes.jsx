import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LoadingState } from '../components/StateViews';
import AppLayout from '../layouts/AppLayout';
import CashierLayout from '../layouts/CashierLayout';
import CustomerLayout from '../layouts/CustomerLayout';
import ManagerLayout from '../layouts/ManagerLayout';
import WarehouseLayout from '../layouts/WarehouseLayout';
import { ProtectedRoute, PublicOnlyRoute } from './RouteGuards';

const ChangePasswordPage = lazy(() => import('../pages/ChangePasswordPage'));
const CashierDashboardPage = lazy(() => import('../pages/cashier/CashierDashboardPage'));
const CashierInvoiceLookupPage = lazy(() => import('../pages/cashier/CashierInvoiceLookupPage'));
const CashierPosPage = lazy(() => import('../pages/cashier/CashierPosPage'));
const CashierReceiptPage = lazy(() => import('../pages/cashier/CashierReceiptPage'));
const CashierReturnPage = lazy(() => import('../pages/cashier/CashierReturnPage'));
const CustomerHistoryPage = lazy(() => import('../pages/CustomerHistoryPage'));
const CustomerOverviewPage = lazy(() => import('../pages/CustomerOverviewPage'));
const CustomerProfilePage = lazy(() => import('../pages/CustomerProfilePage'));
const HomePage = lazy(() => import('../pages/HomePage'));
const LoginPage = lazy(() => import('../pages/LoginPage'));
const AccountManagementPage = lazy(() => import('../pages/manager/AccountManagementPage'));
const AuditLogPage = lazy(() => import('../pages/manager/AuditLogPage'));
const CustomerMemberManagementPage = lazy(() => import('../pages/manager/CustomerMemberManagementPage'));
const EmployeeManagementPage = lazy(() => import('../pages/manager/EmployeeManagementPage'));
const ManagerInventoryPage = lazy(() => import('../pages/manager/InventoryPage'));
const ManagerInvoiceLookupPage = lazy(() => import('../pages/manager/InvoiceLookupPage'));
const ManagerDashboardPage = lazy(() => import('../pages/manager/ManagerDashboardPage'));
const ProductManagementPage = lazy(() => import('../pages/manager/ProductManagementPage'));
const ProductPricingPage = lazy(() => import('../pages/manager/ProductPricingPage'));
const PromotionManagementPage = lazy(() => import('../pages/manager/PromotionManagementPage'));
const MerchandiseReportPage = lazy(() => import('../pages/manager/reports/MerchandiseReportPage'));
const ReportsDashboardPage = lazy(() => import('../pages/manager/reports/ReportsDashboardPage'));
const RevenueReportPage = lazy(() => import('../pages/manager/reports/RevenueReportPage'));
const WorkforceReportPage = lazy(() => import('../pages/manager/reports/WorkforceReportPage'));
const SupplierManagementPage = lazy(() => import('../pages/manager/SupplierManagementPage'));
const StocktakeApprovalPage = lazy(() => import('../pages/manager/StocktakeApprovalPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));
const ProductCatalogPage = lazy(() => import('../pages/customer/ProductCatalogPage'));
const PromotionPage = lazy(() => import('../pages/customer/PromotionPage'));
const RegisterPage = lazy(() => import('../pages/RegisterPage'));
const ReceivingEditorPage = lazy(() => import('../pages/warehouse/ReceivingEditorPage'));
const ReceivingManagementPage = lazy(() => import('../pages/warehouse/ReceivingManagementPage'));
const WarehouseInventoryPage = lazy(() => import('../pages/warehouse/InventoryPage'));
const WarehouseDashboardPage = lazy(() => import('../pages/warehouse/WarehouseDashboardPage'));
const WarehouseStocktakePage = lazy(() => import('../pages/warehouse/StocktakePage'));

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingState message="Đang tải màn hình…" />}>
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
            <Route path="stocktakes" element={<StocktakeApprovalPage />} />
            <Route path="invoices" element={<ManagerInvoiceLookupPage />} />
            <Route path="audit-logs" element={<AuditLogPage />} />
            <Route path="reports" element={<ReportsDashboardPage />} />
            <Route path="reports/revenue" element={<RevenueReportPage />} />
            <Route path="reports/merchandise" element={<MerchandiseReportPage />} />
            <Route path="reports/workforce" element={<WorkforceReportPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['WAREHOUSE']} />}>
          <Route path="warehouse" element={<WarehouseLayout />}>
            <Route index element={<WarehouseDashboardPage />} />
            <Route path="receiving" element={<ReceivingManagementPage />} />
            <Route path="receiving/new" element={<ReceivingEditorPage />} />
            <Route path="receiving/:receiptId/edit" element={<ReceivingEditorPage />} />
            <Route path="inventory" element={<WarehouseInventoryPage />} />
            <Route path="stocktakes" element={<WarehouseStocktakePage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['CASHIER']} />}>
          <Route path="cashier" element={<CashierLayout />}>
            <Route index element={<CashierDashboardPage />} />
            <Route path="pos" element={<CashierPosPage />} />
            <Route path="receipts/:invoiceId" element={<CashierReceiptPage />} />
            <Route path="invoices" element={<CashierInvoiceLookupPage />} />
            <Route path="returns" element={<CashierReturnPage />} />
            <Route path="returns/:invoiceId" element={<CashierReturnPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
