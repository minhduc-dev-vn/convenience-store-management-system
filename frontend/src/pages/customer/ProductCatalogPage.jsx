import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AsyncContent, FormField, Modal, PageHeader, Pagination, ProductCard, PromotionCard } from '../../components';
import {
  getPublicProduct,
  listPublicCategories,
  listPublicProducts,
} from '../../services/product.service';
import { listPublicPromotions } from '../../services/promotion.service';

const PAGE_SIZE = 12;
const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

function ProductCatalogPage() {
  const [filters, setFilters] = useState({ search: '', categoryId: '' });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', categoryId: '' });
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [categories, setCategories] = useState({ data: [], error: null });
  const [promotionReloadKey, setPromotionReloadKey] = useState(0);
  const [promotions, setPromotions] = useState({ data: [], error: null, isLoading: true });
  const [detail, setDetail] = useState({ data: null, error: null, isLoading: false });

  const loadProducts = useCallback(async (signal) => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await listPublicProducts(
        { ...appliedFilters, page, pageSize: PAGE_SIZE },
        { signal },
      );
      setState({ data, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setState({ data: null, error, isLoading: false });
    }
  }, [appliedFilters, page, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    loadProducts(controller.signal);
    return () => controller.abort();
  }, [loadProducts]);

  useEffect(() => {
    const controller = new AbortController();
    listPublicCategories({ signal: controller.signal })
      .then((data) => setCategories({ data, error: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') setCategories({ data: [], error });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setPromotions((current) => ({ ...current, error: null, isLoading: true }));
    listPublicPromotions({}, { signal: controller.signal })
      .then((data) => setPromotions({ data, error: null, isLoading: false }))
      .catch((error) => {
        if (error.name !== 'AbortError') setPromotions({ data: [], error, isLoading: false });
      });
    return () => controller.abort();
  }, [promotionReloadKey]);

  const promotionsByProduct = useMemo(() => {
    const mapping = new Map();
    for (const promotion of promotions.data) {
      for (const product of promotion.products) {
        const current = mapping.get(product.productId) ?? [];
        mapping.set(product.productId, [...current, promotion]);
      }
    }
    return mapping;
  }, [promotions.data]);

  const openDetail = async (product) => {
    setDetail({ data: product, error: null, isLoading: true });
    try {
      const data = await getPublicProduct(product.productId);
      setDetail({ data, error: null, isLoading: false });
    } catch (error) {
      setDetail({ data: product, error, isLoading: false });
    }
  };

  const submitFilters = (event) => {
    event.preventDefault();
    setPage(1);
    setAppliedFilters(filters);
  };

  const resetFilters = () => {
    const cleared = { search: '', categoryId: '' };
    setFilters(cleared);
    setAppliedFilters(cleared);
    setPage(1);
  };

  const pagination = state.data?.pagination ?? { page, totalPages: 0 };

  return (
    <section className="workspace-page catalog-page">
      <PageHeader
        title="Danh mục sản phẩm"
        description="Tra cứu sản phẩm đang kinh doanh và giá bán công khai. Bạn không cần đăng nhập để sử dụng trang này."
      />

      <section className="promotion-highlights" aria-labelledby="promotion-highlights-title">
        <div className="section-heading">
          <div>
            <h2 id="promotion-highlights-title">Khuyến mãi hiện hành</h2>
          </div>
          <Link className="button button--ghost" to="/promotions">Xem tất cả ưu đãi</Link>
        </div>
        <AsyncContent
          error={promotions.error}
          isLoading={promotions.isLoading}
          loadingMessage="Đang tải ưu đãi hiện hành…"
          onRetry={() => setPromotionReloadKey((value) => value + 1)}
          isEmpty={promotions.data.length === 0}
          emptyTitle="Chưa có ưu đãi đang diễn ra"
          emptyMessage="Danh mục sản phẩm vẫn sẵn sàng để tra cứu."
        >
          <div className="promotion-grid promotion-grid--highlights">
            {promotions.data.slice(0, 4).map((promotion) => (
              <PromotionCard key={promotion.promotionId} compact promotion={promotion} />
            ))}
          </div>
        </AsyncContent>
      </section>

      <form className="filter-bar catalog-filter" onSubmit={submitFilters}>
        <FormField htmlFor="catalogSearch" label="Tên hoặc mã sản phẩm">
          <input
            id="catalogSearch"
            type="search"
            placeholder="Nhập tên hoặc mã sản phẩm"
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          />
        </FormField>
        <FormField htmlFor="catalogCategory" label="Loại sản phẩm">
          <select
            id="catalogCategory"
            value={filters.categoryId}
            onChange={(event) => setFilters((current) => ({ ...current, categoryId: event.target.value }))}
          >
            <option value="">Tất cả loại</option>
            {categories.data.map((category) => (
              <option key={category.categoryId} value={category.categoryId}>{category.name}</option>
            ))}
          </select>
        </FormField>
        <div className="inline-actions">
          <button className="button button--primary" type="submit">Tìm kiếm</button>
          <button className="button button--ghost" type="button" onClick={resetFilters}>Đặt lại</button>
        </div>
      </form>

      {categories.error && <p className="form-note">Không thể tải bộ lọc loại sản phẩm; danh mục sản phẩm vẫn có thể tra cứu.</p>}

      <AsyncContent
        error={state.error}
        isLoading={state.isLoading}
        loadingMessage="Đang tải danh mục sản phẩm…"
        onRetry={() => setReloadKey((value) => value + 1)}
        isEmpty={state.data?.items.length === 0}
        emptyTitle="Không tìm thấy sản phẩm"
        emptyMessage="Hãy thử từ khóa khác hoặc bỏ bộ lọc loại sản phẩm."
      >
        {state.data?.items.length > 0 && (
          <>
            <div className="product-grid">
              {state.data.items.map((product) => (
                <ProductCard
                  key={product.productId}
                  product={product}
                  promotions={promotionsByProduct.get(product.productId) ?? []}
                  onView={openDetail}
                />
              ))}
            </div>
            <Pagination
              disabled={state.isLoading}
              page={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </AsyncContent>

      {detail.data && (
        <Modal
          title={detail.data.name}
          description={`Mã sản phẩm ${detail.data.productId}`}
          onClose={() => setDetail({ data: null, error: null, isLoading: false })}
          size="small"
        >
          <dl className="description-list product-detail-list">
            <div><dt>Loại sản phẩm</dt><dd>{detail.data.category.name}</dd></div>
            <div><dt>Đơn vị tính</dt><dd>{detail.data.unit}</dd></div>
            <div><dt>Giá bán</dt><dd>{money.format(detail.data.price)}</dd></div>
          </dl>
          {detail.isLoading && <p className="form-note">Đang xác nhận thông tin mới nhất…</p>}
          {detail.error && <p className="form-note">Không thể làm mới chi tiết; thông tin từ danh sách đang được hiển thị.</p>}
        </Modal>
      )}
    </section>
  );
}

export default ProductCatalogPage;
