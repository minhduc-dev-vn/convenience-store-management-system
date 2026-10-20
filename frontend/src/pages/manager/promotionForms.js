export const EMPTY_PROMOTION_FORM = Object.freeze({
  promotionId: '',
  name: '',
  type: 'PERCENT',
  value: '',
  minimumOrderValue: '0',
  maximumDiscount: '',
  startAt: '',
  endAt: '',
  status: 'ACTIVE',
  productIds: [],
});

function toLocalDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function isValidMoney(value, { allowZero = false } = {}) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value))) return false;
  return allowZero ? Number(value) >= 0 : Number(value) > 0;
}

export function promotionToForm(promotion) {
  return {
    ...EMPTY_PROMOTION_FORM,
    promotionId: promotion?.promotionId ?? '',
    name: promotion?.name ?? '',
    type: promotion?.type ?? 'PERCENT',
    value: promotion?.value ?? '',
    minimumOrderValue: promotion?.minimumOrderValue ?? '0',
    maximumDiscount: promotion?.maximumDiscount ?? '',
    startAt: toLocalDateTimeInput(promotion?.startAt),
    endAt: toLocalDateTimeInput(promotion?.endAt),
    status: promotion?.status ?? 'ACTIVE',
    productIds: promotion?.products?.map((product) => product.productId) ?? [],
  };
}

export function validatePromotionForm(form, { editing = false } = {}) {
  const errors = {};
  if (!editing && !form.promotionId.trim()) errors.promotionId = 'Vui lòng nhập mã khuyến mãi.';
  if (!form.name.trim()) errors.name = 'Vui lòng nhập tên chương trình.';
  if (!['PERCENT', 'AMOUNT'].includes(form.type)) errors.type = 'Hình thức ưu đãi không hợp lệ.';
  if (!isValidMoney(form.value)) {
    errors.value = 'Mức ưu đãi phải lớn hơn 0 và có tối đa 2 chữ số thập phân.';
  } else if (form.type === 'PERCENT' && Number(form.value) > 100) {
    errors.value = 'Mức ưu đãi phần trăm không được vượt quá 100.';
  }
  if (!isValidMoney(form.minimumOrderValue, { allowZero: true })) {
    errors.minimumOrderValue = 'Giá trị đơn tối thiểu phải là số không âm.';
  }
  if (form.type === 'PERCENT' && form.maximumDiscount !== '' && !isValidMoney(form.maximumDiscount)) {
    errors.maximumDiscount = 'Mức giảm tối đa phải lớn hơn 0.';
  }
  if (!form.startAt) errors.startAt = 'Vui lòng chọn thời gian bắt đầu.';
  if (!form.endAt) errors.endAt = 'Vui lòng chọn thời gian kết thúc.';
  if (form.startAt && form.endAt && new Date(form.endAt) <= new Date(form.startAt)) {
    errors.endAt = 'Thời gian kết thúc phải sau thời gian bắt đầu.';
  }
  if (!Array.isArray(form.productIds) || form.productIds.length === 0) {
    errors.productIds = 'Vui lòng chọn ít nhất một sản phẩm.';
  } else if (form.productIds.length > 100) {
    errors.productIds = 'Mỗi chương trình hỗ trợ tối đa 100 sản phẩm.';
  }
  return errors;
}

export function buildPromotionPayload(form, { editing = false } = {}) {
  const payload = {
    name: form.name.trim(),
    type: form.type,
    value: Number(form.value),
    minimumOrderValue: Number(form.minimumOrderValue),
    maximumDiscount: form.type === 'PERCENT' && form.maximumDiscount !== ''
      ? Number(form.maximumDiscount)
      : null,
    startAt: new Date(form.startAt).toISOString(),
    endAt: new Date(form.endAt).toISOString(),
    productIds: [...new Set(form.productIds)],
  };
  if (!editing) {
    payload.promotionId = form.promotionId.trim();
    payload.status = form.status;
  }
  return payload;
}
