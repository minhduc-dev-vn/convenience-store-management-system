import { getRoleHomePath } from '../auth/roles.js';

export const PUBLIC_NAVIGATION = Object.freeze([
  { to: '/', label: 'Tổng quan', end: true },
  { to: '/products', label: 'Sản phẩm' },
  { to: '/promotions', label: 'Khuyến mãi' },
  { to: '/auth/login', label: 'Đăng nhập' },
  { to: '/auth/register', label: 'Đăng ký' },
]);

export const ROLE_NAVIGATION = Object.freeze({
  CUSTOMER: Object.freeze([
    { to: '/customer', label: 'Tổng quan', end: true },
    { to: '/products', label: 'Sản phẩm' },
    { to: '/promotions', label: 'Khuyến mãi' },
    { to: '/customer/history', label: 'Lịch sử và điểm' },
    { to: '/customer/profile', label: 'Hồ sơ cá nhân' },
    { to: '/account/change-password', label: 'Đổi mật khẩu' },
  ]),
  CASHIER: Object.freeze([
    { to: '/cashier', label: 'Tổng quan ca', end: true },
    { to: '/cashier/pos', label: 'Bán hàng tại quầy' },
    { to: '/cashier/invoices', label: 'Tra cứu hóa đơn' },
    { to: '/cashier/returns', label: 'Đổi / trả hàng' },
    { to: '/account/change-password', label: 'Đổi mật khẩu' },
  ]),
  WAREHOUSE: Object.freeze([
    { to: '/warehouse', label: 'Tổng quan', end: true },
    { to: '/warehouse/receiving/new', label: 'Lập phiếu nhập' },
    { to: '/warehouse/receiving', label: 'Xác nhận nhập kho', end: true },
    { to: '/warehouse/inventory', label: 'Tồn kho và cảnh báo' },
    { to: '/warehouse/stocktakes', label: 'Kiểm kê kho' },
    { to: '/account/change-password', label: 'Đổi mật khẩu' },
  ]),
  MANAGER: Object.freeze([
    { to: '/manager', label: 'Tổng quan', end: true },
    { to: '/manager/employees', label: 'Quản lý nhân viên' },
    { to: '/manager/accounts', label: 'Tài khoản và phân quyền' },
    { to: '/manager/customers', label: 'Khách hàng thành viên' },
    { to: '/manager/products', label: 'Quản lý sản phẩm', end: true },
    { to: '/manager/products/pricing', label: 'Cập nhật giá bán' },
    { to: '/manager/promotions', label: 'Quản lý khuyến mãi' },
    { to: '/manager/suppliers', label: 'Quản lý nhà cung cấp' },
    { to: '/manager/inventory', label: 'Tồn kho và cảnh báo' },
    { to: '/manager/stocktakes', label: 'Phê duyệt điều chỉnh kho' },
    { to: '/manager/invoices', label: 'Tra cứu hóa đơn' },
    { to: '/manager/audit-logs', label: 'Nhật ký hệ thống' },
    { to: '/manager/reports', label: 'Báo cáo kinh doanh' },
    { to: '/account/change-password', label: 'Đổi mật khẩu' },
  ]),
});

export function getPrimaryNavigation(isAuthenticated, role) {
  if (!isAuthenticated) return PUBLIC_NAVIGATION;
  return [
    { to: getRoleHomePath(role), label: 'Không gian của tôi' },
    { to: '/account/change-password', label: 'Đổi mật khẩu' },
  ];
}

export function getRoleNavigation(role) {
  return ROLE_NAVIGATION[role] ?? [];
}
