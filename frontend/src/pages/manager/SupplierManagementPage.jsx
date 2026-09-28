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
import {
  createSupplier,
  getSupplier,
  listSuppliers,
  updateSupplier,
  updateSupplierStatus,
} from '../../services/supplier.service';
import {
  buildSupplierPayload,
  supplierToForm,
  validateSupplierForm,
} from './supplierForms';

const PAGE_SIZE = 10;

function SupplierForm({ isSubmitting, onCancel, onSubmit, supplier }) {
  const editing = Boolean(supplier);
  const [form, setForm] = useState(() => supplierToForm(supplier));
  const [errors, setErrors] = useState({});

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = (event) => {
    event.preventDefault();
    const nextErrors = validateSupplierForm(form, { editing });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) {
      onSubmit(buildSupplierPayload(form, { editing }));
    }
  };

  return (
    <form className="admin-form" onSubmit={submit} noValidate>
      <div className="form-grid form-grid--two">
        <FormField htmlFor="supplierId" label="Mã nhà cung cấp" required error={errors.supplierId}>
          <input
            id="supplierId"
            value={form.supplierId}
            maxLength="10"
            disabled={editing}
            autoFocus
            onChange={(event) => update('supplierId', event.target.value)}
          />
        </FormField>
        <FormField htmlFor="supplierName" label="Tên nhà cung cấp" required error={errors.name}>
          <input id="supplierName" value={form.name} maxLength="150" onChange={(event) => update('name', event.target.value)} />
        </FormField>
        <FormField htmlFor="supplierPhone" label="Số điện thoại" required error={errors.phone}>
          <input id="supplierPhone" type="tel" value={form.phone} maxLength="15" onChange={(event) => update('phone', event.target.value)} />
        </FormField>
        <FormField htmlFor="supplierEmail" label="Email" error={errors.email}>
          <input id="supplierEmail" type="email" value={form.email} maxLength="100" onChange={(event) => update('email', event.target.value)} />
        </FormField>
        <FormField htmlFor="supplierTaxCode" label="Mã số thuế" error={errors.taxCode}>
          <input id="supplierTaxCode" value={form.taxCode} maxLength="20" onChange={(event) => update('taxCode', event.target.value)} />
        </FormField>
        {!editing && (
          <FormField htmlFor="supplierStatus" label="Trạng thái ban đầu" error={errors.status}>
            <select id="supplierStatus" value={form.status} onChange={(event) => update('status', event.target.value)}>
              <option value="ACTIVE">Đang hợp tác</option>
              <option value="INACTIVE">Ngừng hợp tác</option>
            </select>
          </FormField>
        )}
        <FormField htmlFor="supplierAddress" label="Địa chỉ" error={errors.address}>
          <textarea id="supplierAddress" rows="3" value={form.address} maxLength="255" onChange={(event) => update('address', event.target.value)} />
        </FormField>
      </div>
      <p className="form-note">Số điện thoại và mã số thuế (nếu có) phải duy nhất trong hệ thống.</p>
      <div className="modal__actions">
        <button className="button button--ghost" type="button" onClick={onCancel} disabled={isSubmitting}>Hủy</button>
        <button className="button button--primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Đang lưu…' : 'Lưu nhà cung cấp'}
        </button>
      </div>
    </form>
  );
}

function SupplierManagementPage() {
  const [filters, setFilters] = useState({ search: '', status: '' });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', status: '' });
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
      const data = await listSuppliers(
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

  const openEditor = async (supplier = null) => {
    setActionError(null);
    if (!supplier) {
      setEditor({ isLoading: false, supplier: null });
      return;
    }
    setEditor({ isLoading: true, supplier });
    try {
      const detail = await getSupplier(supplier.supplierId);
      setEditor({ isLoading: false, supplier: detail });
    } catch (error) {
      setEditor(null);
      setActionError(error);
    }
  };

  const save = async (payload) => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      if (editor.supplier) {
        await updateSupplier(editor.supplier.supplierId, payload);
        setSuccess(`Đã cập nhật nhà cung cấp ${editor.supplier.supplierId}.`);
      } else {
        const created = await createSupplier(payload);
        setSuccess(`Đã tạo nhà cung cấp ${created.supplierId}.`);
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
      await updateSupplierStatus(statusTarget.supplierId, nextStatus);
      setSuccess(`Đã chuyển ${statusTarget.supplierId} sang ${nextStatus}.`);
      setStatusTarget(null);
      refresh();
    } catch (error) {
      setActionError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = useMemo(() => [
    { key: 'supplierId', header: 'Mã NCC' },
    { key: 'name', header: 'Tên nhà cung cấp' },
    { key: 'phone', header: 'Số điện thoại' },
    { key: 'email', header: 'Email', render: (row) => row.email || '—' },
    { key: 'address', header: 'Địa chỉ', render: (row) => row.address || '—' },
    { key: 'taxCode', header: 'Mã số thuế', render: (row) => row.taxCode || '—' },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (row) => (
        <span className={`status-badge status-badge--${row.status.toLowerCase()}`}>
          {row.status === 'ACTIVE' ? 'Đang hợp tác' : 'Ngừng hợp tác'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (row) => (
        <div className="table-actions">
          <button className="table-action" type="button" onClick={() => openEditor(row)}>Cập nhật</button>
          <button
            className="table-action table-action--danger"
            type="button"
            onClick={() => { setActionError(null); setStatusTarget(row); }}
          >
            {row.status === 'ACTIVE' ? 'Ngừng hợp tác' : 'Kích hoạt lại'}
          </button>
        </div>
      ),
    },
  ], []);

  const pagination = state.data?.pagination ?? { page, totalPages: 0 };

  return (
    <section className="workspace-page">
      <PageHeader
        eyebrow="MH-10 · F19"
        title="Quản lý nhà cung cấp"
        description="Quản lý hồ sơ đối tác, thông tin liên hệ và trạng thái hợp tác mà không xóa dữ liệu đã phát sinh."
        actions={<button className="button button--primary" type="button" onClick={() => openEditor()}>Thêm nhà cung cấp</button>}
      />
      <Notice tone="success">{success}</Notice>
      <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>

      <form
        className="filter-bar admin-filter"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setAppliedFilters(filters);
        }}
      >
        <FormField htmlFor="supplierSearch" label="Tên hoặc số điện thoại">
          <input
            id="supplierSearch"
            type="search"
            placeholder="Nhập tên hoặc số điện thoại"
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          />
        </FormField>
        <FormField htmlFor="supplierStatusFilter" label="Trạng thái">
          <select
            id="supplierStatusFilter"
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="">Tất cả</option>
            <option value="ACTIVE">Đang hợp tác</option>
            <option value="INACTIVE">Ngừng hợp tác</option>
          </select>
        </FormField>
        <button className="button button--primary" type="submit">Tìm kiếm</button>
      </form>

      <AsyncContent
        error={state.error}
        isLoading={state.isLoading}
        loadingMessage="Đang tải danh sách nhà cung cấp…"
        onRetry={refresh}
        isEmpty={state.data?.items.length === 0}
        emptyTitle="Không tìm thấy nhà cung cấp"
        emptyMessage="Hãy thay đổi từ khóa hoặc bộ lọc trạng thái."
      >
        {state.data?.items.length > 0 && (
          <>
            <DataTable
              caption="Danh sách nhà cung cấp"
              columns={columns}
              getRowKey={(row) => row.supplierId}
              rows={state.data.items}
            />
            <Pagination
              disabled={state.isLoading}
              page={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </AsyncContent>

      {editor && (
        <Modal
          title={editor.supplier ? `Cập nhật ${editor.supplier.supplierId}` : 'Thêm nhà cung cấp'}
          description="Các trường có dấu * là bắt buộc. Trạng thái được thay đổi bằng thao tác riêng có xác nhận."
          onClose={() => !isSubmitting && setEditor(null)}
          size="large"
        >
          <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>
          {editor.isLoading ? (
            <AsyncContent isLoading loadingMessage="Đang tải hồ sơ nhà cung cấp…" />
          ) : (
            <SupplierForm
              isSubmitting={isSubmitting}
              onCancel={() => setEditor(null)}
              onSubmit={save}
              supplier={editor.supplier}
            />
          )}
        </Modal>
      )}

      {statusTarget && (
        <ConfirmDialog
          title={statusTarget.status === 'ACTIVE' ? 'Ngừng hợp tác với nhà cung cấp?' : 'Kích hoạt lại nhà cung cấp?'}
          description={`${statusTarget.supplierId} · ${statusTarget.name}. Thao tác chỉ đổi trạng thái, không xóa dữ liệu.`}
          confirmLabel={statusTarget.status === 'ACTIVE' ? 'Ngừng hợp tác' : 'Kích hoạt lại'}
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

export default SupplierManagementPage;
