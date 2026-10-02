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
  PRODUCT_NOT_SELLABLE: 'Sản phẩm không còn khả dụng để bán.',
  PRODUCT_NOT_AVAILABLE: 'Sản phẩm hiện không khả dụng để bán.',
  PRODUCT_PRICE_INVALID: 'Giá bán hiện tại của sản phẩm không hợp lệ.',
  INSUFFICIENT_STOCK: 'Tồn khả dụng không đủ cho số lượng đã chọn.',
  SHIFT_REQUIRED: 'Bạn cần mở ca làm việc trước khi sử dụng POS.',
  SHIFT_ALREADY_OPEN: 'Tài khoản thu ngân đã có một ca OPEN.',
  CASHIER_UNAVAILABLE: 'Tài khoản hoặc hồ sơ thu ngân hiện không hoạt động.',
  QUOTE_CHANGED_RETRY: 'Giá, khuyến mãi hoặc tồn kho vừa thay đổi. Vui lòng kiểm tra lại đơn hàng.',
  QUOTE_DATA_INVALID: 'Máy chủ không thể xác nhận dữ liệu báo giá.',
  CUSTOMER_MEMBER_NOT_FOUND: 'Không tìm thấy khách hàng thành viên đang hoạt động với số điện thoại này.',
  PROMOTION_NOT_APPLICABLE: 'Chương trình khuyến mãi không còn phù hợp với đơn hàng.',
  PAYMENT_AMOUNT_MISMATCH: 'Số tiền thanh toán không còn khớp tổng hóa đơn. Vui lòng tính lại.',
  CHECKOUT_ID_CONFLICT: 'Mã hóa đơn đã được dùng cho một giao dịch khác.',
  CHECKOUT_TOTAL_CHANGED: 'Tổng thanh toán vừa thay đổi. Vui lòng kiểm tra lại báo giá.',
  CHECKOUT_TOTAL_INVALID: 'Tổng thanh toán không hợp lệ.',
  INVENTORY_CHANGED_RETRY: 'Tồn kho vừa thay đổi. Vui lòng kiểm tra lại đơn hàng.',
  CHECKOUT_RECEIPT_UNAVAILABLE: 'Giao dịch đã xử lý nhưng chưa thể tải lại hóa đơn.',
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
