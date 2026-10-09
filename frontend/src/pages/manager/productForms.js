export const EMPTY_PRODUCT_FORM = Object.freeze({
  productId: '',
  name: '',
  barcode: '',
  unit: '',
  price: '',
  imageUrl: '',
  minimumStock: '0',
  categoryId: '',
  status: 'ACTIVE',
});

export const EMPTY_CATEGORY_FORM = Object.freeze({
  categoryId: '',
  name: '',
  description: '',
  status: 'ACTIVE',
});

export const EMPTY_PRICE_FORM = Object.freeze({ newPrice: '', reason: '' });

function optionalText(value) {
  const normalized = typeof value === 'string' ? value.trim() : value;
  return normalized === '' ? null : normalized;
}

function hasAtMostTwoDecimals(value) {
  return /^\d+(?:\.\d{1,2})?$/.test(String(value));
}

export function isValidProductImageUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return true;
  if (!/^https?:\/\//i.test(value.trim())) return false;
  try {
    const parsedUrl = new URL(value.trim());
    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

export function productToForm(product) {
  return {
    ...EMPTY_PRODUCT_FORM,
    productId: product?.productId ?? '',
    name: product?.name ?? '',
    barcode: product?.barcode ?? '',
    unit: product?.unit ?? '',
    price: product?.price ?? '',
    imageUrl: product?.imageUrl ?? '',
    minimumStock: product?.minimumStock ?? '0',
    categoryId: product?.category?.categoryId ?? '',
    status: product?.status ?? 'ACTIVE',
  };
}

export function validateProductForm(form, { editing = false } = {}) {
  const errors = {};
  if (!editing && !form.productId.trim()) errors.productId = 'Vui lòng nhập mã sản phẩm.';
  if (!form.name.trim()) errors.name = 'Vui lòng nhập tên sản phẩm.';
  if (!form.unit.trim()) errors.unit = 'Vui lòng nhập đơn vị tính.';
  if (!form.categoryId) errors.categoryId = 'Vui lòng chọn loại sản phẩm.';
  if (!Number.isSafeInteger(Number(form.minimumStock)) || Number(form.minimumStock) < 0) {
    errors.minimumStock = 'Tồn tối thiểu phải là số nguyên không âm.';
  }
  if (!editing) {
    if (!hasAtMostTwoDecimals(form.price) || Number(form.price) <= 0) {
      errors.price = 'Giá bán phải lớn hơn 0 và có tối đa 2 chữ số thập phân.';
    }
  }
  if (typeof form.imageUrl === 'string' && form.imageUrl.trim().length > 500) {
    errors.imageUrl = 'URL hình ảnh không được vượt quá 500 ký tự.';
  } else if (!isValidProductImageUrl(form.imageUrl)) {
    errors.imageUrl = 'URL hình ảnh phải sử dụng giao thức HTTP hoặc HTTPS.';
  }
  return errors;
}

export function buildProductPayload(form, { editing = false } = {}) {
  const payload = {
    name: form.name.trim(),
    barcode: optionalText(form.barcode),
    unit: form.unit.trim(),
    imageUrl: optionalText(form.imageUrl ?? ''),
    minimumStock: Number(form.minimumStock),
    categoryId: form.categoryId,
  };
  if (!editing) {
    payload.productId = form.productId.trim();
    payload.price = Number(form.price);
    payload.status = form.status;
  }
  return payload;
}

export function categoryToForm(category) {
  return {
    ...EMPTY_CATEGORY_FORM,
    categoryId: category?.categoryId ?? '',
    name: category?.name ?? '',
    description: category?.description ?? '',
    status: category?.status ?? 'ACTIVE',
  };
}

export function validateCategoryForm(form, { editing = false } = {}) {
  const errors = {};
  if (!editing && !form.categoryId.trim()) errors.categoryId = 'Vui lòng nhập mã loại.';
  if (!form.name.trim()) errors.name = 'Vui lòng nhập tên loại sản phẩm.';
  return errors;
}

export function buildCategoryPayload(form, { editing = false } = {}) {
  const payload = {
    name: form.name.trim(),
    description: optionalText(form.description),
  };
  if (!editing) {
    payload.categoryId = form.categoryId.trim();
    payload.status = form.status;
  }
  return payload;
}

export function validatePriceForm(form, currentPrice) {
  const errors = {};
  if (!hasAtMostTwoDecimals(form.newPrice) || Number(form.newPrice) <= 0) {
    errors.newPrice = 'Giá mới phải lớn hơn 0 và có tối đa 2 chữ số thập phân.';
  } else if (Number(form.newPrice) === Number(currentPrice)) {
    errors.newPrice = 'Giá mới phải khác giá hiện tại.';
  }
  if (!form.reason.trim()) errors.reason = 'Vui lòng nhập lý do đổi giá.';
  return errors;
}

export function buildPricePayload(form) {
  return { newPrice: Number(form.newPrice), reason: form.reason.trim() };
}
