import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import {
  createProduct,
  listCategories,
  listProducts,
  updateProduct,
  updateProductStatus,
} from '../../services/product.service';
import CategoryManagementModal from './CategoryManagementModal';
import {
  buildProductPayload,
  EMPTY_PRODUCT_FORM,
  productToForm,
  validateProductForm,
} from './productForms';

const PAGE_SIZE = 10;
const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

function ProductForm({ categories, isSubmitting, onCancel, onSubmit, product }) {
  const editing = Boolean(product);
  const [form, setForm] = useState(() => (
    editing ? productToForm(product) : { ...EMPTY_PRODUCT_FORM }
  ));
  const [errors, setErrors] = useState({});
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = (event) => {
    event.preventDefault();
    const nextErrors = validateProductForm(form, { editing });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) onSubmit(buildProductPayload(form, { editing }));
  };

  return (
    <form className="admin-form" onSubmit={submit} noValidate>
      <div className="form-grid form-grid--two">
        <FormField htmlFor="productId" label="Mã sản phẩm / SKU" required error={errors.productId}>
          <input id="productId" value={form.productId} readOnly={editing} maxLength="10" onChange={(event) => update('productId', event.target.value)} />
        </FormField>
        <FormField htmlFor="productName" label="Tên sản phẩm" required error={errors.name}>
          <input id="productName" value={form.name} maxLength="150" onChange={(event) => update('name', event.target.value)} />
        </FormField>
        <FormField htmlFor="productBarcode" label="Mã vạch">
          <input id="productBarcode" value={form.barcode} maxLength="30" onChange={(event) => update('barcode', event.target.value)} />
        </FormField>
        <FormField htmlFor="productUnit" label="Đơn vị tính" required error={errors.unit}>
          <input id="productUnit" value={form.unit} maxLength="20" onChange={(event) => update('unit', event.target.value)} />
        </FormField>
        <FormField htmlFor="productCategory" label="Loại sản phẩm" required error={errors.categoryId}>
          <select id="productCategory" value={form.categoryId} onChange={(event) => update('categoryId', event.target.value)}>
            <option value="">Chọn loại sản phẩm</option>
            {categories.filter((category) => category.status === 'ACTIVE').map((category) => (
              <option key={category.categoryId} value={category.categoryId}>{category.name}</option>
            ))}
          </select>
        </FormField>
        <FormField htmlFor="productMinimumStock" label="Tồn tối thiểu" required error={errors.minimumStock}>
          <input id="productMinimumStock" type="number" min="0" step="1" value={form.minimumStock} onChange={(event) => update('minimumStock', event.target.value)} />
        </FormField>
        {!editing && (
          <>
            <FormField htmlFor="productPrice" label="Giá bán ban đầu" required error={errors.price}>
              <input id="productPrice" type="number" min="0.01" step="0.01" value={form.price} onChange={(event) => update('price', event.target.value)} />
            </FormField>
            <FormField htmlFor="productStatus" label="Trạng thái">
              <select id="productStatus" value={form.status} onChange={(event) => update('status', event.target.value)}>
                <option value="ACTIVE">Đang kinh doanh</option>
                <option value="INACTIVE">Ngừng kinh doanh</option>
              </select>
            </FormField>
          </>
        )}
      </div>
      {editing && <p className="form-note">Giá bán được thay đổi tại chức năng cập nhật giá để bảo đảm có lý do và lịch sử audit riêng.</p>}
      <div className="modal__actions">
        <button className="button button--ghost" type="button" onClick={onCancel} disabled={isSubmitting}>Hủy</button>
        <button className="button button--primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang lưu…' : 'Lưu sản phẩm'}</button>
      </div>
    </form>
  );
}

function ProductManagementPage() {
  const [filters, setFilters] = useState({ search: '', categoryId: '', status: '' });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', categoryId: '', status: '' });
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [categories, setCategories] = useState([]);
  const [categoryError, setCategoryError] = useState(null);
  const [editor, setEditor] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [showCategories, setShowCategories] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadProducts = useCallback(async (signal) => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await listProducts({ ...appliedFilters, page, pageSize: PAGE_SIZE }, { signal });
      setState({ data, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setState({ data: null, error, isLoading: false });
    }
  }, [appliedFilters, page, reloadKey]);

  const loadCategories = useCallback(async (signal) => {
    try {
      const data = await listCategories({ page: 1, pageSize: 100 }, { signal });
      setCategories(data.items);
      setCategoryError(null);
    } catch (error) {
      if (error.name !== 'AbortError') setCategoryError(error);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadProducts(controller.signal);
    return () => controller.abort();
  }, [loadProducts]);

  useEffect(() => {
    const controller = new AbortController();
    loadCategories(controller.signal);
    return () => controller.abort();
  }, [loadCategories]);

  const refresh = () => setReloadKey((value) => value + 1);
  const refreshCategories = () => loadCategories();

  const save = async (payload) => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      if (editor.product) {
        await updateProduct(editor.product.productId, payload);
        setSuccess(`Đã cập nhật sản phẩm ${editor.product.productId}.`);
      } else {
        const created = await createProduct(payload);
        setSuccess(`Đã tạo sản phẩm ${created.productId}.`);
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
      await updateProductStatus(statusTarget.productId, nextStatus);
      setSuccess(`Đã chuyển ${statusTarget.productId} sang ${nextStatus}.`);
      setStatusTarget(null);
      refresh();
    } catch (error) {
      setActionError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = useMemo(() => [
    { key: 'productId', header: 'Mã SP / SKU' },
    { key: 'barcode', header: 'Barcode', render: (row) => row.barcode || '—' },
    { key: 'name', header: 'Tên sản phẩm' },
    { key: 'category', header: 'Loại', render: (row) => row.category.name },
    { key: 'unit', header: 'ĐVT' },
    { key: 'price', header: 'Giá bán', render: (row) => money.format(row.price) },
    { key: 'minimumStock', header: 'Tồn tối thiểu' },
    { key: 'status', header: 'Trạng thái', render: (row) => <span className={`status-badge status-badge--${row.status.toLowerCase()}`}>{row.status === 'ACTIVE' ? 'Đang bán' : 'Ngừng'}</span> },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (row) => (
        <div className="table-actions product-table-actions">
          <button className="table-action" type="button" onClick={() => { setActionError(null); setEditor({ product: row }); }}>Cập nhật</button>
          <Link className="table-action" to={`/manager/products/pricing?productId=${encodeURIComponent(row.productId)}`}>Đổi giá</Link>
          <button className="table-action table-action--danger" type="button" onClick={() => { setActionError(null); setStatusTarget(row); }}>
            {row.status === 'ACTIVE' ? 'Ngừng bán' : 'Kích hoạt'}
          </button>
        </div>
      ),
    },
  ], []);

  const pagination = state.data?.pagination ?? { page, totalPages: 0 };

  return (
    <section className="workspace-page">
      <PageHeader
        title="Quản lý sản phẩm"
        description="Tra cứu theo tên, mã sản phẩm hoặc barcode; duy trì loại hàng và trạng thái mà không xóa dữ liệu."
        actions={(
          <div className="inline-actions">
            <button className="button button--ghost" type="button" onClick={() => setShowCategories(true)}>Quản lý loại hàng</button>
            <button className="button button--primary" type="button" onClick={() => { setActionError(null); setEditor({ product: null }); }}>Thêm sản phẩm</button>
          </div>
        )}
      />
      <Notice tone="success">{success}</Notice>
      <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>
      <Notice tone="error">{categoryError && `Không tải được loại sản phẩm: ${getErrorMessage(categoryError)}`}</Notice>

      <form className="filter-bar admin-filter admin-filter--products" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedFilters(filters); }}>
        <FormField htmlFor="productSearch" label="Tên, mã SP hoặc barcode">
          <input id="productSearch" type="search" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        </FormField>
        <FormField htmlFor="productCategoryFilter" label="Loại sản phẩm">
          <select id="productCategoryFilter" value={filters.categoryId} onChange={(event) => setFilters((current) => ({ ...current, categoryId: event.target.value }))}>
            <option value="">Tất cả loại</option>
            {categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.name}</option>)}
          </select>
        </FormField>
        <FormField htmlFor="productStatusFilter" label="Trạng thái">
          <select id="productStatusFilter" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">Tất cả</option>
            <option value="ACTIVE">Đang kinh doanh</option>
            <option value="INACTIVE">Ngừng kinh doanh</option>
          </select>
        </FormField>
        <button className="button button--primary" type="submit">Tìm kiếm</button>
      </form>

      <AsyncContent error={state.error} isLoading={state.isLoading} loadingMessage="Đang tải sản phẩm…" onRetry={refresh} isEmpty={state.data?.items.length === 0} emptyTitle="Không tìm thấy sản phẩm" emptyMessage="Hãy thay đổi từ khóa hoặc bộ lọc.">
        {state.data?.items.length > 0 && (
          <>
            <DataTable caption="Danh sách sản phẩm" columns={columns} getRowKey={(row) => row.productId} rows={state.data.items} />
            <Pagination disabled={state.isLoading} page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
          </>
        )}
      </AsyncContent>

      {editor && (
        <Modal title={editor.product ? `Cập nhật ${editor.product.productId}` : 'Thêm sản phẩm'} description="Các trường có dấu * là bắt buộc." onClose={() => !isSubmitting && setEditor(null)} size="large">
          <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>
          <ProductForm categories={categories} product={editor.product} isSubmitting={isSubmitting} onCancel={() => setEditor(null)} onSubmit={save} />
        </Modal>
      )}
      {statusTarget && (
        <ConfirmDialog
          title={statusTarget.status === 'ACTIVE' ? 'Ngừng kinh doanh sản phẩm?' : 'Kích hoạt lại sản phẩm?'}
          description={`${statusTarget.productId} · ${statusTarget.name}. Thao tác chỉ đổi trạng thái, không xóa dữ liệu.`}
          confirmLabel={statusTarget.status === 'ACTIVE' ? 'Ngừng kinh doanh' : 'Kích hoạt'}
          tone={statusTarget.status === 'ACTIVE' ? 'danger' : 'primary'}
          error={actionError && getErrorMessage(actionError)}
          isSubmitting={isSubmitting}
          onCancel={() => !isSubmitting && setStatusTarget(null)}
          onConfirm={changeStatus}
        />
      )}
      {showCategories && <CategoryManagementModal onCategoriesChanged={refreshCategories} onClose={() => setShowCategories(false)} />}
    </section>
  );
}

export default ProductManagementPage;
