import { useCallback, useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '../../api';
import { ROLE_LABELS } from '../../auth/roles';
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
  createAccount,
  listAccounts,
  resetEmployeePassword,
  updateAccountRole,
  updateAccountStatus,
} from '../../services/admin.service';
import {
  buildAccountPayload,
  EMPTY_ACCOUNT_FORM,
  EMPLOYEE_ROLES,
  validateAccountForm,
  validateResetPasswordForm,
} from './adminForms';

const PAGE_SIZE = 10;
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

function displayDateTime(value) {
  if (!value) return 'Chưa đăng nhập';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateTime.format(parsed);
}

function AccountCreateForm({ isSubmitting, onCancel, onSubmit }) {
  const [form, setForm] = useState({ ...EMPTY_ACCOUNT_FORM });
  const [errors, setErrors] = useState({});
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const changeOwnerType = (ownerType) => {
    setForm((current) => ({
      ...current,
      ownerType,
      ownerId: '',
      role: ownerType === 'CUSTOMER' ? 'CUSTOMER' : 'CASHIER',
    }));
  };

  const submit = (event) => {
    event.preventDefault();
    const nextErrors = validateAccountForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) onSubmit(buildAccountPayload(form));
  };

  return (
    <form className="admin-form" onSubmit={submit} noValidate>
      <div className="form-grid form-grid--two">
        <FormField htmlFor="accountOwnerType" label="Loại chủ sở hữu" required>
          <select id="accountOwnerType" value={form.ownerType} onChange={(event) => changeOwnerType(event.target.value)}>
            <option value="EMPLOYEE">Nhân viên</option>
            <option value="CUSTOMER">Khách hàng</option>
          </select>
        </FormField>
        <FormField htmlFor="accountOwnerId" label="Mã chủ sở hữu" required error={errors.ownerId} hint={form.ownerType === 'EMPLOYEE' ? 'Nhập mã nhân viên đang hoạt động.' : 'Nhập mã khách hàng hiện có.'}>
          <input id="accountOwnerId" value={form.ownerId} onChange={(event) => update('ownerId', event.target.value)} autoFocus />
        </FormField>
        <FormField htmlFor="accountUsername" label="Tên đăng nhập" required error={errors.username}>
          <input id="accountUsername" autoComplete="off" value={form.username} onChange={(event) => update('username', event.target.value)} />
        </FormField>
        <FormField htmlFor="accountRole" label="Role" required error={errors.role}>
          <select id="accountRole" value={form.role} disabled={form.ownerType === 'CUSTOMER'} onChange={(event) => update('role', event.target.value)}>
            {(form.ownerType === 'CUSTOMER' ? ['CUSTOMER'] : EMPLOYEE_ROLES).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
          </select>
        </FormField>
        <FormField htmlFor="accountPassword" label="Mật khẩu ban đầu" required error={errors.password}>
          <input id="accountPassword" type="password" autoComplete="new-password" value={form.password} onChange={(event) => update('password', event.target.value)} />
        </FormField>
        <FormField htmlFor="accountPasswordConfirmation" label="Xác nhận mật khẩu" required error={errors.passwordConfirmation}>
          <input id="accountPasswordConfirmation" type="password" autoComplete="new-password" value={form.passwordConfirmation} onChange={(event) => update('passwordConfirmation', event.target.value)} />
        </FormField>
      </div>
      <p className="form-note">Mật khẩu được gửi qua kết nối API để backend băm trước khi lưu; giao diện không nhận lại dữ liệu mật khẩu đã băm.</p>
      <div className="modal__actions">
        <button className="button button--ghost" type="button" onClick={onCancel} disabled={isSubmitting}>Hủy</button>
        <button className="button button--primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
      </div>
    </form>
  );
}

function RoleEditor({ account, isSubmitting, onCancel, onSubmit }) {
  const [role, setRole] = useState(account.role);
  const roles = account.owner.type === 'CUSTOMER' ? ['CUSTOMER'] : EMPLOYEE_ROLES;
  return (
    <form className="admin-form" onSubmit={(event) => { event.preventDefault(); onSubmit(role); }}>
      <FormField htmlFor="newAccountRole" label="Role mới" required>
        <select id="newAccountRole" value={role} onChange={(event) => setRole(event.target.value)}>
          {roles.map((value) => <option key={value} value={value}>{ROLE_LABELS[value]}</option>)}
        </select>
      </FormField>
      <p className="form-note">Bạn đang thay quyền truy cập của {account.username}. Thao tác sẽ được backend ghi nhật ký.</p>
      <div className="modal__actions">
        <button className="button button--ghost" type="button" onClick={onCancel} disabled={isSubmitting}>Hủy</button>
        <button className="button button--danger" type="submit" disabled={isSubmitting || role === account.role}>{isSubmitting ? 'Đang lưu…' : 'Xác nhận đổi role'}</button>
      </div>
    </form>
  );
}

function ResetPasswordForm({ account, isSubmitting, onCancel, onSubmit }) {
  const [form, setForm] = useState({ newPassword: '', newPasswordConfirmation: '' });
  const [errors, setErrors] = useState({});
  const submit = (event) => {
    event.preventDefault();
    const nextErrors = validateResetPasswordForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) onSubmit(form);
  };
  return (
    <form className="admin-form" onSubmit={submit} noValidate>
      <Notice tone="warning">Schema hiện tại chưa có cờ bắt buộc đổi mật khẩu ở lần đăng nhập tiếp theo. Hãy cấp mật khẩu tạm bằng kênh an toàn.</Notice>
      <FormField htmlFor="resetPassword" label="Mật khẩu tạm mới" required error={errors.newPassword}>
        <input id="resetPassword" type="password" autoComplete="new-password" value={form.newPassword} onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value }))} autoFocus />
      </FormField>
      <FormField htmlFor="resetPasswordConfirmation" label="Xác nhận mật khẩu" required error={errors.newPasswordConfirmation}>
        <input id="resetPasswordConfirmation" type="password" autoComplete="new-password" value={form.newPasswordConfirmation} onChange={(event) => setForm((current) => ({ ...current, newPasswordConfirmation: event.target.value }))} />
      </FormField>
      <p className="form-note">Backend chỉ cho phép cấp lại mật khẩu tài khoản nhân viên và sẽ ghi nhật ký thao tác.</p>
      <div className="modal__actions">
        <button className="button button--ghost" type="button" onClick={onCancel} disabled={isSubmitting}>Hủy</button>
        <button className="button button--danger" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang cấp lại…' : `Xác nhận cấp lại cho ${account.username}`}</button>
      </div>
    </form>
  );
}

function AccountManagementPage() {
  const [filters, setFilters] = useState({ search: '', ownerType: '', role: '', status: '' });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', ownerType: '', role: '', status: '' });
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [dialog, setDialog] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [success, setSuccess] = useState('');

  const load = useCallback(async (signal) => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await listAccounts({ ...appliedFilters, page, pageSize: PAGE_SIZE }, { signal });
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
  const openDialog = (nextDialog) => { setActionError(null); setDialog(nextDialog); };

  const runAction = async (action, message) => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      await action();
      setSuccess(message);
      setDialog(null);
      refresh();
    } catch (error) {
      setActionError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = useMemo(() => [
    { key: 'accountId', header: 'Mã TK' },
    { key: 'username', header: 'Tên đăng nhập' },
    { key: 'owner', header: 'Chủ sở hữu', render: (row) => <div className="owner-cell"><strong>{row.owner.name}</strong><small>{row.owner.id} · {row.owner.type === 'EMPLOYEE' ? 'Nhân viên' : 'Khách hàng'}</small></div> },
    { key: 'role', header: 'Role', render: (row) => ROLE_LABELS[row.role] ?? row.role },
    { key: 'status', header: 'Trạng thái', render: (row) => <span className={`status-badge status-badge--${row.status.toLowerCase()}`}>{({ ACTIVE: 'Hoạt động', LOCKED: 'Đã khóa', INACTIVE: 'Ngừng hoạt động' })[row.status] ?? row.status}</span> },
    { key: 'lastLoginAt', header: 'Đăng nhập gần nhất', render: (row) => displayDateTime(row.lastLoginAt) },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (row) => (
        <div className="table-actions">
          {row.owner.type === 'EMPLOYEE' && <button className="table-action" type="button" onClick={() => openDialog({ type: 'role', account: row })}>Đổi role</button>}
          {['ACTIVE', 'LOCKED'].includes(row.status) && <button className="table-action table-action--danger" type="button" onClick={() => openDialog({ type: 'status', account: row })}>{row.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'}</button>}
          {row.owner.type === 'EMPLOYEE' && <button className="table-action" type="button" onClick={() => openDialog({ type: 'reset', account: row })}>Cấp lại mật khẩu</button>}
        </div>
      ),
    },
  ], []);

  const account = dialog?.account;
  const pagination = state.data?.pagination ?? { page, totalPages: 0 };

  return (
    <section className="workspace-page">
      <PageHeader
        eyebrow="MH-20 · F32"
        title="Tài khoản và phân quyền"
        description="Quản lý tài khoản nhân viên và khách hàng; mọi thao tác nhạy cảm được backend kiểm tra quyền và ghi audit."
        actions={<button className="button button--primary" type="button" onClick={() => openDialog({ type: 'create' })}>Tạo tài khoản</button>}
      />
      <Notice tone="success">{success}</Notice>
      <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>

      <form className="filter-bar admin-filter admin-filter--wide" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedFilters(filters); }}>
        <FormField htmlFor="accountSearch" label="Tên đăng nhập / chủ sở hữu">
          <input id="accountSearch" type="search" placeholder="Nhập từ khóa" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        </FormField>
        <FormField htmlFor="ownerTypeFilter" label="Chủ sở hữu">
          <select id="ownerTypeFilter" value={filters.ownerType} onChange={(event) => setFilters((current) => ({ ...current, ownerType: event.target.value }))}>
            <option value="">Tất cả</option><option value="EMPLOYEE">Nhân viên</option><option value="CUSTOMER">Khách hàng</option>
          </select>
        </FormField>
        <FormField htmlFor="roleFilter" label="Role">
          <select id="roleFilter" value={filters.role} onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value }))}>
            <option value="">Tất cả</option>{['CUSTOMER', ...EMPLOYEE_ROLES].map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
          </select>
        </FormField>
        <FormField htmlFor="accountStatusFilter" label="Trạng thái">
          <select id="accountStatusFilter" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">Tất cả</option><option value="ACTIVE">Hoạt động</option><option value="LOCKED">Đã khóa</option><option value="INACTIVE">Ngừng hoạt động</option>
          </select>
        </FormField>
        <button className="button button--primary" type="submit">Áp dụng</button>
      </form>

      <AsyncContent error={state.error} isLoading={state.isLoading} loadingMessage="Đang tải danh sách tài khoản…" onRetry={() => refresh()} isEmpty={state.data?.items.length === 0} emptyTitle="Không tìm thấy tài khoản" emptyMessage="Hãy thay đổi từ khóa hoặc bộ lọc.">
        {state.data?.items.length > 0 && (
          <>
            <DataTable caption="Danh sách tài khoản" columns={columns} getRowKey={(row) => row.accountId} rows={state.data.items} />
            <Pagination disabled={state.isLoading} page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
          </>
        )}
      </AsyncContent>

      {dialog?.type === 'create' && (
        <Modal title="Tạo tài khoản" description="Liên kết tài khoản với đúng nhân viên hoặc khách hàng hiện có." onClose={() => !isSubmitting && setDialog(null)} size="large">
          <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>
          <AccountCreateForm isSubmitting={isSubmitting} onCancel={() => setDialog(null)} onSubmit={(payload) => runAction(() => createAccount(payload), `Đã tạo tài khoản ${payload.username}.`)} />
        </Modal>
      )}
      {dialog?.type === 'role' && (
        <Modal title={`Đổi role · ${account.username}`} description={`${account.owner.name} · ${account.owner.id}`} onClose={() => !isSubmitting && setDialog(null)} size="small">
          <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>
          <RoleEditor account={account} isSubmitting={isSubmitting} onCancel={() => setDialog(null)} onSubmit={(role) => runAction(() => updateAccountRole(account.accountId, role), `Đã đổi role của ${account.username} thành ${role}.`)} />
        </Modal>
      )}
      {dialog?.type === 'status' && (
        <ConfirmDialog
          title={account.status === 'ACTIVE' ? `Khóa tài khoản ${account.username}?` : `Mở khóa tài khoản ${account.username}?`}
          description={account.status === 'ACTIVE' ? 'Tài khoản sẽ không thể đăng nhập cho tới khi được mở khóa.' : 'Tài khoản sẽ có thể đăng nhập lại theo role hiện tại.'}
          confirmLabel={account.status === 'ACTIVE' ? 'Khóa tài khoản' : 'Mở khóa'}
          tone={account.status === 'ACTIVE' ? 'danger' : 'primary'}
          error={actionError && getErrorMessage(actionError)}
          isSubmitting={isSubmitting}
          onCancel={() => !isSubmitting && setDialog(null)}
          onConfirm={() => {
            const status = account.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE';
            runAction(() => updateAccountStatus(account.accountId, status), `Đã chuyển ${account.username} sang ${status}.`);
          }}
        />
      )}
      {dialog?.type === 'reset' && (
        <Modal title={`Cấp lại mật khẩu · ${account.username}`} description={`${account.owner.name} · ${account.owner.id}`} onClose={() => !isSubmitting && setDialog(null)} size="small">
          <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>
          <ResetPasswordForm account={account} isSubmitting={isSubmitting} onCancel={() => setDialog(null)} onSubmit={(payload) => runAction(() => resetEmployeePassword(account.accountId, payload), `Đã cấp lại mật khẩu cho ${account.username}.`)} />
        </Modal>
      )}
    </section>
  );
}

export default AccountManagementPage;
