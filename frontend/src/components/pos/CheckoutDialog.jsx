import { useEffect, useMemo, useState } from 'react';
import { FormField, Modal, Notice } from '..';
import { calculateCashChange, checkoutOptionsKey, PAYMENT_METHODS } from './checkout';

const PAYMENT_LABELS = Object.freeze({
  CASH: 'Tiền mặt',
  CARD: 'Thẻ',
  TRANSFER: 'Chuyển khoản',
  EWALLET: 'Ví điện tử',
});

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value ?? 0);
}

function CheckoutDialog({
  appliedOptions,
  error,
  invoiceId,
  isQuoting,
  isSubmitting,
  onCancel,
  onConfirm,
  onRefreshQuote,
  promotions,
  promotionsError,
  quote,
}) {
  const [customerPhone, setCustomerPhone] = useState(appliedOptions.customerPhone ?? '');
  const [promotionId, setPromotionId] = useState(appliedOptions.promotionId ?? '');
  const [method, setMethod] = useState('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const [externalTransactionId, setExternalTransactionId] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (method === 'CASH' && cashReceived === '' && quote?.totals?.totalAmount != null) {
      setCashReceived(String(quote.totals.totalAmount));
    }
  }, [cashReceived, method, quote?.totals?.totalAmount]);

  const currentOptions = useMemo(() => ({ customerPhone, promotionId }), [customerPhone, promotionId]);
  const quoteIsCurrent = checkoutOptionsKey(currentOptions) === checkoutOptionsKey(appliedOptions);
  const selectedPromotionInvalid = Boolean(promotionId && quote?.promotion?.eligible !== true);
  let change = 0;
  let cashIsValid = method !== 'CASH';
  if (method === 'CASH' && cashReceived !== '') {
    try {
      change = calculateCashChange(cashReceived, quote?.totals?.totalAmount ?? 0);
      cashIsValid = change >= 0;
    } catch {
      change = 0;
      cashIsValid = false;
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    onConfirm({
      cashReceived,
      customerPhone,
      externalTransactionId,
      method,
      note,
      promotionId,
    });
  }

  return (
    <Modal
      title="Thanh toán hóa đơn"
      description={`Mã giao dịch tạm thời ${invoiceId}`}
      onClose={isSubmitting ? () => {} : onCancel}
      size="large"
    >
      <form className="checkout-form" onSubmit={handleSubmit}>
        <Notice tone="error">{error}</Notice>
        <Notice tone="warning">{promotionsError}</Notice>

        <section className="checkout-section">
          <div className="checkout-section__heading">
            <div><h3>Xác nhận báo giá</h3></div>
            <button
              className="button button--secondary"
              type="button"
              disabled={isQuoting || isSubmitting}
              onClick={() => onRefreshQuote(currentOptions)}
            >
              {isQuoting ? 'Đang tính lại…' : 'Cập nhật báo giá'}
            </button>
          </div>
          <div className="checkout-options-grid">
            <FormField htmlFor="checkout-customer-phone" label="Số điện thoại thành viên" hint="Để trống nếu khách không phải thành viên.">
              <input
                id="checkout-customer-phone"
                inputMode="tel"
                maxLength="15"
                placeholder="Ví dụ: 0901234567"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
              />
            </FormField>
            <FormField htmlFor="checkout-promotion" label="Khuyến mãi" hint="Backend kiểm tra lại điều kiện trước khi thanh toán.">
              <select id="checkout-promotion" value={promotionId} onChange={(event) => setPromotionId(event.target.value)}>
                <option value="">Không áp dụng khuyến mãi</option>
                {promotions.map((promotion) => (
                  <option key={promotion.promotionId} value={promotion.promotionId}>
                    {promotion.name} ({promotion.promotionId})
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          {!quoteIsCurrent && <Notice tone="warning">Hãy cập nhật báo giá sau khi thay đổi khách hàng hoặc khuyến mãi.</Notice>}
          {quoteIsCurrent && quote?.customer && (
            <div className="member-summary">
              <strong>{quote.customer.name}</strong>
              <span>{quote.customer.phone} · Hạng {quote.loyalty?.membershipTier}</span>
              <span>{quote.loyalty?.currentPoints ?? 0} điểm · Dự kiến cộng {quote.loyalty?.pointsEarnedPreview ?? 0} điểm</span>
            </div>
          )}
          {quoteIsCurrent && quote?.promotion && (
            <Notice tone={quote.promotion.eligible ? 'success' : 'warning'}>
              {quote.promotion.eligible
                ? `${quote.promotion.name}: giảm ${formatMoney(quote.promotion.discountAmount)}.`
                : `${quote.promotion.name} chưa đủ điều kiện áp dụng (${quote.promotion.reason}).`}
            </Notice>
          )}
        </section>

        <section className="checkout-section">
          <div className="checkout-section__heading">
            <div><h3>Breakdown từ backend</h3></div>
          </div>
          <div className="checkout-lines">
            {quote.items.map((item) => (
              <div className="checkout-line" key={item.productId}>
                <div><strong>{item.name}</strong><span>{item.quantity} {item.unit} × {formatMoney(item.unitPrice)}</span></div>
                <div><span>{item.discountAmount > 0 ? `Giảm ${formatMoney(item.discountAmount)}` : 'Không giảm'}</span><strong>{formatMoney(item.lineTotal)}</strong></div>
              </div>
            ))}
          </div>
          <dl className="checkout-totals">
            <div><dt>Tạm tính</dt><dd>{formatMoney(quote.totals.subtotal)}</dd></div>
            <div><dt>Tổng ưu đãi</dt><dd>-{formatMoney(quote.totals.totalDiscount)}</dd></div>
            <div><dt>Tổng thanh toán</dt><dd>{formatMoney(quote.totals.totalAmount)}</dd></div>
          </dl>
        </section>

        <section className="checkout-section">
          <div className="checkout-section__heading">
            <div><h3>Ghi nhận thanh toán</h3></div>
          </div>
          <div className="payment-methods" role="radiogroup" aria-label="Phương thức thanh toán">
            {PAYMENT_METHODS.map((value) => (
              <label key={value} className={method === value ? 'payment-method active' : 'payment-method'}>
                <input type="radio" name="paymentMethod" value={value} checked={method === value} onChange={() => setMethod(value)} />
                <span>{PAYMENT_LABELS[value]}</span>
              </label>
            ))}
          </div>
          {method === 'CASH' ? (
            <div className="cash-payment-grid">
              <FormField htmlFor="cash-received" label="Tiền khách đưa" required error={!cashIsValid ? 'Tiền khách đưa chưa đủ.' : ''}>
                <input id="cash-received" min="0" step="1000" type="number" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} />
              </FormField>
              <div className="cash-change"><span>Tiền trả lại</span><strong>{formatMoney(Math.max(change, 0))}</strong></div>
            </div>
          ) : (
            <FormField htmlFor="external-transaction-id" label="Mã tham chiếu mô phỏng" hint="Không kết nối cổng thanh toán thật.">
              <input id="external-transaction-id" maxLength="100" value={externalTransactionId} onChange={(event) => setExternalTransactionId(event.target.value)} />
            </FormField>
          )}
          <FormField htmlFor="checkout-note" label="Ghi chú hóa đơn">
            <textarea id="checkout-note" maxLength="255" rows="2" value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
        </section>

        <div className="modal__actions checkout-actions">
          <button className="button button--ghost" type="button" disabled={isSubmitting} onClick={onCancel}>Quay lại POS</button>
          <button
            className="button button--primary button--large"
            type="submit"
            disabled={isSubmitting || isQuoting || !quoteIsCurrent || selectedPromotionInvalid || !cashIsValid}
          >
            {isSubmitting ? 'Đang hoàn tất…' : `Xác nhận ${formatMoney(quote.totals.totalAmount)}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default CheckoutDialog;
