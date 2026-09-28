import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../../api';
import { AsyncContent, ConfirmDialog, DataTable, FormField, Modal, Notice } from '../../components';
import {
  createCategory,
  listCategories,
  updateCategory,
  updateCategoryStatus,
} from '../../services/product.service';
import {
  buildCategoryPayload,
  categoryToForm,
  EMPTY_CATEGORY_FORM,
  validateCategoryForm,
} from './productForms';

function CategoryForm({ category, isSubmitting, onCancel, onSubmit }) {
  const editing = Boolean(category);
  const [form, setForm] = useState(() => (
    editing ? categoryToForm(category) : { ...EMPTY_CATEGORY_FORM }
  ));
  const [errors, setErrors] = useState({});
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = (event) => {
    event.preventDefault();
    const nextErrors = validateCategoryForm(form, { editing });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) onSubmit(buildCategoryPayload(form, { editing }));
  };

  return (
    <form className="admin-form" onSubmit={submit} noValidate>
      <div className="form-grid form-grid--two">
        <FormField htmlFor="categoryId" label="Mã loại" required error={errors.categoryId}>
          <input id="categoryId" value={form.categoryId} readOnly={editing} maxLength="10" onChange={(event) => update('categoryId', event.target.value)} />
        </FormField>
        <FormField htmlFor="categoryName" label="Tên loại" required error={errors.name}>
          <input id="categoryName" value={form.name} maxLength="100" onChange={(event) => update('name', event.target.value)} />
        </FormField>
      </div>
      <FormField htmlFor="categoryDescription" label="Mô tả">
        <textarea id="categoryDescription" rows="3" maxLength="255" value={form.description} onChange={(event) => update('description', event.target.value)} />
      </FormField>
      {!editing && (
        <FormField htmlFor="categoryStatus" label="Trạng thái">
          <select id="categoryStatus" value={form.status} onChange={(event) => update('status', event.target.value)}>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="INACTIVE">Ngừng hoạt động</option>
          </select>
        </FormField>
      )}
      <div className="modal__actions">
        <button className="button button--ghost" type="button" onClick={onCancel} disabled={isSubmitting}>Hủy</button>
        <button className="button button--primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang lưu…' : 'Lưu loại sản phẩm'}</button>
      </div>
    </form>
  );
}

function CategoryManagementModal({ onCategoriesChanged, onClose }) {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
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
      const data = await listCategories({ page: 1, pageSize: 100, search: appliedSearch }, { signal });
      setState({ data, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setState({ data: null, error, isLoading: false });
    }
  }, [appliedSearch, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refresh = () => setReloadKey((value) => value + 1);

  const save = async (payload) => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      if (editor.category) {
        await updateCategory(editor.category.categoryId, payload);
        setSuccess(`Đã cập nhật loại ${editor.category.categoryId}.`);
      } else {
        const created = await createCategory(payload);
        setSuccess(`Đã tạo loại ${created.categoryId}.`);
      }
      setEditor(null);
      refresh();
      onCategoriesChanged();
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
      await updateCategoryStatus(statusTarget.categoryId, nextStatus);
      setSuccess(`Đã chuyển loại ${statusTarget.categoryId} sang ${nextStatus}.`);
      setStatusTarget(null);
      refresh();
      onCategoriesChanged();
    } catch (error) {
      setActionError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    { key: 'categoryId', header: 'Mã loại' },
    { key: 'name', header: 'Tên loại' },
    { key: 'description', header: 'Mô tả', render: (row) => row.description || '—' },
    { key: 'status', header: 'Trạng thái', render: (row) => <span className={`status-badge status-badge--${row.status.toLowerCase()}`}>{row.status === 'ACTIVE' ? 'Hoạt động' : 'Ngừng'}</span> },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (row) => (
        <div className="table-actions">
          <button className="table-action" type="button" onClick={() => { setActionError(null); setEditor({ category: row }); }}>Cập nhật</button>
          <button className="table-action table-action--danger" type="button" onClick={() => { setActionError(null); setStatusTarget(row); }}>
            {row.status === 'ACTIVE' ? 'Ngừng' : 'Kích hoạt'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Modal title="Quản lý loại sản phẩm" description="Thêm, cập nhật hoặc chuyển trạng thái loại sản phẩm." onClose={onClose} size="large">
        <Notice tone="success">{success}</Notice>
        <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>
        <form className="compact-search" onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search); }}>
          <FormField htmlFor="categorySearch" label="Tên loại">
            <input id="categorySearch" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          </FormField>
          <button className="button button--ghost" type="submit">Tìm kiếm</button>
          <button className="button button--primary" type="button" onClick={() => { setActionError(null); setEditor({ category: null }); }}>Thêm loại</button>
        </form>
        <AsyncContent error={state.error} isLoading={state.isLoading} loadingMessage="Đang tải loại sản phẩm…" onRetry={refresh} isEmpty={state.data?.items.length === 0} emptyTitle="Không có loại sản phẩm" emptyMessage="Hãy thêm loại sản phẩm hoặc thay đổi từ khóa.">
          {state.data?.items.length > 0 && <DataTable caption="Danh sách loại sản phẩm" columns={columns} getRowKey={(row) => row.categoryId} rows={state.data.items} />}
        </AsyncContent>
      </Modal>
      {editor && (
        <Modal title={editor.category ? `Cập nhật ${editor.category.categoryId}` : 'Thêm loại sản phẩm'} onClose={() => !isSubmitting && setEditor(null)} size="small">
          <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>
          <CategoryForm category={editor.category} isSubmitting={isSubmitting} onCancel={() => setEditor(null)} onSubmit={save} />
        </Modal>
      )}
      {statusTarget && (
        <ConfirmDialog
          title={statusTarget.status === 'ACTIVE' ? 'Ngừng loại sản phẩm?' : 'Kích hoạt loại sản phẩm?'}
          description={`${statusTarget.categoryId} · ${statusTarget.name}. Sản phẩm chỉ có thể dùng loại đang hoạt động.`}
          confirmLabel={statusTarget.status === 'ACTIVE' ? 'Ngừng hoạt động' : 'Kích hoạt'}
          tone={statusTarget.status === 'ACTIVE' ? 'danger' : 'primary'}
          error={actionError && getErrorMessage(actionError)}
          isSubmitting={isSubmitting}
          onCancel={() => !isSubmitting && setStatusTarget(null)}
          onConfirm={changeStatus}
        />
      )}
    </>
  );
}

export default CategoryManagementModal;
