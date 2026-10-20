function pad(value) {
  return String(value).padStart(2, '0');
}

export function toDateTimeInput(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function createEmptyReceiptForm(now = new Date()) {
  return { supplierId: '', receivedAt: toDateTimeInput(now), note: '' };
}

export const EMPTY_LINE_FORM = Object.freeze({
  productId: '',
  manufacturerLot: '',
  manufactureDate: '',
  expiryDate: '',
  quantity: '1',
  unitCost: '',
});

function hasAtMostTwoDecimals(value) {
  return /^\d+(?:\.\d{1,2})?$/.test(String(value));
}

function optionalDate(value) {
  return value || null;
}

export function receiptToForm(receipt) {
  return {
    supplierId: receipt?.supplier?.supplierId ?? '',
    receivedAt: toDateTimeInput(receipt?.receivedAt),
    note: receipt?.note ?? '',
  };
}

export function lineToForm(line) {
  return {
    ...EMPTY_LINE_FORM,
    productId: line?.product?.productId ?? '',
    manufacturerLot: line?.manufacturerLot ?? '',
    manufactureDate: line?.manufactureDate ?? '',
    expiryDate: line?.expiryDate ?? '',
    quantity: line?.quantity === undefined ? '1' : String(line.quantity),
    unitCost: line?.unitCost === undefined ? '' : String(line.unitCost),
  };
}

export function validateReceiptForm(form) {
  const errors = {};
  if (!form.supplierId) errors.supplierId = 'Vui lòng chọn nhà cung cấp.';
  if (!form.receivedAt || Number.isNaN(new Date(form.receivedAt).getTime())) {
    errors.receivedAt = 'Vui lòng chọn ngày giờ nhập hợp lệ.';
  }
  if (form.note.trim().length > 255) errors.note = 'Ghi chú không được vượt quá 255 ký tự.';
  return errors;
}

export function buildReceiptPayload(form) {
  return {
    supplierId: form.supplierId,
    receivedAt: new Date(form.receivedAt).toISOString(),
    note: form.note.trim() || null,
  };
}

export function validateLineForm(form) {
  const errors = {};
  if (!form.productId) errors.productId = 'Vui lòng chọn sản phẩm.';
  if (!form.manufacturerLot.trim()) errors.manufacturerLot = 'Vui lòng nhập số lô sản xuất.';
  if (form.manufacturerLot.trim().length > 50) {
    errors.manufacturerLot = 'Số lô không được vượt quá 50 ký tự.';
  }
  if (!Number.isSafeInteger(Number(form.quantity)) || Number(form.quantity) <= 0) {
    errors.quantity = 'Số lượng phải là số nguyên lớn hơn 0.';
  }
  if (!hasAtMostTwoDecimals(form.unitCost) || Number(form.unitCost) < 0) {
    errors.unitCost = 'Đơn giá phải không âm và có tối đa 2 chữ số thập phân.';
  }
  if (form.manufactureDate && form.expiryDate && form.expiryDate <= form.manufactureDate) {
    errors.expiryDate = 'Hạn sử dụng phải sau ngày sản xuất.';
  }
  return errors;
}

export function buildLinePayload(form) {
  return {
    productId: form.productId,
    manufacturerLot: form.manufacturerLot.trim(),
    manufactureDate: optionalDate(form.manufactureDate),
    expiryDate: optionalDate(form.expiryDate),
    quantity: Number(form.quantity),
    unitCost: Number(form.unitCost),
  };
}
