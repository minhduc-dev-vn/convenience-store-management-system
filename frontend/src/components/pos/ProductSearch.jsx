import { FormField, Pagination } from '..';

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value ?? 0);
}

function ProductSearch({
  inputRef,
  isLoading,
  onAdd,
  onPageChange,
  onSearch,
  page,
  products,
  query,
  setQuery,
  totalPages,
}) {
  function handleSubmit(event) {
    event.preventDefault();
    onSearch(query, { barcodeFirst: true });
  }

  return (
    <section className="pos-panel pos-product-panel" aria-labelledby="pos-product-heading">
      <div className="pos-panel__heading">
        <div>
          <h2 id="pos-product-heading">Chọn sản phẩm</h2>
        </div>
        <span className="keyboard-hint">Enter để quét nhanh</span>
      </div>

      <form className="pos-search" onSubmit={handleSubmit}>
        <FormField
          htmlFor="pos-product-query"
          label="Mã vạch, mã hoặc tên sản phẩm"
          hint="Đặt con trỏ tại đây khi dùng máy quét mã vạch."
        >
          <input
            ref={inputRef}
            id="pos-product-query"
            autoComplete="off"
            inputMode="search"
            placeholder="Quét mã hoặc nhập từ khóa…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </FormField>
        <button className="button button--primary" type="submit" disabled={isLoading || !query.trim()}>
          {isLoading ? 'Đang tìm…' : 'Tìm sản phẩm'}
        </button>
      </form>

      {products.length > 0 ? (
        <div className="pos-product-results" aria-live="polite">
          {products.map((product) => (
            <article className="pos-product-result" key={product.productId}>
              <div>
                <strong>{product.name}</strong>
                <span>{product.productId} · {product.barcode || 'Không mã vạch'}</span>
                <small>{product.category?.name} · Còn {product.availableStock} {product.unit}</small>
              </div>
              <div className="pos-product-result__action">
                <strong>{formatMoney(product.price)}</strong>
                <button className="button button--secondary" type="button" onClick={() => onAdd(product)}>
                  Thêm
                </button>
              </div>
            </article>
          ))}
          <Pagination
            disabled={isLoading}
            page={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </div>
      ) : (
        <p className="pos-search-placeholder">Quét mã vạch hoặc tìm theo mã/tên để bắt đầu.</p>
      )}
    </section>
  );
}

export default ProductSearch;

