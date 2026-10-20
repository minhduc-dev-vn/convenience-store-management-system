const PHONE_PATTERN = /^\+?[0-9]{9,15}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPLIER_STATUSES = new Set(['ACTIVE', 'INACTIVE']);

export const EMPTY_SUPPLIER_FORM = Object.freeze({
  supplierId: '',
  name: '',
  phone: '',
  email: '',
  address: '',
  taxCode: '',
  status: 'ACTIVE',
});

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function nullable(value) {
  const valueTrimmed = trimmed(value);
  return valueTrimmed || null;
}

export function validateSupplierForm(form, { editing = false } = {}) {
  const errors = {};
  const supplierId = trimmed(form.supplierId);
  const name = trimmed(form.name);
  const phone = trimmed(form.phone);
  const email = trimmed(form.email);
  const address = trimmed(form.address);
  const taxCode = trimmed(form.taxCode);

  if (!editing && !supplierId) errors.supplierId = 'Vui lòng nhập mã nhà cung cấp.';
  else if (!editing && supplierId.length > 10) errors.supplierId = 'Mã nhà cung cấp tối đa 10 ký tự.';

  if (!name) errors.name = 'Vui lòng nhập tên nhà cung cấp.';
  else if (name.length > 150) errors.name = 'Tên nhà cung cấp tối đa 150 ký tự.';

  if (!phone) errors.phone = 'Vui lòng nhập số điện thoại.';
  else if (!PHONE_PATTERN.test(phone)) {
    errors.phone = 'Số điện thoại gồm 9–15 chữ số và có thể bắt đầu bằng +.';
  }

  if (email.length > 100) errors.email = 'Email tối đa 100 ký tự.';
  else if (email && !EMAIL_PATTERN.test(email)) errors.email = 'Email không đúng định dạng.';

  if (address.length > 255) errors.address = 'Địa chỉ tối đa 255 ký tự.';
  if (taxCode.length > 20) errors.taxCode = 'Mã số thuế tối đa 20 ký tự.';
  if (!editing && !SUPPLIER_STATUSES.has(form.status)) {
    errors.status = 'Trạng thái nhà cung cấp không hợp lệ.';
  }

  return errors;
}

export function buildSupplierPayload(form, { editing = false } = {}) {
  const payload = {
    name: trimmed(form.name),
    phone: trimmed(form.phone),
    email: nullable(form.email),
    address: nullable(form.address),
    taxCode: nullable(form.taxCode),
  };

  if (!editing) {
    payload.supplierId = trimmed(form.supplierId);
    payload.status = form.status;
  }

  return payload;
}

export function supplierToForm(supplier) {
  if (!supplier) return { ...EMPTY_SUPPLIER_FORM };
  return {
    supplierId: supplier.supplierId,
    name: supplier.name,
    phone: supplier.phone,
    email: supplier.email ?? '',
    address: supplier.address ?? '',
    taxCode: supplier.taxCode ?? '',
    status: supplier.status,
  };
}
