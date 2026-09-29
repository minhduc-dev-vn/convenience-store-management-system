function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value ?? 0);
}

function PosCart({ cart, isQuoting, onClear, onQuantityChange, onRemove, quote }) {
  const quotedItems = new Map((quote?.items ?? []).map((item) => [item.productId, item]));

  return (
    <section className="pos-panel pos-cart-panel" aria-labelledby="pos-cart-heading">
      <div className="pos-panel__heading">
        <div>
          <p className="eyebrow">MH-06 · Giỏ hàng tại quầy</p>
          <h2 id="pos-cart-heading">Đơn hàng hiện tại</h2>
        </div>
        <span className="cart-count">{cart.reduce((total, item) => total + item.quantity, 0)} sản phẩm</span>
      </div>

      {cart.length === 0 ? (
        <div className="pos-cart-empty">
          <strong>Giỏ hàng đang trống</strong>
          <span>Sản phẩm được quét hoặc chọn sẽ xuất hiện tại đây.</span>
        </div>
      ) : (
        <div className="pos-cart-lines">
          {cart.map((item, index) => {
            const quoted = quotedItems.get(item.productId);
            return (
              <article className="pos-cart-line" key={item.productId}>
                <span className="pos-cart-line__index">{index + 1}</span>
                <div className="pos-cart-line__product">
                  <strong>{quoted?.name ?? item.name}</strong>
                  <span>{item.productId} · {quoted?.unit ?? item.unit}</span>
                  <small>Tồn khả dụng: {quoted?.availableStock ?? item.availableStock}</small>
                </div>
                <label className="pos-quantity">
                  <span>Số lượng</span>
                  <input
                    aria-label={`Số lượng ${item.name}`}
                    min="1"
                    max={quoted?.availableStock ?? item.availableStock}
                    step="1"
                    type="number"
                    value={item.quantity}
                    onChange={(event) => onQuantityChange(item.productId, event.target.value)}
                  />
                </label>
                <div className="pos-cart-line__money">
                  <small>{quoted ? formatMoney(quoted.unitPrice) : 'Đang xác nhận giá'}</small>
                  <strong>{quoted ? formatMoney(quoted.lineTotal) : '—'}</strong>
                  {quoted?.discountAmount > 0 && <span>Giảm {formatMoney(quoted.discountAmount)}</span>}
                </div>
                <button
                  aria-label={`Xóa ${item.name} khỏi giỏ`}
                  className="pos-remove-button"
                  type="button"
                  onClick={() => onRemove(item.productId)}
                >
                  ×
                </button>
              </article>
            );
          })}
        </div>
      )}

      <div className="pos-cart-footer">
        <button className="button button--ghost" type="button" disabled={cart.length === 0} onClick={onClear}>
          Hủy đơn hàng
        </button>
        <div className="pos-totals" aria-live="polite">
          <span><small>Tạm tính</small><strong>{quote ? formatMoney(quote.totals.subtotal) : '—'}</strong></span>
          <span><small>Tổng ưu đãi</small><strong>{quote ? formatMoney(quote.totals.totalDiscount) : '—'}</strong></span>
          <span className="pos-totals__grand"><small>Tổng thanh toán</small><strong>{quote ? formatMoney(quote.totals.totalAmount) : '—'}</strong></span>
          <em>{isQuoting ? 'Đang xác nhận lại giá và tồn kho…' : 'Số tiền do máy chủ tính và xác nhận.'}</em>
        </div>
      </div>
    </section>
  );
}

export default PosCart;

