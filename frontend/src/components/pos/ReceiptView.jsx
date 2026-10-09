function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value ?? 0);
}

function formatDateTime(value) {
  return value
    ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '—';
}

const PAYMENT_LABELS = Object.freeze({
  CASH: 'Tiền mặt',
  CARD: 'Thẻ',
  TRANSFER: 'Chuyển khoản',
  EWALLET: 'Ví điện tử',
});

function ReceiptView({ onNewOrder, onPrint, receipt }) {
  return (
    <section className="receipt-screen">
      <div className="receipt-actions no-print">
        <div><h2>Hóa đơn đã được lưu</h2></div>
        <div className="inline-actions">
          <button className="button button--secondary" type="button" onClick={onPrint}>In hóa đơn</button>
          <button className="button button--primary" type="button" onClick={onNewOrder}>Đơn hàng mới</button>
        </div>
      </div>

      <article className="receipt-print-area">
        <header className="receipt-header">
          <h1>{receipt.invoiceId}</h1>
          <span className="status-badge status-badge--active">{receipt.status}</span>
        </header>
        <dl className="receipt-meta">
          <div><dt>Thời gian</dt><dd>{formatDateTime(receipt.issuedAt)}</dd></div>
          <div><dt>Thu ngân</dt><dd>{receipt.cashier?.name || receipt.cashier?.employeeId}</dd></div>
          <div><dt>Ca làm việc</dt><dd>#{receipt.shiftId}</dd></div>
          <div><dt>Khách hàng</dt><dd>{receipt.customer ? `${receipt.customer.name} · ${receipt.customer.phone}` : 'Khách lẻ'}</dd></div>
        </dl>

        <div className="receipt-lines" role="table" aria-label="Chi tiết hóa đơn">
          <div className="receipt-line receipt-line--header" role="row">
            <span>Sản phẩm</span><span>SL</span><span>Đơn giá</span><span>Giảm</span><span>Thành tiền</span>
          </div>
          {receipt.items.map((item) => (
            <div className="receipt-line" role="row" key={item.lineId}>
              <span><strong>{item.name}</strong><small>{item.productId} · {item.unit}</small></span>
              <span>{item.quantity}</span>
              <span>{formatMoney(item.unitPrice)}</span>
              <span>{formatMoney(item.discountAmount)}</span>
              <span>{formatMoney(item.lineTotal)}</span>
            </div>
          ))}
        </div>

        <dl className="receipt-totals">
          <div><dt>Tạm tính</dt><dd>{formatMoney(receipt.totals.subtotal)}</dd></div>
          <div><dt>Tổng giảm</dt><dd>-{formatMoney(receipt.totals.totalDiscount)}</dd></div>
          <div><dt>Tổng thanh toán</dt><dd>{formatMoney(receipt.totals.totalAmount)}</dd></div>
        </dl>

        <div className="receipt-payment">
          <div><span>Phương thức</span><strong>{PAYMENT_LABELS[receipt.payment?.method] ?? receipt.payment?.method}</strong></div>
          <div><span>Trạng thái</span><strong>{receipt.payment?.status}</strong></div>
          <div><span>Số tiền</span><strong>{formatMoney(receipt.payment?.amount)}</strong></div>
          {receipt.payment?.externalTransactionId && <div><span>Mã tham chiếu</span><strong>{receipt.payment.externalTransactionId}</strong></div>}
        </div>

        {receipt.loyalty && (
          <p className="receipt-loyalty">Điểm cộng từ hóa đơn: <strong>{receipt.loyalty.pointsEarned}</strong></p>
        )}
        {receipt.note && <p className="receipt-note">Ghi chú: {receipt.note}</p>}
        <footer className="receipt-footer">Cảm ơn quý khách và hẹn gặp lại.</footer>
      </article>
    </section>
  );
}

export default ReceiptView;

