import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AsyncContent, DataTable, FormField, Notice, PageHeader, Pagination } from './index';
import {
  EXPIRY_STATUS_OPTIONS,
  getExpiryPresentation,
  getInitialExpiryFilter,
  getProductAlerts,
  INVENTORY_MODE_OPTIONS,
  LOT_STATUS_OPTIONS,
  normalizeInventoryMode,
} from './inventoryPresentation';
import {
  listInventoryProductLots,
  listInventoryProducts,
} from '../services/inventory.service';
import { listPublicCategories } from '../services/product.service';

const PRODUCT_PAGE_SIZE = 10;
const LOT_PAGE_SIZE = 10;
const NEAR_EXPIRY_DAYS = 30;
const INITIAL_FILTERS = Object.freeze({ categoryId: '', mode: 'ALL', search: '' });
const INITIAL_LOT_FILTERS = Object.freeze({ expiryStatus: 'ALL', lotStatus: '' });
const number = new Intl.NumberFormat('vi-VN');
const date = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' });

function formatDate(value) {
  return value ? date.format(new Date(`${value}T00:00:00`)) : '—';
}

function ProductAlerts({ product }) {
  return (
    <span className="inventory-alerts">
      {getProductAlerts(product).map((alert) => (
        <span className={`status-badge status-badge--${alert.key}`} key={alert.key}>
          {alert.label}
        </span>
      ))}
    </span>
  );
}

function ExpiryStatus({ value }) {
  const presentation = getExpiryPresentation(value);
  return (
    <span className={`status-badge status-badge--${presentation.tone}`}>
      {presentation.label}
    </span>
  );
}

function InventoryWorkspace({ audience }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMode = normalizeInventoryMode(searchParams.get('mode'));
  const [filters, setFilters] = useState(() => ({ ...INITIAL_FILTERS, mode: requestedMode }));
  const [appliedFilters, setAppliedFilters] = useState(() => ({ ...INITIAL_FILTERS, mode: requestedMode }));
  const [page, setPage] = useState(1);
  const [productReloadKey, setProductReloadKey] = useState(0);
  const [productState, setProductState] = useState({ data: null, error: null, isLoading: true });
  const [categories, setCategories] = useState({ data: [], error: null, isLoading: true });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [lotFilters, setLotFilters] = useState(INITIAL_LOT_FILTERS);
  const [lotPage, setLotPage] = useState(1);
  const [lotReloadKey, setLotReloadKey] = useState(0);
  const [lotState, setLotState] = useState({ data: null, error: null, isLoading: false });

  const loadProducts = useCallback(async (signal) => {
    setProductState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await listInventoryProducts({
        ...appliedFilters,
        nearExpiryDays: NEAR_EXPIRY_DAYS,
        page,
        pageSize: PRODUCT_PAGE_SIZE,
      }, { signal });
      setProductState({ data, error: null, isLoading: false });
      setSelectedProduct((current) => {
        if (!current) return null;
        return data.items.find((item) => item.productId === current.productId) ?? null;
      });
    } catch (error) {
      if (error.name !== 'AbortError') setProductState({ data: null, error, isLoading: false });
    }
  }, [appliedFilters, page, productReloadKey]);

  const loadCategories = useCallback(async (signal) => {
    setCategories((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await listPublicCategories({ signal });
      setCategories({ data: Array.isArray(data) ? data : [], error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setCategories({ data: [], error, isLoading: false });
    }
  }, []);

  const loadLots = useCallback(async (signal) => {
    if (!selectedProduct) {
      setLotState({ data: null, error: null, isLoading: false });
      return;
    }
    setLotState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await listInventoryProductLots(selectedProduct.productId, {
        ...lotFilters,
        nearExpiryDays: NEAR_EXPIRY_DAYS,
        page: lotPage,
        pageSize: LOT_PAGE_SIZE,
      }, { signal });
      setLotState({ data, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setLotState({ data: null, error, isLoading: false });
    }
  }, [lotFilters, lotPage, lotReloadKey, selectedProduct]);

  useEffect(() => {
    const controller = new AbortController();
    loadProducts(controller.signal);
    return () => controller.abort();
  }, [loadProducts]);

  useEffect(() => {
    setFilters((current) => ({ ...current, mode: requestedMode }));
    setAppliedFilters((current) => ({ ...current, mode: requestedMode }));
    setPage(1);
    setSelectedProduct(null);
  }, [requestedMode]);

  useEffect(() => {
    const controller = new AbortController();
    loadCategories(controller.signal);
    return () => controller.abort();
  }, [loadCategories]);

  useEffect(() => {
    const controller = new AbortController();
    loadLots(controller.signal);
    return () => controller.abort();
  }, [loadLots]);

  const selectProduct = useCallback((product) => {
    setSelectedProduct(product);
    setLotPage(1);
    setLotFilters({
      expiryStatus: getInitialExpiryFilter(appliedFilters.mode),
      lotStatus: '',
    });
  }, [appliedFilters.mode]);

  const productColumns = useMemo(() => [
    {
      key: 'product',
      header: 'Sản phẩm',
      render: (product) => (
        <span className="owner-cell">
          <strong>{product.name}</strong>
          <small>{product.productId} · {product.category.name}</small>
        </span>
      ),
    },
    { key: 'unit', header: 'ĐVT' },
    { key: 'totalStock', header: 'Tồn tổng', render: (product) => number.format(product.totalStock) },
    { key: 'availableStock', header: 'Khả dụng', render: (product) => number.format(product.availableStock) },
    { key: 'minimumStock', header: 'Tồn tối thiểu', render: (product) => number.format(product.minimumStock) },
    { key: 'alerts', header: 'Cảnh báo', render: (product) => <ProductAlerts product={product} /> },
    {
      key: 'actions',
      header: 'Chi tiết',
      render: (product) => (
        <button className="table-action" type="button" onClick={() => selectProduct(product)}>
          Xem lô
        </button>
      ),
    },
  ], [selectProduct]);

  const lotColumns = useMemo(() => [
    { key: 'lotId', header: 'Mã lô' },
    { key: 'manufacturerLot', header: 'Số lô NSX' },
    { key: 'manufactureDate', header: 'Ngày sản xuất', render: (lot) => formatDate(lot.manufactureDate) },
    { key: 'expiryDate', header: 'Hạn sử dụng', render: (lot) => formatDate(lot.expiryDate) },
    { key: 'quantity', header: 'Tồn lô', render: (lot) => number.format(lot.quantity) },
    { key: 'expiryStatus', header: 'Hạn dùng', render: (lot) => <ExpiryStatus value={lot.expiryStatus} /> },
    { key: 'lotStatus', header: 'Trạng thái lô', render: (lot) => <span className={`status-badge status-badge--${lot.lotStatus.toLowerCase()}`}>{lot.lotStatus}</span> },
  ], []);

  const productPagination = productState.data?.pagination ?? { page, totalPages: 0 };
  const lotPagination = lotState.data?.pagination ?? { page: lotPage, totalPages: 0 };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setSearchParams({});
    setPage(1);
    setSelectedProduct(null);
  };

  return (
    <section className="workspace-page inventory-workspace">
      <PageHeader
        title="Tồn kho, lô và cảnh báo"
        description={`Tra cứu tồn tổng, chi tiết lô và cảnh báo hạn dùng dành cho ${audience}. Ngưỡng sắp hết hạn là ${NEAR_EXPIRY_DAYS} ngày.`}
      />

      <Notice tone="error">{categories.error && 'Không tải được danh mục loại hàng. Bạn vẫn có thể tìm theo mã hoặc tên sản phẩm.'}</Notice>

      <form
        className="filter-bar inventory-filter"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSelectedProduct(null);
          setAppliedFilters(filters);
          setSearchParams(filters.mode === 'ALL' ? {} : { mode: filters.mode });
        }}
      >
        <FormField htmlFor={`${audience}-inventory-search`} label="Mã hoặc tên sản phẩm">
          <input
            id={`${audience}-inventory-search`}
            type="search"
            value={filters.search}
            placeholder="Nhập mã hoặc tên sản phẩm"
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          />
        </FormField>
        <FormField htmlFor={`${audience}-inventory-category`} label="Loại hàng">
          <select
            disabled={categories.isLoading}
            id={`${audience}-inventory-category`}
            value={filters.categoryId}
            onChange={(event) => setFilters((current) => ({ ...current, categoryId: event.target.value }))}
          >
            <option value="">Tất cả loại hàng</option>
            {categories.data.map((category) => (
              <option key={category.categoryId} value={category.categoryId}>{category.name}</option>
            ))}
          </select>
        </FormField>
        <FormField htmlFor={`${audience}-inventory-mode`} label="Nhóm cảnh báo">
          <select
            id={`${audience}-inventory-mode`}
            value={filters.mode}
            onChange={(event) => setFilters((current) => ({ ...current, mode: event.target.value }))}
          >
            {INVENTORY_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </FormField>
        <div className="inline-actions inventory-filter__actions">
          <button className="button button--ghost" type="button" onClick={resetFilters}>Đặt lại</button>
          <button className="button button--primary" type="submit">Lọc tồn kho</button>
        </div>
      </form>

      <AsyncContent
        error={productState.error}
        isLoading={productState.isLoading}
        loadingMessage="Đang tải dữ liệu tồn kho…"
        onRetry={() => setProductReloadKey((value) => value + 1)}
        isEmpty={productState.data?.items.length === 0}
        emptyTitle="Không có sản phẩm phù hợp"
        emptyMessage="Hãy thay đổi từ khóa, loại hàng hoặc nhóm cảnh báo."
      >
        {productState.data?.items.length > 0 && (
          <>
            <DataTable
              caption="Danh sách tồn kho theo sản phẩm"
              columns={productColumns}
              getRowClassName={(product) => (product.productId === selectedProduct?.productId ? 'inventory-product-row--selected' : '')}
              getRowKey={(product) => product.productId}
              rows={productState.data.items}
            />
            <Pagination
              disabled={productState.isLoading}
              page={productPagination.page}
              totalPages={productPagination.totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </AsyncContent>

      <section className="inventory-lot-section" aria-labelledby="inventory-lot-heading">
        <div className="receiving-card-heading inventory-lot-heading">
          <div>
            <h2 id="inventory-lot-heading">{selectedProduct ? selectedProduct.name : 'Chọn một sản phẩm'}</h2>
            <p>{selectedProduct ? `${selectedProduct.productId} · ${selectedProduct.unit} · tổng tồn ${number.format(selectedProduct.totalStock)}` : 'Dùng nút “Xem lô” trong bảng tồn kho để kiểm tra hạn sử dụng và số lượng từng lô.'}</p>
          </div>
          {selectedProduct && <ProductAlerts product={selectedProduct} />}
        </div>

        {selectedProduct && (
          <>
            <div className="inventory-legend" aria-label="Chú thích hạn dùng">
              <span><i className="inventory-legend__swatch inventory-legend__swatch--expired" />Đỏ: đã hết hạn</span>
              <span><i className="inventory-legend__swatch inventory-legend__swatch--near-expiry" />Vàng: còn tối đa {NEAR_EXPIRY_DAYS} ngày</span>
              <span><i className="inventory-legend__swatch inventory-legend__swatch--valid" />Xanh: còn hạn an toàn</span>
            </div>
            <div className="filter-bar inventory-lot-filter">
              <FormField htmlFor={`${audience}-lot-expiry`} label="Tình trạng hạn dùng">
                <select
                  id={`${audience}-lot-expiry`}
                  value={lotFilters.expiryStatus}
                  onChange={(event) => {
                    setLotPage(1);
                    setLotFilters((current) => ({ ...current, expiryStatus: event.target.value }));
                  }}
                >
                  {EXPIRY_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </FormField>
              <FormField htmlFor={`${audience}-lot-status`} label="Trạng thái lô">
                <select
                  id={`${audience}-lot-status`}
                  value={lotFilters.lotStatus}
                  onChange={(event) => {
                    setLotPage(1);
                    setLotFilters((current) => ({ ...current, lotStatus: event.target.value }));
                  }}
                >
                  {LOT_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </FormField>
            </div>
            <AsyncContent
              error={lotState.error}
              isLoading={lotState.isLoading}
              loadingMessage="Đang tải các lô còn tồn…"
              onRetry={() => setLotReloadKey((value) => value + 1)}
              isEmpty={lotState.data?.items.length === 0}
              emptyTitle="Không có lô phù hợp"
              emptyMessage="Sản phẩm này không có lô khớp bộ lọc hiện tại."
            >
              {lotState.data?.items.length > 0 && (
                <>
                  <DataTable
                    caption={`Danh sách lô của ${selectedProduct.name}`}
                    columns={lotColumns}
                    getRowClassName={(lot) => `inventory-lot-row ${getExpiryPresentation(lot.expiryStatus).rowClassName}`.trim()}
                    getRowKey={(lot) => lot.lotId}
                    rows={lotState.data.items}
                  />
                  <Pagination
                    disabled={lotState.isLoading}
                    page={lotPagination.page}
                    totalPages={lotPagination.totalPages}
                    onPageChange={setLotPage}
                  />
                </>
              )}
            </AsyncContent>
          </>
        )}
      </section>
    </section>
  );
}

export default InventoryWorkspace;
