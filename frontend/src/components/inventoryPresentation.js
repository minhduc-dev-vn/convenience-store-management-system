export const INVENTORY_MODE_OPTIONS = Object.freeze([
  { value: 'ALL', label: 'Tất cả' },
  { value: 'LOW_STOCK', label: 'Tồn kho thấp' },
  { value: 'NEAR_EXPIRY', label: 'Sắp hết hạn' },
  { value: 'EXPIRED', label: 'Đã hết hạn' },
]);

export const EXPIRY_STATUS_OPTIONS = Object.freeze([
  { value: 'ALL', label: 'Tất cả hạn dùng' },
  { value: 'VALID', label: 'Còn hạn' },
  { value: 'NEAR_EXPIRY', label: 'Sắp hết hạn' },
  { value: 'EXPIRED', label: 'Đã hết hạn' },
]);

export const LOT_STATUS_OPTIONS = Object.freeze([
  { value: '', label: 'Tất cả trạng thái lô' },
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'BLOCKED', label: 'Đã khóa' },
  { value: 'EXPIRED', label: 'Hết hạn' },
]);

const EXPIRY_PRESENTATION = Object.freeze({
  EXPIRED: { label: 'Đã hết hạn', tone: 'expired', rowClassName: 'inventory-lot-row--expired' },
  NEAR_EXPIRY: { label: 'Sắp hết hạn', tone: 'near-expiry', rowClassName: 'inventory-lot-row--near-expiry' },
  VALID: { label: 'Còn hạn', tone: 'valid', rowClassName: 'inventory-lot-row--valid' },
});

export function getExpiryPresentation(expiryStatus) {
  return EXPIRY_PRESENTATION[expiryStatus] ?? {
    label: expiryStatus || 'Chưa xác định',
    tone: 'neutral',
    rowClassName: '',
  };
}

export function getProductAlerts(product) {
  const alerts = [];
  if (product?.alerts?.lowStock) alerts.push({ key: 'low-stock', label: 'Tồn thấp' });
  if (product?.alerts?.nearExpiry) alerts.push({ key: 'near-expiry', label: 'Sắp hết hạn' });
  if (product?.alerts?.expired) alerts.push({ key: 'expired', label: 'Có lô hết hạn' });
  return alerts.length > 0 ? alerts : [{ key: 'normal', label: 'Ổn định' }];
}

export function getInitialExpiryFilter(mode) {
  return ['NEAR_EXPIRY', 'EXPIRED'].includes(mode) ? mode : 'ALL';
}
