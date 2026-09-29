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
  CUSTOMER_NOT_FOUND: 'Không tìm thấy khách hàng.',
  CUSTOMER_ACCOUNT_NOT_FOUND: 'Khách hàng chưa có tài khoản phù hợp để thực hiện thao tác.',
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
  PRODUCT_NOT_FOUND: 'Không tìm thấy sản phẩm.',
  PRODUCT_ID_CONFLICT: 'Mã sản phẩm đã được sử dụng.',
  PRODUCT_BARCODE_CONFLICT: 'Mã vạch đã được sử dụng cho sản phẩm khác.',
  PRODUCT_CONFLICT: 'Mã sản phẩm hoặc mã vạch đã được sử dụng.',
  PROMOTION_NOT_FOUND: 'Không tìm thấy chương trình khuyến mãi phù hợp.',
  PROMOTION_ID_CONFLICT: 'Mã chương trình khuyến mãi đã được sử dụng.',
  SUPPLIER_NOT_FOUND: 'Không tìm thấy nhà cung cấp.',
  SUPPLIER_ID_CONFLICT: 'Mã nhà cung cấp đã được sử dụng.',
  SUPPLIER_PHONE_CONFLICT: 'Số điện thoại nhà cung cấp đã được sử dụng.',
  SUPPLIER_TAX_CODE_CONFLICT: 'Mã số thuế nhà cung cấp đã được sử dụng.',
  SUPPLIER_CONFLICT: 'Mã, số điện thoại hoặc mã số thuế nhà cung cấp đã được sử dụng.',
  CATEGORY_NOT_FOUND: 'Không tìm thấy loại sản phẩm.',
  CATEGORY_INACTIVE: 'Loại sản phẩm đang ngừng hoạt động.',
  CATEGORY_ID_CONFLICT: 'Mã loại sản phẩm đã được sử dụng.',
  CATEGORY_NAME_CONFLICT: 'Tên loại sản phẩm đã được sử dụng.',
  CATEGORY_CONFLICT: 'Mã hoặc tên loại sản phẩm đã được sử dụng.',
  REGISTRATION_CONFLICT: 'Số điện thoại hoặc email đã được đăng ký.',
  RECEIPT_NOT_FOUND: 'Không tìm thấy phiếu nhập.',
  RECEIPT_NOT_DRAFT: 'Chỉ phiếu nhập DRAFT mới có thể chỉnh sửa hoặc xử lý.',
  RECEIPT_LINE_NOT_FOUND: 'Không tìm thấy dòng hàng trong phiếu nhập.',
  RECEIPT_LINE_CONFLICT: 'Lô hàng này đã có trong phiếu nhập.',
  RECEIPT_ALREADY_CONFIRMED: 'Phiếu nhập đã được xác nhận trước đó.',
  RECEIPT_IMPORT_CONFLICT: 'Phiếu nhập đã có giao dịch nhập kho.',
  RECEIPT_EMPTY: 'Phiếu nhập cần ít nhất một dòng hàng trước khi xác nhận.',
  RECEIPT_INVALID_LINE: 'Phiếu nhập có dòng hàng không hợp lệ. Vui lòng kiểm tra lại.',
  RECEIVING_CONFLICT: 'Thông tin phiếu nhập hoặc lô hàng bị trùng.',
  LOT_CONFLICT: 'Thông tin sản phẩm, số lô hoặc ngày của lô không khớp dữ liệu hiện có.',
  LOT_DEFINITION_LOCKED: 'Không thể thay đổi thông tin của lô đã được sử dụng.',
  LOT_INVENTORY_OVERFLOW: 'Số lượng nhập vượt giới hạn tồn kho cho phép.',
  VALIDATION_ERROR: 'Thông tin gửi lên chưa hợp lệ. Vui lòng kiểm tra lại.',
});

export function getErrorMessage(error) {
  if (error instanceof ApiError) return ERROR_MESSAGES[error.code] ?? error.message;

  return 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.';
}
