import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api';
import {
  AsyncContent,
  ConfirmDialog,
  DataTable,
  FormField,
  Notice,
  PageHeader,
  Pagination,
} from '../../components';
import {
  getProduct,
  listPriceHistory,
  listProducts,
  updateProductPrice,
} from '../../services/product.service';
import {
  buildPricePayload,
  EMPTY_PRICE_FORM,
  validatePriceForm,
} from './productForms';

const PRODUCT_PAGE_SIZE = 8;
const HISTORY_PAGE_SIZE = 8;
const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

function displayDateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('vi-VN');
}

function ProductPricingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [productReloadKey, setProductReloadKey] = useState(0);
  const [products, setProducts] = useState({ data: null, error: null, isLoading: true });
  const [selected, setSelected] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
  const [history, setHistory] = useState({ data: null, error: null, isLoading: false });
  const [form, setForm] = useState({ ...EMPTY_PRICE_FORM });
  const [errors, setErrors] = useState({});
  const [pendingPayload, setPendingPayload] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadProducts = useCallback(async (signal) => {
    setProducts((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await listProducts(
        { page: productPage, pageSize: PRODUCT_PAGE_SIZE, search: appliedSearch },
        { signal },
      );
      setProducts({ data, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setProducts({ data: null, error, isLoading: false });
    }
  }, [appliedSearch, productPage, productReloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    loadProducts(controller.signal);
    return () => controller.abort();
  }, [loadProducts]);

  useEffect(() => {
    const requestedId = searchParams.get('productId');
    if (!requestedId || selected?.productId === requestedId) return undefined;
    const controller = new AbortController();
    getProduct(requestedId, { signal: controller.signal })
      .then((product) => {
        setSelected(product);
        setHistoryPage(1);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setActionError(error);
      });
    return () => controller.abort();
  }, [searchParams, selected?.productId]);

  const loadHistory = useCallback(async (signal) => {
    if (!selected) {
      setHistory({ data: null, error: null, isLoading: false });
      return;
    }
    setHistory((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await listPriceHistory(
        selected.productId,
        { page: historyPage, pageSize: HISTORY_PAGE_SIZE },
        { signal },
      );
      setHistory({ data, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setHistory({ data: null, error, isLoading: false });
    }
  }, [historyPage, historyReloadKey, selected]);

  useEffect(() => {
    const controller = new AbortController();
    loadHistory(controller.signal);
    return () => controller.abort();
  }, [loadHistory]);

  const chooseProduct = (product) => {
    setSelected(product);
    setSearchParams({ productId: product.productId });
    setHistoryPage(1);
    setForm({ ...EMPTY_PRICE_FORM });
    setErrors({});
    setActionError(null);
    setSuccess('');
  };

  const prepareChange = (event) => {
    event.preventDefault();
    const nextErrors = validatePriceForm(form, selected.price);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) setPendingPayload(buildPricePayload(form));
  };

  const confirmChange = async () => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      const result = await updateProductPrice(selected.productId, pendingPayload);
      setSelected((current) => ({ ...current, price: result.newPrice }));
      setSuccess(`Đã đổi giá ${result.productId} từ ${money.format(result.oldPrice)} sang ${money.format(result.newPrice)}.`);
      setForm({ ...EMPTY_PRICE_FORM });
      setPendingPayload(null);
      setProductReloadKey((value) => value + 1);
      setHistoryPage(1);
      setHistoryReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const productColumns = useMemo(() => [
    { key: 'productId', header: 'Mã SP / SKU' },
    { key: 'name', header: 'Tên sản phẩm' },
    { key: 'category', header: 'Loại', render: (row) => row.category.name },
    { key: 'price', header: 'Giá hiện tại', render: (row) => money.format(row.price) },
    { key: 'status', header: 'Trạng thái', render: (row) => <span className={`status-badge status-badge--${row.status.toLowerCase()}`}>{row.status === 'ACTIVE' ? 'Đang bán' : 'Ngừng'}</span> },
    { key: 'actions', header: 'Thao tác', render: (row) => <button className="table-action" type="button" onClick={() => chooseProduct(row)}>{selected?.productId === row.productId ? 'Đang chọn' : 'Chọn'}</button> },
  ], [selected]);

  const historyColumns = useMemo(() => [
    { key: 'changedAt', header: 'Thời gian', render: (row) => displayDateTime(row.changedAt) },
    { key: 'oldPrice', header: 'Giá cũ', render: (row) => row.oldPrice == null ? '—' : money.format(row.oldPrice) },
    { key: 'newPrice', header: 'Giá mới', render: (row) => row.newPrice == null ? '—' : money.format(row.newPrice) },
    { key: 'reason', header: 'Lý do', render: (row) => row.reason || '—' },
    { key: 'changedBy', header: 'Người thực hiện', render: (row) => row.changedBy?.fullName || row.changedBy?.username || '—' },
  ], []);

  const productPagination = products.data?.pagination ?? { page: productPage, totalPages: 0 };
  const historyPagination = history.data?.pagination ?? { page: historyPage, totalPages: 0 };

  return (
    <section className="workspace-page">
      <PageHeader
        eyebrow="MH-17 · F29"
        title="Cập nhật giá bán"
        description="Chọn sản phẩm, nhập giá mới và lý do. Mỗi lần đổi giá được backend ghi audit với người thực hiện và thời gian."
      />
      <Notice tone="success">{success}</Notice>
      <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>

      <form className="filter-bar pricing-search" onSubmit={(event) => { event.preventDefault(); setProductPage(1); setAppliedSearch(search); }}>
        <FormField htmlFor="pricingProductSearch" label="Tên, mã SP hoặc barcode">
          <input id="pricingProductSearch" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </FormField>
        <button className="button button--primary" type="submit">Tìm sản phẩm</button>
      </form>

      <AsyncContent error={products.error} isLoading={products.isLoading} loadingMessage="Đang tải sản phẩm…" onRetry={() => setProductReloadKey((value) => value + 1)} isEmpty={products.data?.items.length === 0} emptyTitle="Không tìm thấy sản phẩm" emptyMessage="Hãy thử từ khóa khác.">
        {products.data?.items.length > 0 && (
          <>
            <DataTable caption="Chọn sản phẩm cần đổi giá" columns={productColumns} getRowKey={(row) => row.productId} rows={products.data.items} />
            <Pagination disabled={products.isLoading} page={productPagination.page} totalPages={productPagination.totalPages} onPageChange={setProductPage} />
          </>
        )}
      </AsyncContent>

      {selected && (
        <section className="pricing-workspace">
          <div className="pricing-form-card">
            <p className="eyebrow">Sản phẩm đã chọn</p>
            <h2>{selected.productId} · {selected.name}</h2>
            <p className="current-price">Giá hiện tại <strong>{money.format(selected.price)}</strong></p>
            <form className="admin-form" onSubmit={prepareChange} noValidate>
              <FormField htmlFor="newProductPrice" label="Giá mới" required error={errors.newPrice}>
                <input id="newProductPrice" type="number" min="0.01" step="0.01" value={form.newPrice} onChange={(event) => setForm((current) => ({ ...current, newPrice: event.target.value }))} />
              </FormField>
              <FormField htmlFor="priceChangeReason" label="Lý do đổi giá" required error={errors.reason}>
                <textarea id="priceChangeReason" rows="4" maxLength="255" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
              </FormField>
              <button className="button button--primary" type="submit">Kiểm tra và xác nhận</button>
            </form>
          </div>
          <div className="price-history-card">
            <div className="section-heading section-heading--compact">
              <div><p className="eyebrow">NHAT_KY_HE_THONG</p><h3>Lịch sử đổi giá</h3></div>
            </div>
            <AsyncContent error={history.error} isLoading={history.isLoading} loadingMessage="Đang tải lịch sử giá…" onRetry={() => setHistoryReloadKey((value) => value + 1)} isEmpty={history.data?.items.length === 0} emptyTitle="Chưa có lịch sử đổi giá" emptyMessage="Các lần đổi giá mới sẽ xuất hiện tại đây.">
              {history.data?.items.length > 0 && (
                <>
                  <DataTable caption={`Lịch sử giá ${selected.productId}`} columns={historyColumns} getRowKey={(row) => `${row.changedAt}-${row.oldPrice}-${row.newPrice}`} rows={history.data.items} />
                  <Pagination disabled={history.isLoading} page={historyPagination.page} totalPages={historyPagination.totalPages} onPageChange={setHistoryPage} />
                </>
              )}
            </AsyncContent>
          </div>
        </section>
      )}

      {pendingPayload && selected && (
        <ConfirmDialog
          title="Xác nhận cập nhật giá bán?"
          description={`${selected.productId} · ${selected.name}: ${money.format(selected.price)} → ${money.format(pendingPayload.newPrice)}. Lý do: ${pendingPayload.reason}`}
          confirmLabel="Cập nhật giá"
          tone="primary"
          error={actionError && getErrorMessage(actionError)}
          isSubmitting={isSubmitting}
          onCancel={() => !isSubmitting && setPendingPayload(null)}
          onConfirm={confirmChange}
        />
      )}
    </section>
  );
}

export default ProductPricingPage;
