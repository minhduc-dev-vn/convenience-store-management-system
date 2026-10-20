const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const dateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export function formatPromotionValue(promotion) {
  return promotion.type === 'PERCENT'
    ? `${promotion.value}%`
    : money.format(promotion.value);
}

function PromotionCard({ compact = false, onView, promotion }) {
  return (
    <article className={`promotion-card${compact ? ' promotion-card--compact' : ''}`}>
      <div className="promotion-card__accent" aria-hidden="true">
        <span>{promotion.type === 'PERCENT' ? '%' : '₫'}</span>
      </div>
      <div className="promotion-card__body">
        <div className="promotion-card__heading">
          <span className="status-badge status-badge--active">Đang diễn ra</span>
          <strong>{formatPromotionValue(promotion)}</strong>
        </div>
        <h2>{promotion.name}</h2>
        <p>
          Đơn tối thiểu {money.format(promotion.minimumOrderValue)}
          {promotion.maximumDiscount != null && ` · Giảm tối đa ${money.format(promotion.maximumDiscount)}`}
        </p>
        <small>Đến {dateTime.format(new Date(promotion.endAt))} · {promotion.products.length} sản phẩm</small>
        {onView && (
          <button className="button button--ghost" type="button" onClick={() => onView(promotion)}>
            Xem chi tiết
          </button>
        )}
      </div>
    </article>
  );
}

export default PromotionCard;
