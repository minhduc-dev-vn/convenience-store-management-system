import { useCallback, useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '../../api';
import {
  AsyncContent,
  ConfirmDialog,
  DataTable,
  FormField,
  Modal,
  Notice,
  PageHeader,
  Pagination,
} from '../../components';
import { listProducts } from '../../services/product.service';
import {
  createPromotion,
  getPromotion,
  listPromotions,
  updatePromotion,
  updatePromotionStatus,
} from '../../services/promotion.service';
import {
  buildPromotionPayload,
  promotionToForm,
  validatePromotionForm,
} from './promotionForms';

const PAGE_SIZE = 10;
const PRODUCT_PAGE_SIZE = 100;
const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});
const dateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function formatValue(promotion) {
  return promotion.type === 'PERCENT' ? `${promotion.value}%` : money.format(promotion.value);
}

async function loadAllProductOptions() {
  const first = await listProducts({ page: 1, pageSize: PRODUCT_PAGE_SIZE });
  if (first.pagination.totalPages <= 1) return first.items;
  const remainingPages = await Promise.all(
    Array.from({ length: first.pagination.totalPages - 1 }, (_, index) => (
      listProducts({ page: index + 2, pageSize: PRODUCT_PAGE_SIZE })
    )),
  );
  return [first, ...remainingPages].flatMap((page) => page.items);
}

function PromotionForm({ isSubmitting, onCancel, onSubmit, productOptions, promotion }) {
  const editing = Boolean(promotion);
  const [form, setForm] = useState(() => promotionToForm(promotion));
  const [errors, setErrors] = useState({});
  const [productSearch, setProductSearch] = useState('');

  const visibleProducts = useMemo(() => {
    const search = productSearch.trim().toLocaleLowerCase('vi-VN');
    if (!search) return productOptions;
    return productOptions.filter((product) => (
      product.productId.toLocaleLowerCase('vi-VN').includes(search)
      || product.name.toLocaleLowerCase('vi-VN').includes(search)
    ));
  }, [productOptions, productSearch]);

  const update = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'type' && value === 'AMOUNT' ? { maximumDiscount: '' } : {}),
    }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const toggleProduct = (productId) => {
    setForm((current) => ({
      ...current,
      productIds: current.productIds.includes(productId)
        ? current.productIds.filter((id) => id !== productId)
        : [...current.productIds, productId],
    }));
    setErrors((current) => ({ ...current, productIds: undefined }));
  };

  const submit = (event) => {
    event.preventDefault();
    const nextErrors = validatePromotionForm(form, { editing });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) {
      onSubmit(buildPromotionPayload(form, { editing }));
    }
  };

  return (
    <form className="stacked-form promotion-form" onSubmit={submit} noValidate>
      <div className="form-grid form-grid--two-columns">
        <FormField htmlFor="promotionId" label="Mã chương trình" required error={errors.promotionId}>
          <input
            id="promotionId"
            value={form.promotionId}
            maxLength="12"
            disabled={editing}
            onChange={(event) => update('promotionId', event.target.value)}
          />
        </FormField>
        <FormField htmlFor="promotionName" label="Tên chương trình" required error={errors.name}>
          <input id="promotionName" value={form.name} maxLength="150" onChange={(event) => update('name', event.target.value)} />
        </FormField>
        <FormField htmlFor="promotionType" label="Hình thức ưu đãi" required error={errors.type}>
          <select id="promotionType" value={form.type} onChange={(event) => update('type', event.target.value)}>
            <option value="PERCENT">Giảm theo phần trăm</option>
            <option value="AMOUNT">Giảm số tiền cố định</option>
          </select>
        </FormField>
        <FormField htmlFor="promotionValue" label="Mức ưu đãi" required error={errors.value}>
          <input id="promotionValue" type="number" min="0.01" max={form.type === 'PERCENT' ? '100' : undefined} step="0.01" value={form.value} onChange={(event) => update('value', event.target.value)} />
        </FormField>
        <FormField htmlFor="promotionMinimum" label="Giá trị đơn tối thiểu" required error={errors.minimumOrderValue}>
          <input id="promotionMinimum" type="number" min="0" step="0.01" value={form.minimumOrderValue} onChange={(event) => update('minimumOrderValue', event.target.value)} />
        </FormField>
        <FormField
          htmlFor="promotionMaximum"
          label="Mức giảm tối đa"
          error={errors.maximumDiscount}
          hint={form.type === 'AMOUNT' ? 'Chỉ áp dụng với ưu đãi phần trăm.' : 'Có thể để trống nếu không giới hạn riêng.'}
        >
          <input
            id="promotionMaximum"
            type="number"
            min="0.01"
            step="0.01"
            value={form.maximumDiscount}
            disabled={form.type === 'AMOUNT'}
            onChange={(event) => update('maximumDiscount', event.target.value)}
          />
        </FormField>
        <FormField htmlFor="promotionStart" label="Thời gian bắt đầu" required error={errors.startAt}>
          <input id="promotionStart" type="datetime-local" value={form.startAt} onChange={(event) => update('startAt', event.target.value)} />
        </FormField>
        <FormField htmlFor="promotionEnd" label="Thời gian kết thúc" required error={errors.endAt}>
          <input id="promotionEnd" type="datetime-local" value={form.endAt} min={form.startAt || undefined} onChange={(event) => update('endAt', event.target.value)} />
        </FormField>
        {!editing && (
          <FormField htmlFor="promotionStatus" label="Trạng thái ban đầu">
            <select id="promotionStatus" value={form.status} onChange={(event) => update('status', event.target.value)}>
              <option value="ACTIVE">Kích hoạt</option>
              <option value="INACTIVE">Chưa kích hoạt</option>
            </select>
          </FormField>
        )}
      </div>

      <FormField
        htmlFor="promotionProductSearch"
        label={`Sản phẩm áp dụng (${form.productIds.length}/100)`}
        required
        error={errors.productIds}
        hint="Chương trình áp dụng cho các sản phẩm được chọn."
      >
        <input
          id="promotionProductSearch"
          type="search"
          placeholder="Tìm theo mã hoặc tên sản phẩm"
          value={productSearch}
          onChange={(event) => setProductSearch(event.target.value)}
        />
      </FormField>
      <div className="promotion-product-picker" role="group" aria-label="Chọn sản phẩm áp dụng">
        {visibleProducts.length === 0 ? (
          <p className="form-note">Không tìm thấy sản phẩm phù hợp.</p>
        ) : visibleProducts.map((product) => (
          <label key={product.productId} className="promotion-product-option">
            <input
              type="checkbox"
              checked={form.productIds.includes(product.productId)}
              disabled={!form.productIds.includes(product.productId) && form.productIds.length >= 100}
              onChange={() => toggleProduct(product.productId)}
            />
            <span><strong>{product.productId}</strong>{product.name}</span>
            <small>{product.status === 'ACTIVE' ? 'Đang kinh doanh' : 'Ngừng kinh doanh'}</small>
          </label>
        ))}
      </div>

      <div className="modal__actions">
        <button className="button button--ghost" type="button" onClick={onCancel} disabled={isSubmitting}>Hủy</button>
        <button className="button button--primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Đang lưu…' : 'Lưu chương trình'}
        </button>
      </div>
    </form>
  );
}

function PromotionManagementPage() {
  const [filters, setFilters] = useState({ search: '', status: '', type: '' });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', status: '', type: '' });
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [editor, setEditor] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async (signal) => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await listPromotions(
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
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refresh = () => setReloadKey((value) => value + 1);

  const openEditor = async (promotion = null) => {
    setActionError(null);
    setEditor({ isLoading: true, productOptions: [], promotion });
    try {
      const [productOptions, detail] = await Promise.all([
        loadAllProductOptions(),
        promotion ? getPromotion(promotion.promotionId) : Promise.resolve(null),
      ]);
      setEditor({ isLoading: false, productOptions, promotion: detail });
    } catch (error) {
      setEditor(null);
      setActionError(error);
    }
  };

  const save = async (payload) => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      if (editor.promotion) {
        await updatePromotion(editor.promotion.promotionId, payload);
        setSuccess(`Đã cập nhật chương trình ${editor.promotion.promotionId}.`);
      } else {
        const created = await createPromotion(payload);
        setSuccess(`Đã tạo chương trình ${created.promotionId}.`);
      }
      setEditor(null);
      refresh();
    } catch (error) {
      setActionError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const changeStatus = async () => {
    const nextStatus = statusTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setIsSubmitting(true);
    setActionError(null);
    try {
      await updatePromotionStatus(statusTarget.promotionId, nextStatus);
      setSuccess(`Đã chuyển ${statusTarget.promotionId} sang ${nextStatus}.`);
      setStatusTarget(null);
      refresh();
    } catch (error) {
      setActionError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = useMemo(() => [
    { key: 'promotionId', header: 'Mã KM' },
    { key: 'name', header: 'Tên chương trình' },
    { key: 'type', header: 'Hình thức', render: (row) => (row.type === 'PERCENT' ? 'Phần trăm' : 'Số tiền') },
    { key: 'value', header: 'Mức ưu đãi', render: formatValue },
    { key: 'minimumOrderValue', header: 'Đơn tối thiểu', render: (row) => money.format(row.minimumOrderValue) },
    { key: 'maximumDiscount', header: 'Giảm tối đa', render: (row) => (row.maximumDiscount == null ? '—' : money.format(row.maximumDiscount)) },
    { key: 'period', header: 'Thời gian', render: (row) => <span className="table-date-range">{dateTime.format(new Date(row.startAt))}<small>đến {dateTime.format(new Date(row.endAt))}</small></span> },
    { key: 'productCount', header: 'Sản phẩm' },
    { key: 'status', header: 'Trạng thái', render: (row) => <span className={`status-badge status-badge--${row.status.toLowerCase()}`}>{row.status === 'ACTIVE' ? 'Kích hoạt' : 'Tạm ngưng'}</span> },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (row) => (
        <div className="table-actions">
          <button className="table-action" type="button" onClick={() => openEditor(row)}>Cập nhật</button>
          <button className="table-action table-action--danger" type="button" onClick={() => { setActionError(null); setStatusTarget(row); }}>
            {row.status === 'ACTIVE' ? 'Tạm ngưng' : 'Kích hoạt'}
          </button>
        </div>
      ),
    },
  ], []);

  const pagination = state.data?.pagination ?? { page, totalPages: 0 };

  return (
    <section className="workspace-page">
      <PageHeader
        title="Quản lý chương trình khuyến mãi"
        description="Thiết lập ưu đãi, điều kiện, thời gian hiệu lực và danh sách sản phẩm áp dụng."
        actions={<button className="button button--primary" type="button" onClick={() => openEditor()}>Thêm chương trình</button>}
      />
      <Notice tone="success">{success}</Notice>
      <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>

      <form className="filter-bar admin-filter admin-filter--promotions" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedFilters(filters); }}>
        <FormField htmlFor="promotionSearch" label="Mã hoặc tên chương trình">
          <input id="promotionSearch" type="search" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        </FormField>
        <FormField htmlFor="promotionTypeFilter" label="Hình thức">
          <select id="promotionTypeFilter" value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}>
            <option value="">Tất cả</option>
            <option value="PERCENT">Phần trăm</option>
            <option value="AMOUNT">Số tiền cố định</option>
          </select>
        </FormField>
        <FormField htmlFor="promotionStatusFilter" label="Trạng thái">
          <select id="promotionStatusFilter" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">Tất cả</option>
            <option value="ACTIVE">Kích hoạt</option>
            <option value="INACTIVE">Tạm ngưng</option>
          </select>
        </FormField>
        <button className="button button--primary" type="submit">Tìm kiếm</button>
      </form>

      <AsyncContent
        error={state.error}
        isLoading={state.isLoading}
        loadingMessage="Đang tải chương trình khuyến mãi…"
        onRetry={refresh}
        isEmpty={state.data?.items.length === 0}
        emptyTitle="Không tìm thấy chương trình"
        emptyMessage="Hãy thay đổi từ khóa hoặc bộ lọc."
      >
        {state.data?.items.length > 0 && (
          <>
            <DataTable caption="Danh sách chương trình khuyến mãi" columns={columns} getRowKey={(row) => row.promotionId} rows={state.data.items} />
            <Pagination disabled={state.isLoading} page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
          </>
        )}
      </AsyncContent>

      {editor && (
        <Modal
          title={editor.promotion ? `Cập nhật ${editor.promotion.promotionId}` : 'Thêm chương trình khuyến mãi'}
          description="Các trường có dấu * là bắt buộc."
          onClose={() => !isSubmitting && setEditor(null)}
          size="large"
        >
          <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>
          {editor.isLoading ? (
            <AsyncContent isLoading loadingMessage="Đang tải dữ liệu chương trình…" />
          ) : (
            <PromotionForm
              isSubmitting={isSubmitting}
              onCancel={() => setEditor(null)}
              onSubmit={save}
              productOptions={editor.productOptions}
              promotion={editor.promotion}
            />
          )}
        </Modal>
      )}

      {statusTarget && (
        <ConfirmDialog
          title={statusTarget.status === 'ACTIVE' ? 'Tạm ngưng chương trình?' : 'Kích hoạt chương trình?'}
          description={`${statusTarget.promotionId} · ${statusTarget.name}. Thao tác chỉ đổi trạng thái, không xóa dữ liệu.`}
          confirmLabel={statusTarget.status === 'ACTIVE' ? 'Tạm ngưng' : 'Kích hoạt'}
          tone={statusTarget.status === 'ACTIVE' ? 'danger' : 'primary'}
          error={actionError && getErrorMessage(actionError)}
          isSubmitting={isSubmitting}
          onCancel={() => !isSubmitting && setStatusTarget(null)}
          onConfirm={changeStatus}
        />
      )}
    </section>
  );
}

export default PromotionManagementPage;
