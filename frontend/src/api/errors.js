export class ApiError extends Error {
  constructor(message, { code = 'API_ERROR', status = 0, details = null, cause } = {}) {
    super(message, { cause });
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const ERROR_MESSAGES = Object.freeze({
  API_BASE_URL_MISSING: 'Frontend chưa được cấu hình địa chỉ API.',
  ACCOUNT_INACTIVE: 'Tài khoản hiện không hoạt động.',
  ACCOUNT_LOCKED: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản lý.',
  AUTHENTICATION_REQUIRED: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  CURRENT_PASSWORD_INCORRECT: 'Mật khẩu hiện tại không chính xác.',
  CUSTOMER_PROFILE_UNAVAILABLE: 'Hồ sơ khách hàng hiện không khả dụng.',
  DATABASE_UNAVAILABLE: 'Không thể kết nối đến cơ sở dữ liệu.',
  EMPLOYEE_NOT_FOUND: 'Không tìm thấy nhân viên.',
  EMPLOYEE_CONFLICT: 'Số điện thoại hoặc email nhân viên đã được sử dụng.',
  ACCOUNT_NOT_FOUND: 'Không tìm thấy tài khoản.',
  ACCOUNT_OWNER_NOT_FOUND: 'Không tìm thấy chủ sở hữu tài khoản.',
  ACCOUNT_OWNER_INACTIVE: 'Không thể tạo tài khoản cho chủ sở hữu đang ngừng hoạt động.',
  ACCOUNT_CONFLICT: 'Tên đăng nhập hoặc chủ sở hữu đã có tài khoản.',
  INVOICE_NOT_FOUND: 'Không tìm thấy hóa đơn hoặc hóa đơn không thuộc tài khoản này.',
  INVALID_API_RESPONSE: 'Máy chủ trả về dữ liệu không hợp lệ.',
  INVALID_CREDENTIALS: 'Thông tin đăng nhập không chính xác.',
  INVALID_TOKEN: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  NETWORK_ERROR: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối.',
  PROFILE_CONFLICT: 'Email này đã được sử dụng bởi tài khoản khác.',
  REGISTRATION_CONFLICT: 'Số điện thoại hoặc email đã được đăng ký.',
  VALIDATION_ERROR: 'Thông tin gửi lên chưa hợp lệ. Vui lòng kiểm tra lại.',
});

export function getErrorMessage(error) {
  if (error instanceof ApiError) return ERROR_MESSAGES[error.code] ?? error.message;

  return 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.';
}
