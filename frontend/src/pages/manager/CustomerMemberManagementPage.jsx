import { useEffect, useMemo, useState } from 'react';
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
  getCustomer,
  getCustomerInvoice,
  listCustomerInvoices,
  listCustomers,
  updateCustomerAccountStatus,
} from '../../services/admin.service';
import {
  ACCOUNT_STATUS_LABELS,
  CUSTOMER_STATUS_LABELS,
  getCustomerAccountTransition,
  MEMBERSHIP_TIER_LABELS,
  MEMBERSHIP_TIERS,
  validateHistoryDateRange,
} from './customerMember';

const PAGE_SIZE = 10;
const HISTORY_PAGE_SIZE = 5;
const money = new Intl.NumberFormat('vi-VN', {
  currency: 'VND',
  maximumFractionDigits: 0,
  style: 'currency',
});
const integer = new Intl.NumberFormat('vi-VN');
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

function displayDate(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('vi-VN');
}

function displayDateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateTime.format(parsed);
}

function StatusBadge({ status, labels }) {
  return (
    <span className={`status-badge status-badge--${String(status).toLowerCase()}`}>
      {labels[status] ?? status}
    </span>
  );
}

function CustomerHistoryModal({ customerId, onClose }) {
  const [customerReloadKey, setCustomerReloadKey] = useState(0);
  const [customerState, setCustomerState] = useState({ data: null, error: null, isLoading: true });
  const [filters, setFilters] = useState({ from: '', to: '' });
  const [appliedFilters, setAppliedFilters] = useState({ from: '', to: '' });
  const [dateError, setDateError] = useState('');
  const [page, setPage] = useState(1);
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
  const [historyState, setHistoryState] = useState({ data: null, error: null, isLoading: true });
  const [invoiceState, setInvoiceState] = useState({ data: null, error: null, invoiceId: null, isLoading: false });

  useEffect(() => {
    const controller = new AbortController();
    setCustomerState({ data: null, error: null, isLoading: true });
    getCustomer(customerId, { signal: controller.signal })
      .then((data) => setCustomerState({ data, error: null, isLoading: false }))
      .catch((error) => {
        if (error.name !== 'AbortError') setCustomerState({ data: null, error, isLoading: false });
      });
    return () => controller.abort();
  }, [customerId, customerReloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    setHistoryState((current) => ({ ...current, error: null, isLoading: true }));
    listCustomerInvoices(
      customerId,
      { ...appliedFilters, page, pageSize: HISTORY_PAGE_SIZE },
      { signal: controller.signal },
    )
      .then((data) => setHistoryState({ data, error: null, isLoading: false }))
      .catch((error) => {
        if (error.name !== 'AbortError') setHistoryState({ data: null, error, isLoading: false });
      });
    return () => controller.abort();
  }, [appliedFilters, customerId, historyReloadKey, page]);

  const loadInvoice = async (invoiceId) => {
    setInvoiceState({ data: null, error: null, invoiceId, isLoading: true });
    try {
      const data = await getCustomerInvoice(customerId, invoiceId);
      setInvoiceState({ data, error: null, invoiceId, isLoading: false });
    } catch (error) {
      setInvoiceState({ data: null, error, invoiceId, isLoading: false });
    }
  };

  const applyHistoryFilters = (event) => {
    event.preventDefault();
    const error = validateHistoryDateRange(filters);
    setDateError(error);
    if (error) return;
    setPage(1);
    setInvoiceState({ data: null, error: null, invoiceId: null, isLoading: false });
    setAppliedFilters(filters);
  };

  const historyColumns = [
    { key: 'invoiceId', header: 'Mã hóa đơn' },
    { key: 'purchasedAt', header: 'Ngày mua', render: (row) => displayDateTime(row.purchasedAt) },
    { key: 'totalAmount', header: 'Thanh toán', render: (row) => money.format(row.totalAmount) },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (row) => (
        <StatusBadge status={row.status} labels={{ PAID: 'Đã thanh toán', REFUNDED: 'Đã hoàn tiền' }} />
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (row) => (
        <button className="table-action" type="button" onClick={() => loadInvoice(row.invoiceId)}>
          Xem hóa đơn
        </button>
      ),
    },
  ];

  const customer = customerState.data;
  const pagination = historyState.data?.pagination ?? { page, totalPages: 0 };

  return (
    <Modal
      title={customer ? `${customer.customerId} · ${customer.fullName}` : 'Chi tiết khách hàng thành viên'}
      description="Hồ sơ, tài khoản và lịch sử hóa đơn của khách hàng được chọn."
      onClose={onClose}
      size="large"
    >
      <AsyncContent
        error={customerState.error}
        isLoading={customerState.isLoading}
        loadingMessage="Đang tải hồ sơ khách hàng…"
        onRetry={() => setCustomerReloadKey((value) => value + 1)}
      >
        {customer && (
          <div className="customer-detail-grid">
            <dl className="description-list">
              <div><dt>Số điện thoại</dt><dd>{customer.phone}</dd></div>
              <div><dt>Email</dt><dd>{customer.email || '—'}</dd></div>
              <div><dt>Ngày sinh</dt><dd>{displayDate(customer.dateOfBirth)}</dd></div>
              <div><dt>Địa chỉ</dt><dd>{customer.address || '—'}</dd></div>
              <div><dt>Ngày đăng ký</dt><dd>{displayDate(customer.registeredAt)}</dd></div>
            </dl>
            <dl className="description-list">
              <div><dt>Điểm tích lũy</dt><dd>{integer.format(customer.loyaltyPoints)}</dd></div>
              <div><dt>Hạng thành viên</dt><dd>{MEMBERSHIP_TIER_LABELS[customer.membershipTier] ?? customer.membershipTier}</dd></div>
              <div><dt>Trạng thái thành viên</dt><dd>{CUSTOMER_STATUS_LABELS[customer.status] ?? customer.status}</dd></div>
              <div><dt>Tên đăng nhập</dt><dd>{customer.account?.username || 'Chưa có tài khoản'}</dd></div>
              <div><dt>Trạng thái tài khoản</dt><dd>{customer.account ? ACCOUNT_STATUS_LABELS[customer.account.status] ?? customer.account.status : '—'}</dd></div>
            </dl>
          </div>
        )}
      </AsyncContent>

      <section className="customer-history-section">
        <div className="section-heading section-heading--compact">
          <div>
            <h3>Hóa đơn đã hoàn tất</h3>
          </div>
        </div>
        <form className="filter-bar history-filter" onSubmit={applyHistoryFilters}>
          <FormField htmlFor="customerHistoryFrom" label="Từ ngày" error={dateError}>
            <input id="customerHistoryFrom" type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
          </FormField>
          <FormField htmlFor="customerHistoryTo" label="Đến ngày">
            <input id="customerHistoryTo" type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
          </FormField>
          <button className="button button--primary" type="submit">Lọc hóa đơn</button>
        </form>
        <AsyncContent
          error={historyState.error}
          isLoading={historyState.isLoading}
          loadingMessage="Đang tải lịch sử mua hàng…"
          isEmpty={historyState.data?.items.length === 0}
          emptyTitle="Chưa có hóa đơn phù hợp"
          emptyMessage="Khách hàng chưa có hóa đơn hoàn tất trong khoảng thời gian này."
          onRetry={() => setHistoryReloadKey((value) => value + 1)}
        >
          {historyState.data?.items.length > 0 && (
            <>
              <DataTable
                caption="Lịch sử hóa đơn khách hàng"
                columns={historyColumns}
                getRowKey={(row) => row.invoiceId}
                rows={historyState.data.items}
              />
              <Pagination
                disabled={historyState.isLoading}
                page={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={(nextPage) => {
                  setInvoiceState({ data: null, error: null, invoiceId: null, isLoading: false });
                  setPage(nextPage);
                }}
              />
            </>
          )}
        </AsyncContent>
      </section>

      {(invoiceState.isLoading || invoiceState.error || invoiceState.data) && (
        <section className="invoice-detail customer-invoice-detail">
          <AsyncContent
            error={invoiceState.error}
            isLoading={invoiceState.isLoading}
            loadingMessage="Đang tải chi tiết hóa đơn…"
            onRetry={() => invoiceState.invoiceId && loadInvoice(invoiceState.invoiceId)}
          >
            {invoiceState.data && (
              <>
                <div className="invoice-detail__heading">
                  <div>
                    <h3>Hóa đơn {invoiceState.data.invoiceId}</h3>
                    <p>{displayDateTime(invoiceState.data.purchasedAt)}</p>
                  </div>
                  <button className="button button--ghost" type="button" onClick={() => setInvoiceState({ data: null, error: null, invoiceId: null, isLoading: false })}>Đóng chi tiết</button>
                </div>
                <DataTable
                  caption={`Sản phẩm trong hóa đơn ${invoiceState.data.invoiceId}`}
                  columns={[
                    { key: 'productId', header: 'Mã SP' },
                    { key: 'productName', header: 'Tên sản phẩm' },
                    { key: 'quantity', header: 'Số lượng' },
                    { key: 'unitPrice', header: 'Đơn giá', render: (row) => money.format(row.unitPrice) },
                    { key: 'discountAmount', header: 'Giảm', render: (row) => money.format(row.discountAmount) },
                    { key: 'lineTotal', header: 'Thành tiền', render: (row) => money.format(row.lineTotal) },
                  ]}
                  getRowKey={(row) => row.productId}
                  rows={invoiceState.data.items}
                />
                <dl className="invoice-totals">
                  <div><dt>Tiền hàng</dt><dd>{money.format(invoiceState.data.subtotal)}</dd></div>
                  <div><dt>Giảm giá</dt><dd>{money.format(invoiceState.data.discountAmount)}</dd></div>
                  <div><dt>Thanh toán</dt><dd>{money.format(invoiceState.data.totalAmount)}</dd></div>
                </dl>
              </>
            )}
          </AsyncContent>
        </section>
      )}
    </Modal>
  );
}

function CustomerMemberManagementPage() {
  const [filters, setFilters] = useState({ search: '', membershipTier: '', status: '' });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', membershipTier: '', status: '' });
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, error: null, isLoading: true }));
    listCustomers(
      { ...appliedFilters, page, pageSize: PAGE_SIZE },
      { signal: controller.signal },
    )
      .then((data) => setState({ data, error: null, isLoading: false }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ data: null, error, isLoading: false });
      });
    return () => controller.abort();
  }, [appliedFilters, page, reloadKey]);

  const columns = useMemo(() => [
    { key: 'customerId', header: 'Mã KH' },
    { key: 'fullName', header: 'Họ tên' },
    { key: 'phone', header: 'SĐT' },
    { key: 'email', header: 'Email', render: (row) => row.email || '—' },
    { key: 'loyaltyPoints', header: 'Điểm', render: (row) => integer.format(row.loyaltyPoints) },
    { key: 'membershipTier', header: 'Hạng', render: (row) => MEMBERSHIP_TIER_LABELS[row.membershipTier] ?? row.membershipTier },
    { key: 'registeredAt', header: 'Ngày đăng ký', render: (row) => displayDate(row.registeredAt) },
    { key: 'status', header: 'Trạng thái', render: (row) => <StatusBadge status={row.status} labels={CUSTOMER_STATUS_LABELS} /> },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (row) => {
        const transition = getCustomerAccountTransition(row);
        return (
          <div className="table-actions customer-table-actions">
            <button className="table-action" type="button" onClick={() => setSelectedCustomerId(row.customerId)}>Chi tiết & lịch sử</button>
            {transition ? (
              <button
                className={`table-action ${transition.nextStatus === 'LOCKED' ? 'table-action--danger' : ''}`}
                type="button"
                onClick={() => {
                  setActionError(null);
                  setStatusTarget(row);
                }}
              >
                {transition.label}
              </button>
            ) : <small className="muted-text">Không thể đổi trạng thái</small>}
          </div>
        );
      },
    },
  ], []);

  const refresh = () => setReloadKey((value) => value + 1);
  const transition = getCustomerAccountTransition(statusTarget);

  const changeAccountStatus = async () => {
    if (!statusTarget || !transition) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await updateCustomerAccountStatus(statusTarget.customerId, transition.nextStatus);
      setSuccess(
        transition.nextStatus === 'LOCKED'
          ? `Đã khóa tài khoản của ${statusTarget.fullName}.`
          : `Đã mở khóa tài khoản của ${statusTarget.fullName}.`,
      );
      setStatusTarget(null);
      refresh();
    } catch (error) {
      setActionError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const pagination = state.data?.pagination ?? { page, totalPages: 0 };

  return (
    <section className="workspace-page">
      <PageHeader
        title="Khách hàng thành viên"
        description="Theo dõi hồ sơ, điểm tích lũy, hạng thành viên, lịch sử hóa đơn và trạng thái tài khoản khách hàng."
      />
      <Notice tone="success">{success}</Notice>
      <Notice tone="error">{actionError && !statusTarget && getErrorMessage(actionError)}</Notice>

      <form
        className="filter-bar admin-filter admin-filter--customers"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setAppliedFilters(filters);
        }}
      >
        <FormField htmlFor="customerSearch" label="SĐT, tên hoặc email">
          <input id="customerSearch" type="search" placeholder="Nhập thông tin khách hàng" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        </FormField>
        <FormField htmlFor="membershipTierFilter" label="Hạng thành viên">
          <select id="membershipTierFilter" value={filters.membershipTier} onChange={(event) => setFilters((current) => ({ ...current, membershipTier: event.target.value }))}>
            <option value="">Tất cả</option>
            {MEMBERSHIP_TIERS.map(({ label, value }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </FormField>
        <FormField htmlFor="customerStatusFilter" label="Trạng thái">
          <select id="customerStatusFilter" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">Tất cả</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="INACTIVE">Ngừng hoạt động</option>
          </select>
        </FormField>
        <button className="button button--primary" type="submit">Tìm kiếm</button>
      </form>

      <AsyncContent
        error={state.error}
        isLoading={state.isLoading}
        loadingMessage="Đang tải danh sách khách hàng thành viên…"
        onRetry={refresh}
        isEmpty={state.data?.items.length === 0}
        emptyTitle="Không tìm thấy khách hàng"
        emptyMessage="Hãy thay đổi từ khóa, hạng thành viên hoặc trạng thái."
      >
        {state.data?.items.length > 0 && (
          <>
            <DataTable
              caption="Danh sách khách hàng thành viên"
              columns={columns}
              getRowKey={(row) => row.customerId}
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

      {selectedCustomerId && (
        <CustomerHistoryModal
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
        />
      )}

      {statusTarget && transition && (
        <ConfirmDialog
          title={transition.nextStatus === 'LOCKED' ? `Khóa tài khoản ${statusTarget.fullName}?` : `Mở khóa tài khoản ${statusTarget.fullName}?`}
          description={transition.nextStatus === 'LOCKED' ? 'Khách hàng sẽ không thể đăng nhập cho tới khi tài khoản được mở khóa.' : 'Khách hàng sẽ có thể đăng nhập lại bằng tài khoản hiện tại.'}
          confirmLabel={transition.label}
          tone={transition.nextStatus === 'LOCKED' ? 'danger' : 'primary'}
          error={actionError && getErrorMessage(actionError)}
          isSubmitting={isSubmitting}
          onCancel={() => !isSubmitting && setStatusTarget(null)}
          onConfirm={changeAccountStatus}
        />
      )}
    </section>
  );
}

export default CustomerMemberManagementPage;
