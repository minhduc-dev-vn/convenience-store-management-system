export const EMPLOYEE_ROLES = Object.freeze(['CASHIER', 'WAREHOUSE', 'MANAGER']);

export const EMPTY_EMPLOYEE_FORM = Object.freeze({
  fullName: '',
  gender: '',
  dateOfBirth: '',
  phone: '',
  email: '',
  address: '',
  startDate: '',
  baseSalary: '',
  status: 'ACTIVE',
});

export const EMPTY_ACCOUNT_FORM = Object.freeze({
  ownerType: 'EMPLOYEE',
  ownerId: '',
  username: '',
  role: 'CASHIER',
  password: '',
  passwordConfirmation: '',
});

function cleanOptional(value) {
  const normalized = typeof value === 'string' ? value.trim() : value;
  return normalized === '' ? null : normalized;
}

export function employeeToForm(employee) {
  return {
    ...EMPTY_EMPLOYEE_FORM,
    ...employee,
    baseSalary: employee?.baseSalary ?? '',
    dateOfBirth: employee?.dateOfBirth?.slice(0, 10) ?? '',
    startDate: employee?.startDate?.slice(0, 10) ?? '',
  };
}

export function validateEmployeeForm(form) {
  const errors = {};
  const today = new Date().toISOString().slice(0, 10);
  if (!form.fullName.trim()) errors.fullName = 'Vui lòng nhập họ tên.';
  if (!form.phone.trim()) errors.phone = 'Vui lòng nhập số điện thoại.';
  else if (!/^\+?[0-9]{9,15}$/.test(form.phone.trim())) errors.phone = 'Số điện thoại cần 9–15 chữ số và có thể bắt đầu bằng +.';
  if (form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Email chưa đúng định dạng.';
  if (form.baseSalary !== '' && Number(form.baseSalary) < 0) errors.baseSalary = 'Lương cơ bản không được âm.';
  if (!form.startDate) errors.startDate = 'Vui lòng chọn ngày bắt đầu.';
  else if (form.startDate > today) errors.startDate = 'Ngày bắt đầu không được ở tương lai.';
  if (form.dateOfBirth && form.dateOfBirth > today) errors.dateOfBirth = 'Ngày sinh không được ở tương lai.';
  if (form.dateOfBirth && form.startDate && form.dateOfBirth > form.startDate) {
    errors.startDate = 'Ngày bắt đầu phải sau ngày sinh.';
  }
  return errors;
}

export function buildEmployeePayload(form) {
  return {
    fullName: form.fullName.trim(),
    dateOfBirth: cleanOptional(form.dateOfBirth),
    gender: cleanOptional(form.gender),
    phone: form.phone.trim(),
    email: cleanOptional(form.email),
    address: cleanOptional(form.address),
    startDate: cleanOptional(form.startDate),
    baseSalary: form.baseSalary === '' ? 0 : Number(form.baseSalary),
    status: form.status,
  };
}

export function validateAccountForm(form) {
  const errors = {};
  if (!form.ownerId.trim()) errors.ownerId = 'Vui lòng nhập mã chủ sở hữu.';
  if (!form.username.trim()) errors.username = 'Vui lòng nhập tên đăng nhập.';
  if (!form.password || form.password.length < 6) errors.password = 'Mật khẩu cần ít nhất 6 ký tự.';
  if (form.password !== form.passwordConfirmation) errors.passwordConfirmation = 'Mật khẩu xác nhận không khớp.';
  if (form.ownerType === 'CUSTOMER' && form.role !== 'CUSTOMER') errors.role = 'Tài khoản khách hàng chỉ dùng role CUSTOMER.';
  if (form.ownerType === 'EMPLOYEE' && !EMPLOYEE_ROLES.includes(form.role)) errors.role = 'Role nhân viên không hợp lệ.';
  return errors;
}

export function buildAccountPayload(form) {
  return {
    ownerType: form.ownerType,
    ownerId: form.ownerId.trim(),
    username: form.username.trim(),
    role: form.role,
    password: form.password,
    passwordConfirmation: form.passwordConfirmation,
  };
}

export function validateResetPasswordForm(form) {
  const errors = {};
  if (!form.newPassword || form.newPassword.length < 6) errors.newPassword = 'Mật khẩu mới cần ít nhất 6 ký tự.';
  if (form.newPassword !== form.newPasswordConfirmation) errors.newPasswordConfirmation = 'Mật khẩu xác nhận không khớp.';
  return errors;
}
