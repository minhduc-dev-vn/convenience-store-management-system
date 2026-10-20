export const ROLES = Object.freeze(['CUSTOMER', 'CASHIER', 'WAREHOUSE', 'MANAGER']);

const ROLE_HOME_PATHS = Object.freeze({
  CUSTOMER: '/customer',
  CASHIER: '/cashier',
  WAREHOUSE: '/warehouse',
  MANAGER: '/manager',
});

export const ROLE_LABELS = Object.freeze({
  CUSTOMER: 'Khách hàng',
  CASHIER: 'Thu ngân',
  WAREHOUSE: 'Nhân viên kho',
  MANAGER: 'Quản lý',
});

export function getRoleHomePath(role) {
  return ROLE_HOME_PATHS[role] ?? '/auth/login';
}

export function isSupportedRole(role) {
  return ROLES.includes(role);
}
