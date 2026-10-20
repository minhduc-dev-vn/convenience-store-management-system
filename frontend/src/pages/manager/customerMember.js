export const MEMBERSHIP_TIERS = Object.freeze([
  { label: 'Đồng', value: 'BRONZE' },
  { label: 'Bạc', value: 'SILVER' },
  { label: 'Vàng', value: 'GOLD' },
  { label: 'Kim cương', value: 'DIAMOND' },
]);

export const MEMBERSHIP_TIER_LABELS = Object.freeze(
  Object.fromEntries(MEMBERSHIP_TIERS.map(({ label, value }) => [value, label])),
);

export const CUSTOMER_STATUS_LABELS = Object.freeze({
  ACTIVE: 'Hoạt động',
  INACTIVE: 'Ngừng hoạt động',
});

export const ACCOUNT_STATUS_LABELS = Object.freeze({
  ACTIVE: 'Hoạt động',
  INACTIVE: 'Ngừng hoạt động',
  LOCKED: 'Đã khóa',
});

export function getCustomerAccountTransition(customer) {
  const status = customer?.account?.status;
  if (status === 'ACTIVE') return { label: 'Khóa tài khoản', nextStatus: 'LOCKED' };
  if (status === 'LOCKED') return { label: 'Mở khóa', nextStatus: 'ACTIVE' };
  return null;
}

export function validateHistoryDateRange({ from, to }) {
  if (from && to && from > to) {
    return 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.';
  }
  return '';
}
