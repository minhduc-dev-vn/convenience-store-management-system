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
  StocktakeStatus,
  StocktakeSummary,
} from '../../components';
import { canDecideStocktake } from '../../components/stocktakePresentation';
import {
  approveStocktake,
  getManagerStocktake,
  listManagerStocktakes,
  rejectStocktake,
} from '../../services/stocktake.service';

const PAGE_SIZE = 10;

function ManagerStocktakeDetail({ data, comment, onAction, onCommentChange }) {
  const varianceLines = data.lines.filter((line) => line.discrepancy !== 0);
  const canDecide = canDecideStocktake(data.stocktake);
  const columns = [
    {
      key: 'product',
      header: 'Sản phẩm',
      render: (line) => <span className="owner-cell"><strong>{line.product.name}</strong><small>{line.product.productId} · {line.product.unit}</small></span>,
    },
    { key: 'lot', header: 'Lô', render: (line) => <span className="owner-cell"><strong>{line.lot.manufacturerLot}</strong><small>{line.lot.lotId}</small></span> },
    { key: 'systemQuantity', header: 'Tồn snapshot' },
    { key: 'currentQuantity', header: 'Tồn hiện tại' },
    { key: 'actualQuantity', header: 'Số thực tế' },
    {
      key: 'discrepancy',
      header: 'Chênh lệch',
      render: (line) => <strong className="variance">{line.discrepancy > 0 ? `+${line.discrepancy}` : line.discrepancy}</strong>,
    },
    { key: 'reason', header: 'Lý do', render: (line) => line.reason || '—' },
  ];

  return (
    <section className="stocktake-detail-card">
      <div className="stocktake-detail-heading">
        <div><p className="eyebrow">Đề nghị điều chỉnh</p><h2>{data.stocktake.stocktakeId}</h2></div>
        <StocktakeStatus stocktake={data.stocktake} />
      </div>
      <StocktakeSummary stocktake={data.stocktake} />
      {data.stocktake.workflow?.managerComment && (
        <Notice tone={data.stocktake.workflow.state === 'RECOUNT_REQUIRED' ? 'warning' : 'info'}>
          Ý kiến quản lý gần nhất: {data.stocktake.workflow.managerComment}
        </Notice>
      )}
      {data.lines.some((line) => line.snapshotChanged) && (
        <Notice tone="warning">Tồn hiện tại đã thay đổi sau snapshot. Backend sẽ từ chối phê duyệt nếu snapshot không còn hợp lệ.</Notice>
      )}
      <DataTable
        caption={`Các dòng chênh lệch của ${data.stocktake.stocktakeId}`}
        columns={columns}
        emptyMessage="Đợt kiểm kê không có chênh lệch."
        getRowClassName={() => 'stocktake-row--variance'}
        getRowKey={(line) => line.lot.lotId}
        rows={varianceLines}
      />
      <div className="stocktake-decision-panel">
        <FormField
          htmlFor="managerStocktakeComment"
          label="Ý kiến quản lý"
          hint="Bắt buộc khi yêu cầu kiểm lại; không quá 255 ký tự."
        >
          <textarea
            id="managerStocktakeComment"
            maxLength="255"
            placeholder="Nhập kết luận hoặc nội dung cần kiểm lại"
            value={comment}
            disabled={!canDecide}
            onChange={(event) => onCommentChange(event.target.value)}
          />
        </FormField>
        {canDecide ? (
          <div className="inline-actions">
            <button className="button button--danger" type="button" disabled={!comment.trim()} onClick={() => onAction('reject')}>Yêu cầu kiểm lại</button>
            <button className="button button--primary" type="button" onClick={() => onAction('approve')}>Phê duyệt điều chỉnh</button>
          </div>
        ) : (
          <Notice tone="info">Đợt này không còn ở trạng thái chờ phê duyệt nên các thao tác quyết định đã bị khóa.</Notice>
        )}
      </div>
    </section>
  );
}

function StocktakeApprovalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState({ search: '', workflowState: 'PENDING_APPROVAL' });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', workflowState: 'PENDING_APPROVAL' });
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [detailState, setDetailState] = useState({ data: null, error: null, isLoading: false });
  const [comment, setComment] = useState('');
  const [action, setAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedId = searchParams.get('stocktakeId');

  const loadList = useCallback(async (signal) => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await listManagerStocktakes({ ...appliedFilters, page, pageSize: PAGE_SIZE }, { signal });
      setState({ data, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setState({ data: null, error, isLoading: false });
    }
  }, [appliedFilters, page, reloadKey]);

  const loadDetail = useCallback(async (signal) => {
    if (!selectedId) {
      setDetailState({ data: null, error: null, isLoading: false });
      return;
    }
    setDetailState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await getManagerStocktake(selectedId, signal ? { signal } : {});
      setDetailState({ data, error: null, isLoading: false });
      setComment(data.stocktake.workflow?.managerComment ?? '');
    } catch (error) {
      if (error.name !== 'AbortError') setDetailState({ data: null, error, isLoading: false });
    }
  }, [selectedId]);

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

  const runDecision = async () => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      if (action === 'approve') {
        await approveStocktake(selectedId, { comment: comment.trim() || null });
        setSuccess(`Đã phê duyệt điều chỉnh cho đợt ${selectedId}.`);
      } else {
        await rejectStocktake(selectedId, { comment: comment.trim() });
        setSuccess(`Đã yêu cầu kiểm lại đợt ${selectedId}.`);
      }
      setAction(null);
      refresh();
      await loadDetail();
    } catch (error) {
      setActionError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = useMemo(() => [
    { key: 'stocktakeId', header: 'Mã đợt' },
    { key: 'createdBy', header: 'Nhân viên kho', render: (item) => <span className="owner-cell"><strong>{item.createdBy?.name || '—'}</strong><small>{item.createdBy?.employeeId}</small></span> },
    { key: 'startedAt', header: 'Ngày kiểm kê', render: (item) => new Date(item.startedAt).toLocaleString('vi-VN') },
    { key: 'discrepancyCount', header: 'Dòng lệch' },
    { key: 'totalAbsoluteDiscrepancy', header: 'Tổng lệch tuyệt đối' },
    { key: 'status', header: 'Trạng thái', render: (item) => <StocktakeStatus stocktake={item} /> },
    { key: 'action', header: 'Thao tác', render: (item) => <button className="table-action" type="button" onClick={() => setSearchParams({ stocktakeId: item.stocktakeId })}>Xem đề nghị</button> },
  ], [setSearchParams]);

  const pagination = state.data?.pagination ?? { page, totalPages: 0 };

  return (
    <section className="workspace-page">
      <PageHeader
        eyebrow="MH-15 · F33"
        title="Phê duyệt điều chỉnh kho"
        description="Xem snapshot, số thực tế và lý do chênh lệch trước khi phê duyệt transaction điều chỉnh tồn."
      />
      <Notice tone="success">{success}</Notice>
      <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>

      <form className="filter-bar stocktake-filter" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedFilters(filters); }}>
        <FormField htmlFor="managerStocktakeSearch" label="Mã đợt hoặc nhân viên">
          <input id="managerStocktakeSearch" type="search" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        </FormField>
        <FormField htmlFor="managerStocktakeWorkflow" label="Quy trình">
          <select id="managerStocktakeWorkflow" value={filters.workflowState} onChange={(event) => setFilters((current) => ({ ...current, workflowState: event.target.value }))}>
            <option value="">Tất cả</option>
            <option value="PENDING_APPROVAL">Chờ phê duyệt</option>
            <option value="RECOUNT_REQUIRED">Cần kiểm lại</option>
            <option value="APPROVED">Đã phê duyệt</option>
            <option value="DRAFT">Đang kiểm kê</option>
            <option value="CANCELLED">Đã hủy</option>
          </select>
        </FormField>
        <button className="button button--primary" type="submit">Lọc danh sách</button>
      </form>

      <AsyncContent error={state.error} isLoading={state.isLoading} loadingMessage="Đang tải đề nghị kiểm kê…" onRetry={refresh} isEmpty={state.data?.items.length === 0} emptyTitle="Không có đề nghị phù hợp" emptyMessage="Không có đợt nào trong trạng thái đã chọn.">
        {state.data?.items.length > 0 && <><DataTable caption="Danh sách kiểm kê và đề nghị điều chỉnh" columns={columns} getRowKey={(item) => item.stocktakeId} rows={state.data.items} /><Pagination disabled={state.isLoading} page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} /></>}
      </AsyncContent>

      {selectedId && (
        <div className="stocktake-detail-region">
          <AsyncContent error={detailState.error} isLoading={detailState.isLoading} loadingMessage="Đang tải chi tiết đề nghị…" onRetry={() => loadDetail()}>
            {detailState.data && <ManagerStocktakeDetail data={detailState.data} comment={comment} onCommentChange={setComment} onAction={(type) => { setActionError(null); setAction(type); }} />}
          </AsyncContent>
        </div>
      )}

      {action && (
        <ConfirmDialog
          title={action === 'approve' ? 'Phê duyệt điều chỉnh kho?' : 'Yêu cầu kiểm lại?'}
          description={action === 'approve'
            ? `Backend sẽ cập nhật tồn theo chênh lệch của ${selectedId}, ghi giao dịch ADJUSTMENT và khóa đợt kiểm kê.`
            : `Đợt ${selectedId} sẽ quay về trạng thái cần kiểm lại với ý kiến: “${comment.trim()}”.`}
          confirmLabel={action === 'approve' ? 'Phê duyệt' : 'Gửi yêu cầu kiểm lại'}
          tone={action === 'approve' ? 'primary' : 'danger'}
          error={actionError && getErrorMessage(actionError)}
          isSubmitting={isSubmitting}
          onCancel={() => !isSubmitting && setAction(null)}
          onConfirm={runDecision}
        />
      )}
    </section>
  );
}

export default StocktakeApprovalPage;
