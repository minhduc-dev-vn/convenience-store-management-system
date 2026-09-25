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
  DATABASE_UNAVAILABLE: 'Không thể kết nối đến cơ sở dữ liệu.',
  INVALID_API_RESPONSE: 'Máy chủ trả về dữ liệu không hợp lệ.',
  NETWORK_ERROR: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối.',
});

export function getErrorMessage(error) {
  if (error instanceof ApiError) return ERROR_MESSAGES[error.code] ?? error.message;

  return 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.';
}
