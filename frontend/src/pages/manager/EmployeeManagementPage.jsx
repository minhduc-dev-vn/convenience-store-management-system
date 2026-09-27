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
import { createEmployee, listEmployees, updateEmployee } from '../../services/admin.service';
import {
  buildEmployeePayload,
  EMPTY_EMPLOYEE_FORM,
  employeeToForm,
  validateEmployeeForm,
} from './adminForms';

const PAGE_SIZE = 10;
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

function displayDate(value) {
  if (!value) return '—';
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('vi-VN');
}

function EmployeeForm({ employee, isSubmitting, onCancel, onSubmit }) {
  const [form, setForm] = useState(() => (employee ? employeeToForm(employee) : { ...EMPTY_EMPLOYEE_FORM }));
  const [errors, setErrors] = useState({});
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = (event) => {
    event.preventDefault();
    const nextErrors = validateEmployeeForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) onSubmit(buildEmployeePayload(form));
  };

  return (
    <form className="admin-form" onSubmit={submit} noValidate>
      <div className="form-grid form-grid--two">
        <FormField htmlFor="employeeFullName" label="Họ và tên" required error={errors.fullName}>
          <input id="employeeFullName" value={form.fullName} onChange={(event) => update('fullName', event.target.value)} autoFocus />
        </FormField>
        <FormField htmlFor="employeeGender" label="Giới tính">
          <select id="employeeGender" value={form.gender ?? ''} onChange={(event) => update('gender', event.target.value)}>
            <option value="">Chưa xác định</option>
            <option value="MALE">Nam</option>
            <option value="FEMALE">Nữ</option>
            <option value="OTHER">Khác</option>
          </select>
        </FormField>
        <FormField htmlFor="employeeDob" label="Ngày sinh" error={errors.dateOfBirth}>
          <input id="employeeDob" type="date" value={form.dateOfBirth ?? ''} onChange={(event) => update('dateOfBirth', event.target.value)} />
        </FormField>
        <FormField htmlFor="employeePhone" label="Số điện thoại" required error={errors.phone}>
          <input id="employeePhone" type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} />
        </FormField>
        <FormField htmlFor="employeeEmail" label="Email" error={errors.email}>
          <input id="employeeEmail" type="email" value={form.email ?? ''} onChange={(event) => update('email', event.target.value)} />
        </FormField>
        <FormField htmlFor="employeeStartDate" label="Ngày bắt đầu" required error={errors.startDate}>
          <input id="employeeStartDate" type="date" value={form.startDate ?? ''} onChange={(event) => update('startDate', event.target.value)} />
        </FormField>
        <FormField htmlFor="employeeSalary" label="Lương cơ bản" error={errors.baseSalary}>
          <input id="employeeSalary" type="number" min="0" step="1000" value={form.baseSalary ?? ''} onChange={(event) => update('baseSalary', event.target.value)} />
        </FormField>
        {!employee && (
          <FormField htmlFor="employeeStatus" label="Trạng thái">
            <select id="employeeStatus" value={form.status} onChange={(event) => update('status', event.target.value)}>
              <option value="ACTIVE">Đang làm việc</option>
              <option value="INACTIVE">Ngừng hoạt động</option>
            </select>
          </FormField>
        )}
      </div>
      <FormField htmlFor="employeeAddress" label="Địa chỉ">
        <textarea id="employeeAddress" rows="3" value={form.address ?? ''} onChange={(event) => update('address', event.target.value)} />
      </FormField>
      {employee && <p className="form-note">Trạng thái được thay đổi bằng thao tác riêng có bước xác nhận ở danh sách.</p>}
      <div className="modal__actions">
        <button className="button button--ghost" type="button" onClick={onCancel} disabled={isSubmitting}>Hủy</button>
        <button className="button button--primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang lưu…' : 'Lưu hồ sơ'}</button>
      </div>
    </form>
  );
}

function EmployeeManagementPage() {
  const [filters, setFilters] = useState({ search: '', status: '' });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', status: '' });
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [editor, setEditor] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [success, setSuccess] = useState('');

  const load = useCallback(async (signal) => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await listEmployees({ ...appliedFilters, page, pageSize: PAGE_SIZE }, { signal });
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

  const saveEmployee = async (payload) => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      if (editor.employee) {
        await updateEmployee(editor.employee.employeeId, payload);
        setSuccess(`Đã cập nhật hồ sơ ${editor.employee.employeeId}.`);
      } else {
        const created = await createEmployee(payload);
        setSuccess(`Đã tạo nhân viên ${created.employeeId}.`);
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
      await updateEmployee(statusTarget.employeeId, { status: nextStatus });
      setSuccess(`Đã chuyển ${statusTarget.employeeId} sang ${nextStatus}.`);
      setStatusTarget(null);
      refresh();
    } catch (error) {
      setActionError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = useMemo(() => [
    { key: 'employeeId', header: 'Mã NV' },
    { key: 'fullName', header: 'Họ tên' },
    { key: 'gender', header: 'Giới tính', render: (row) => ({ MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' }[row.gender] ?? '—') },
    { key: 'dateOfBirth', header: 'Ngày sinh', render: (row) => displayDate(row.dateOfBirth) },
    { key: 'phone', header: 'Điện thoại' },
    { key: 'email', header: 'Email', render: (row) => row.email || '—' },
    { key: 'startDate', header: 'Bắt đầu', render: (row) => displayDate(row.startDate) },
    { key: 'baseSalary', header: 'Lương cơ bản', render: (row) => row.baseSalary == null ? '—' : money.format(row.baseSalary) },
    { key: 'status', header: 'Trạng thái', render: (row) => <span className={`status-badge status-badge--${row.status.toLowerCase()}`}>{row.status === 'ACTIVE' ? 'Đang làm' : 'Ngừng'}</span> },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (row) => (
        <div className="table-actions">
          <button className="table-action" type="button" onClick={() => { setActionError(null); setEditor({ employee: row }); }}>Cập nhật</button>
          <button className="table-action table-action--danger" type="button" onClick={() => { setActionError(null); setStatusTarget(row); }}>
            {row.status === 'ACTIVE' ? 'Ngừng hoạt động' : 'Kích hoạt'}
          </button>
        </div>
      ),
    },
  ], []);

  const pagination = state.data?.pagination ?? { page, totalPages: 0 };

  return (
    <section className="workspace-page">
      <PageHeader
        eyebrow="MH-19 · F31"
        title="Quản lý nhân viên"
        description="Tra cứu và duy trì hồ sơ nhân viên; dữ liệu đã phát sinh chỉ được chuyển trạng thái, không xóa."
        actions={<button className="button button--primary" type="button" onClick={() => { setActionError(null); setEditor({ employee: null }); }}>Thêm nhân viên</button>}
      />
      <Notice tone="success">{success}</Notice>
      <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>

      <form className="filter-bar admin-filter" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedFilters(filters); }}>
        <FormField htmlFor="employeeSearch" label="Tên hoặc số điện thoại">
          <input id="employeeSearch" type="search" placeholder="Nhập từ khóa" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        </FormField>
        <FormField htmlFor="employeeStatusFilter" label="Trạng thái">
          <select id="employeeStatusFilter" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">Tất cả</option>
            <option value="ACTIVE">Đang làm việc</option>
            <option value="INACTIVE">Ngừng hoạt động</option>
          </select>
        </FormField>
        <button className="button button--primary" type="submit">Tìm kiếm</button>
      </form>

      <AsyncContent error={state.error} isLoading={state.isLoading} loadingMessage="Đang tải danh sách nhân viên…" onRetry={() => refresh()} isEmpty={state.data?.items.length === 0} emptyTitle="Không tìm thấy nhân viên" emptyMessage="Hãy thay đổi từ khóa hoặc bộ lọc trạng thái.">
        {state.data?.items.length > 0 && (
          <>
            <DataTable caption="Danh sách nhân viên" columns={columns} getRowKey={(row) => row.employeeId} rows={state.data.items} />
            <Pagination disabled={state.isLoading} page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
          </>
        )}
      </AsyncContent>

      {editor && (
        <Modal title={editor.employee ? `Cập nhật ${editor.employee.employeeId}` : 'Thêm nhân viên'} description="Các trường có dấu * là bắt buộc." onClose={() => !isSubmitting && setEditor(null)} size="large">
          <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>
          <EmployeeForm employee={editor.employee} isSubmitting={isSubmitting} onCancel={() => setEditor(null)} onSubmit={saveEmployee} />
        </Modal>
      )}
      {statusTarget && (
        <ConfirmDialog
          title={statusTarget.status === 'ACTIVE' ? 'Chuyển nhân viên sang ngừng hoạt động?' : 'Kích hoạt lại nhân viên?'}
          description={`${statusTarget.employeeId} · ${statusTarget.fullName}. Thao tác này không xóa hồ sơ hoặc dữ liệu đã phát sinh.`}
          confirmLabel={statusTarget.status === 'ACTIVE' ? 'Ngừng hoạt động' : 'Kích hoạt'}
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

export default EmployeeManagementPage;
