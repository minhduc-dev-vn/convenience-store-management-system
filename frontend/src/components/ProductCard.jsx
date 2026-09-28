const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function ProductCard({ onView, product, promotions = [] }) {
  return (
    <article className="product-card">
      <div className="product-card__visual" aria-hidden="true">
        <span>{initials(product.name)}</span>
      </div>
      <div className="product-card__body">
        <p className="eyebrow">{product.category.name}</p>
        <h2>{product.name}</h2>
        {promotions.length > 0 && (
          <div className="product-card__promotion" title={promotions.map((promotion) => promotion.name).join(', ')}>
            <span>Ưu đãi</span>
            <strong>{promotions[0].name}</strong>
            {promotions.length > 1 && <small>+{promotions.length - 1} chương trình</small>}
          </div>
        )}
        <div className="product-card__meta">
          <span>{product.unit}</span>
          <strong>{money.format(product.price)}</strong>
        </div>
        <button className="button button--ghost" type="button" onClick={() => onView(product)}>
          Xem chi tiết
        </button>
      </div>
    </article>
  );
}

export default ProductCard;
