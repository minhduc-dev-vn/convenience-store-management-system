export const INVOICE_STATUS_LABELS = Object.freeze({
  DRAFT: 'Chưa hoàn tất',
  PAID: 'Đã thanh toán',
  CANCELLED: 'Đã hủy',
  REFUNDED: 'Đã hoàn tiền',
});

export function invoiceStatusLabel(status) {
  return INVOICE_STATUS_LABELS[status] ?? status ?? '—';
}

export function countReturnableUnits(invoice) {
  if (!Array.isArray(invoice?.items)) return 0;
  return invoice.items.reduce((total, item) => {
    const quantity = Number(item.quantityReturnable);
    return total + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
  }, 0);
}

export function canStartInvoiceReturn(invoice) {
  return invoice?.status === 'PAID'
    && countReturnableUnits(invoice) > 0;
}

export function calculateShiftDifference(closingCash, expectedCash) {
  const actual = Number(closingCash);
  const expected = Number(expectedCash);
  if (!Number.isFinite(actual) || actual < 0 || !Number.isFinite(expected)) return null;
  return Math.round((actual - expected) * 100) / 100;
}
