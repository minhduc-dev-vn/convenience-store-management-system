import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
  cancelReceipt,
  confirmReceipt,
  getReceipt,
  listReceipts,
} from '../../services/receiving.service';

const PAGE_SIZE = 10;
const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 2,
});
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

function formatDateTime(value) {
  return value ? dateTime.format(new Date(value)) : '—';
}

function ReceiptDetail({ receipt, onCancel, onConfirm }) {
  const columns = [
    { key: 'product', header: 'Sản phẩm', render: (line) => <span className="owner-cell"><strong>{line.product.name}</strong><small>{line.product.productId}</small></span> },
    { key: 'manufacturerLot', header: 'Số lô' },
    { key: 'manufactureDate', header: 'NSX', render: (line) => line.manufactureDate || '—' },
    { key: 'expiryDate', header: 'HSD', render: (line) => line.expiryDate || '—' },
    { key: 'quantity', header: 'SL' },
    { key: 'unitCost', header: 'Đơn giá', render: (line) => money.format(line.unitCost) },
    { key: 'lineTotal', header: 'Thành tiền', render: (line) => money.format(line.lineTotal) },
  ];
  const isDraft = receipt.status === 'DRAFT';

  return (
    <section className="receipt-detail-card">
      <div className="receiving-card-heading receipt-detail-heading">
        <div>
          <h2>{receipt.receiptId}</h2>
          <p>{receipt.supplier.supplierId} · {receipt.supplier.name}</p>
        </div>
        <span className={`status-badge status-badge--${receipt.status.toLowerCase()}`}>{receipt.status}</span>
      </div>
      <dl className="receipt-meta-grid">
        <div><dt>Ngày nhập</dt><dd>{formatDateTime(receipt.receivedAt)}</dd></div>
        <div><dt>Người lập</dt><dd>{receipt.employee.name}</dd></div>
        <div><dt>Ngày xác nhận</dt><dd>{formatDateTime(receipt.confirmedAt)}</dd></div>
        <div><dt>Ghi chú</dt><dd>{receipt.note || '—'}</dd></div>
      </dl>
      <DataTable
        caption={`Chi tiết phiếu ${receipt.receiptId}`}
        columns={columns}
        emptyMessage="Phiếu nhập chưa có mặt hàng."
        getRowKey={(line) => line.detailId}
        rows={receipt.lines}
      />
      <div className="receiving-detail-footer">
        <div className="receiving-total receiving-total--inline">
          <span>Tổng tiền</span>
          <strong>{money.format(receipt.total)}</strong>
        </div>
        {isDraft && (
          <div className="inline-actions">
            <Link className="button button--ghost" to={`/warehouse/receiving/${receipt.receiptId}/edit`}>Chỉnh sửa phiếu</Link>
            <button className="button button--danger" type="button" onClick={onCancel}>Hủy phiếu</button>
            <button className="button button--primary" type="button" onClick={onConfirm} disabled={receipt.lines.length === 0}>Xác nhận nhập kho</button>
          </div>
        )}
      </div>
      {!isDraft && <Notice tone="info">Phiếu {receipt.status} được hiển thị ở chế độ chỉ đọc.</Notice>}
      {isDraft && receipt.lines.length === 0 && <Notice tone="warning">Cần ít nhất một dòng hàng hợp lệ trước khi xác nhận nhập kho.</Notice>}
    </section>
  );
}

function ReceivingManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState({ search: '', status: 'DRAFT' });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', status: 'DRAFT' });
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [detailState, setDetailState] = useState({ data: null, error: null, isLoading: false });
  const [action, setAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedReceiptId = searchParams.get('receiptId');

  const loadList = useCallback(async (signal) => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await listReceipts({ ...appliedFilters, page, pageSize: PAGE_SIZE }, { signal });
      setState({ data, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setState({ data: null, error, isLoading: false });
    }
  }, [appliedFilters, page, reloadKey]);

  const loadDetail = useCallback(async (signal) => {
    if (!selectedReceiptId) {
      setDetailState({ data: null, error: null, isLoading: false });
      return;
    }
    setDetailState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await getReceipt(selectedReceiptId, { signal });
      setDetailState({ data, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setDetailState({ data: null, error, isLoading: false });
    }
  }, [selectedReceiptId]);

  useEffect(() => {
    const controller = new AbortController();
    loadList(controller.signal);
    return () => controller.abort();
  }, [loadList]);

  useEffect(() => {
    const controller = new AbortController();
    loadDetail(controller.signal);
    return () => controller.abort();
  }, [loadDetail]);

  const refresh = () => setReloadKey((value) => value + 1);
  const selectReceipt = (receiptId) => setSearchParams({ receiptId });

  const runAction = async () => {
    const receiptId = action.receipt.receiptId;
    setIsSubmitting(true);
    setActionError(null);
    try {
      const updated = action.type === 'confirm'
        ? await confirmReceipt(receiptId)
        : await cancelReceipt(receiptId);
      setDetailState({ data: updated, error: null, isLoading: false });
      setSuccess(action.type === 'confirm'
        ? `Đã xác nhận nhập kho phiếu ${receiptId}.`
        : `Đã hủy phiếu nhập ${receiptId}.`);
      setAction(null);
      refresh();
    } catch (error) {
      setActionError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = useMemo(() => [
    { key: 'receiptId', header: 'Mã phiếu' },
    { key: 'receivedAt', header: 'Ngày nhập', render: (receipt) => formatDateTime(receipt.receivedAt) },
    { key: 'supplier', header: 'Nhà cung cấp', render: (receipt) => <span className="owner-cell"><strong>{receipt.supplier.name}</strong><small>{receipt.supplier.supplierId}</small></span> },
    { key: 'lineCount', header: 'Số dòng' },
    { key: 'total', header: 'Tổng tiền', render: (receipt) => money.format(receipt.total) },
    { key: 'status', header: 'Trạng thái', render: (receipt) => <span className={`status-badge status-badge--${receipt.status.toLowerCase()}`}>{receipt.status}</span> },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (receipt) => <button className="table-action" type="button" onClick={() => selectReceipt(receipt.receiptId)}>Xem chi tiết</button>,
    },
  ], []);

  const pagination = state.data?.pagination ?? { page, totalPages: 0 };

  return (
    <section className="workspace-page">
      <PageHeader
        title="Danh sách và xác nhận nhập kho"
        description="Kiểm tra phiếu nháp và chi tiết lô trước khi gọi transaction xác nhận nhập kho."
        actions={<Link className="button button--primary" to="/warehouse/receiving/new">Tạo phiếu nhập</Link>}
      />
      <Notice tone="success">{success}</Notice>
      <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>

      <form
        className="filter-bar receiving-filter"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setAppliedFilters(filters);
        }}
      >
        <FormField htmlFor="receiptSearch" label="Mã phiếu hoặc nhà cung cấp">
          <input id="receiptSearch" type="search" value={filters.search} placeholder="Nhập từ khóa bắt đầu" onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        </FormField>
        <FormField htmlFor="receiptStatus" label="Trạng thái">
          <select id="receiptStatus" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="DRAFT">Chờ xác nhận</option>
            <option value="CONFIRMED">Đã xác nhận</option>
            <option value="CANCELLED">Đã hủy</option>
          </select>
        </FormField>
        <button className="button button--primary" type="submit">Lọc danh sách</button>
      </form>

      <AsyncContent
        error={state.error}
        isLoading={state.isLoading}
        loadingMessage="Đang tải danh sách phiếu nhập…"
        onRetry={refresh}
        isEmpty={state.data?.items.length === 0}
        emptyTitle="Không có phiếu nhập phù hợp"
        emptyMessage="Hãy thay đổi từ khóa hoặc trạng thái cần tra cứu."
      >
        {state.data?.items.length > 0 && (
          <>
            <DataTable caption="Danh sách phiếu nhập" columns={columns} getRowKey={(receipt) => receipt.receiptId} rows={state.data.items} />
            <Pagination disabled={state.isLoading} page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
          </>
        )}
      </AsyncContent>

      {selectedReceiptId && (
        <div className="receipt-detail-region">
          <AsyncContent
            error={detailState.error}
            isLoading={detailState.isLoading}
            loadingMessage="Đang tải chi tiết phiếu nhập…"
            onRetry={() => loadDetail()}
          >
            {detailState.data && (
              <ReceiptDetail
                receipt={detailState.data}
                onCancel={() => { setActionError(null); setAction({ type: 'cancel', receipt: detailState.data }); }}
                onConfirm={() => { setActionError(null); setAction({ type: 'confirm', receipt: detailState.data }); }}
              />
            )}
          </AsyncContent>
        </div>
      )}

      {action && (
        <ConfirmDialog
          title={action.type === 'confirm' ? 'Xác nhận nhập kho?' : 'Hủy phiếu nhập?'}
          description={action.type === 'confirm'
            ? `${action.receipt.receiptId} có ${action.receipt.lineCount} dòng, tổng ${money.format(action.receipt.total)}. Tồn kho chỉ thay đổi khi backend xác nhận thành công.`
            : `${action.receipt.receiptId} sẽ chuyển sang CANCELLED và không làm thay đổi tồn kho.`}
          confirmLabel={action.type === 'confirm' ? 'Xác nhận nhập kho' : 'Hủy phiếu'}
          tone={action.type === 'confirm' ? 'primary' : 'danger'}
          error={actionError && getErrorMessage(actionError)}
          isSubmitting={isSubmitting}
          onCancel={() => !isSubmitting && setAction(null)}
          onConfirm={runAction}
        />
      )}
    </section>
  );
}

export default ReceivingManagementPage;
