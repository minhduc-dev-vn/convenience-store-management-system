export const PAYMENT_METHODS = Object.freeze(['CASH', 'CARD', 'TRANSFER', 'EWALLET']);

function normalizeOptionalText(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeMoney(value, fieldName) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`${fieldName} phải là số không âm.`);
  }
  if (Math.abs((amount * 100) - Math.round(amount * 100)) > Number.EPSILON * 100) {
    throw new RangeError(`${fieldName} chỉ được có tối đa 2 chữ số thập phân.`);
  }
  return amount;
}

export function createInvoiceId(now = Date.now(), randomValue = Math.random()) {
  const timestamp = Math.max(0, Math.trunc(Number(now))).toString(36).toUpperCase();
  const random = Math.floor(Math.max(0, Math.min(Number(randomValue), 0.999999)) * 46_656)
    .toString(36)
    .toUpperCase()
    .padStart(3, '0');
  return `HD${timestamp}${random}`.slice(0, 15);
}

export function calculateCashChange(cashReceived, totalAmount) {
  const received = normalizeMoney(cashReceived, 'Tiền khách đưa');
  const total = normalizeMoney(totalAmount, 'Tổng thanh toán');
  return Math.round((received - total) * 100) / 100;
}

export function checkoutOptionsKey({ customerPhone = '', promotionId = '' } = {}) {
  return `${String(customerPhone).trim()}::${String(promotionId).trim()}`;
}

export function buildCheckoutPayload({
  cart,
  customerPhone,
  externalTransactionId,
  invoiceId,
  method,
  note,
  promotionId,
  quote,
  cashReceived,
}) {
  if (!invoiceId || typeof invoiceId !== 'string' || invoiceId.length > 15) {
    throw new RangeError('Mã hóa đơn không hợp lệ.');
  }
  if (!PAYMENT_METHODS.includes(method)) {
    throw new RangeError('Phương thức thanh toán không hợp lệ.');
  }
  if (!Array.isArray(cart) || cart.length === 0) {
    throw new RangeError('Giỏ hàng cần ít nhất một sản phẩm.');
  }
  const totalAmount = normalizeMoney(quote?.totals?.totalAmount, 'Tổng thanh toán');
  if (totalAmount <= 0) throw new RangeError('Tổng thanh toán phải lớn hơn 0.');
  if (method === 'CASH' && calculateCashChange(cashReceived, totalAmount) < 0) {
    throw new RangeError('Tiền khách đưa chưa đủ để thanh toán.');
  }

  const payload = {
    invoiceId,
    items: cart.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    payment: {
      amount: totalAmount,
      method,
    },
  };
  const normalizedPhone = normalizeOptionalText(customerPhone);
  const normalizedPromotion = normalizeOptionalText(promotionId);
  const normalizedNote = normalizeOptionalText(note);
  const normalizedReference = normalizeOptionalText(externalTransactionId);
  if (normalizedPhone) payload.customerPhone = normalizedPhone;
  if (normalizedPromotion) payload.promotionId = normalizedPromotion;
  if (normalizedNote) payload.note = normalizedNote;
  if (normalizedReference && method !== 'CASH') {
    payload.payment.externalTransactionId = normalizedReference;
  }
  return payload;
}

