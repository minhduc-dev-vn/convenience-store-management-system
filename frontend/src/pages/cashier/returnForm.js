const RETURN_CONDITIONS = new Set(['RESALABLE', 'DAMAGED']);

function formError(message) {
  return new Error(message);
}

export function allocationKey(lineId, lotId) {
  return `${lineId}:${lotId}`;
}

export function createReturnRows(invoice) {
  if (!Array.isArray(invoice?.items)) return [];

  return invoice.items.flatMap((item) => (
    Array.isArray(item.lotAllocations) ? item.lotAllocations : []
  )
    .filter((allocation) => Number(allocation.quantityReturnable) > 0)
    .map((allocation) => ({
      condition: 'RESALABLE',
      key: allocationKey(item.lineId, allocation.lotId),
      lineId: String(item.lineId),
      lotId: allocation.lotId,
      manufacturerLot: allocation.manufacturerLot,
      productId: item.productId,
      productName: item.name,
      quantity: '',
      quantityReturnable: Number(allocation.quantityReturnable),
      quantityReturned: Number(allocation.quantityReturned),
      quantitySold: Number(allocation.quantitySold),
      unit: item.unit,
    })));
}

export function updateReturnRow(rows, key, patch) {
  return rows.map((row) => (row.key === key ? { ...row, ...patch } : row));
}

function normalizeQuantity(value, maximum) {
  if (value === '' || value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) throw formError('Số lượng trả phải là số nguyên không âm.');
  const quantity = Number(text);
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw formError('Số lượng trả không hợp lệ.');
  }
  if (quantity > maximum) {
    throw formError('Số lượng trả không được vượt quá số lượng còn có thể trả.');
  }
  return quantity;
}

export function buildReturnRequest(invoiceId, reasonInput, rows) {
  const reason = typeof reasonInput === 'string' ? reasonInput.trim() : '';
  if (!invoiceId) throw formError('Hãy tải hóa đơn gốc trước khi xác nhận.');
  if (!reason) throw formError('Vui lòng nhập lý do đổi/trả.');
  if (reason.length > 255) throw formError('Lý do đổi/trả không được vượt quá 255 ký tự.');

  const items = rows.flatMap((row) => {
    const quantity = normalizeQuantity(row.quantity, row.quantityReturnable);
    if (quantity === 0) return [];
    if (!RETURN_CONDITIONS.has(row.condition)) {
      throw formError('Tình trạng hàng trả không hợp lệ.');
    }
    return [{
      condition: row.condition,
      lineId: row.lineId,
      lotId: row.lotId,
      quantity,
    }];
  });

  if (items.length === 0) {
    throw formError('Vui lòng chọn ít nhất một sản phẩm và nhập số lượng cần trả.');
  }

  return { invoiceId, reason, items };
}

export function countSelectedUnits(rows) {
  return rows.reduce((total, row) => {
    const quantity = Number(row.quantity);
    return total + (Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0);
  }, 0);
}
