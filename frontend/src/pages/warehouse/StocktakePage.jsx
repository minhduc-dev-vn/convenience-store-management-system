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
import {
  buildCountPayload,
  canProposeStocktake,
  isStocktakeEditable,
  validateCountForm,
} from '../../components/stocktakePresentation';
import {
  createStocktake,
  getWarehouseStocktake,
  listWarehouseStocktakes,
  proposeStocktake,
  recordStocktakeCount,
} from '../../services/stocktake.service';

const PAGE_SIZE = 10;

function createLineDrafts(lines = []) {
  return Object.fromEntries(lines.map((line) => [line.lot.lotId, {
    actualQuantity: String(line.actualQuantity),
    reason: line.reason ?? '',
  }]));
}

function hasUnsavedLine(draft, line) {
  return String(line.actualQuantity) !== String(draft?.actualQuantity ?? '')
    || (line.reason ?? '') !== (draft?.reason ?? '');
}

function WarehouseStocktakeDetail({ data, onChanged, onPropose }) {
  const [drafts, setDrafts] = useState(() => createLineDrafts(data.lines));
  const [errors, setErrors] = useState({});
  const [savingLotId, setSavingLotId] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const editable = isStocktakeEditable(data.stocktake);

  useEffect(() => {
    setDrafts(createLineDrafts(data.lines));
    setErrors({});
    setSaveError(null);
  }, [data]);

  const hasUnsavedChanges = data.lines.some((line) => hasUnsavedLine(drafts[line.lot.lotId], line));
  const hasMissingReason = data.lines.some((line) => line.discrepancy !== 0 && !line.reason?.trim());

  const updateDraft = (lotId, field, value) => {
    setDrafts((current) => ({
      ...current,
      [lotId]: { ...current[lotId], [field]: value },
    }));
    setErrors((current) => ({ ...current, [lotId]: null }));
  };

  const saveLine = async (line) => {
    const lotId = line.lot.lotId;
    const draft = drafts[lotId];
    const validation = validateCountForm(draft);
    if (Object.keys(validation).length > 0) {
      setErrors((current) => ({ ...current, [lotId]: validation }));
      return;
    }
    setSavingLotId(lotId);
    setSaveError(null);
    try {
      await recordStocktakeCount(data.stocktake.stocktakeId, lotId, buildCountPayload(draft));
      await onChanged(`Đã lưu số đếm cho lô ${line.lot.manufacturerLot}.`);
    } catch (error) {
      setSaveError(error);
    } finally {
      setSavingLotId(null);
    }
  };

  const columns = [
    {
      key: 'product',
      header: 'Sản phẩm',
      render: (line) => <span className="owner-cell"><strong>{line.product.name}</strong><small>{line.product.productId} · {line.product.unit}</small></span>,
    },
    { key: 'lot', header: 'Lô', render: (line) => <span className="owner-cell"><strong>{line.lot.manufacturerLot}</strong><small>{line.lot.lotId}</small></span> },
    { key: 'systemQuantity', header: 'Tồn snapshot' },
    { key: 'currentQuantity', header: 'Tồn hiện tại' },
    {
      key: 'actualQuantity',
      header: 'Số thực tế',
      render: (line) => editable ? (
        <span className="stocktake-line-field">
          <input
            aria-label={`Số lượng thực tế lô ${line.lot.manufacturerLot}`}
            min="0"
            step="1"
            type="number"
            value={drafts[line.lot.lotId]?.actualQuantity ?? ''}
            onChange={(event) => updateDraft(line.lot.lotId, 'actualQuantity', event.target.value)}
          />
          {errors[line.lot.lotId]?.actualQuantity && <small role="alert">{errors[line.lot.lotId].actualQuantity}</small>}
        </span>
      ) : line.actualQuantity,
    },
    {
      key: 'discrepancy',
      header: 'Chênh lệch',
      render: (line) => <strong className={line.discrepancy === 0 ? 'variance variance--zero' : 'variance'}>{line.discrepancy > 0 ? `+${line.discrepancy}` : line.discrepancy}</strong>,
    },
    {
      key: 'reason',
      header: 'Lý do',
      render: (line) => editable ? (
        <span className="stocktake-line-field stocktake-line-field--reason">
          <input
            aria-label={`Lý do chênh lệch lô ${line.lot.manufacturerLot}`}
            maxLength="255"
            placeholder="Bắt buộc khi có chênh lệch"
            value={drafts[line.lot.lotId]?.reason ?? ''}
            onChange={(event) => updateDraft(line.lot.lotId, 'reason', event.target.value)}
          />
          {errors[line.lot.lotId]?.reason && <small role="alert">{errors[line.lot.lotId].reason}</small>}
        </span>
      ) : (line.reason || '—'),
    },
    {
      key: 'action',
      header: 'Thao tác',
      render: (line) => editable ? (
        <button
          className="table-action"
          type="button"
          disabled={savingLotId === line.lot.lotId || !hasUnsavedLine(drafts[line.lot.lotId], line)}
          onClick={() => saveLine(line)}
        >
          {savingLotId === line.lot.lotId ? 'Đang lưu…' : 'Lưu dòng'}
        </button>
      ) : <span className="muted-text">Chỉ đọc</span>,
    },
  ];

  return (
    <section className="stocktake-detail-card">
      <div className="stocktake-detail-heading">
        <div><p className="eyebrow">Snapshot kiểm kê</p><h2>{data.stocktake.stocktakeId}</h2></div>
        <StocktakeStatus stocktake={data.stocktake} />
      </div>
      <StocktakeSummary stocktake={data.stocktake} />
      {data.stocktake.workflow?.managerComment && (
        <Notice tone="warning">Ý kiến quản lý: {data.stocktake.workflow.managerComment}</Notice>
      )}
      {data.lines.some((line) => line.snapshotChanged) && (
        <Notice tone="warning">Tồn hiện tại đã thay đổi sau snapshot. Backend sẽ kiểm tra lại trước khi phê duyệt.</Notice>
      )}
      <Notice tone="error">{saveError && getErrorMessage(saveError)}</Notice>
      <DataTable
        caption={`Chi tiết kiểm kê ${data.stocktake.stocktakeId}`}
        columns={columns}
        emptyMessage="Đợt kiểm kê không có dòng snapshot."
        getRowClassName={(line) => line.discrepancy !== 0 ? 'stocktake-row--variance' : undefined}
        getRowKey={(line) => line.lot.lotId}
        rows={data.lines}
      />
      <div className="stocktake-detail-footer">
        <div>
          {!editable && <Notice tone="info">Đợt kiểm kê đang ở chế độ chỉ đọc theo trạng thái server.</Notice>}
          {editable && hasUnsavedChanges && <Notice tone="warning">Hãy lưu từng dòng đã thay đổi trước khi gửi đề nghị.</Notice>}
          {editable && hasMissingReason && <Notice tone="warning">Mỗi dòng có chênh lệch phải có lý do đã lưu.</Notice>}
        </div>
        {editable && (
          <button
            className="button button--primary"
            type="button"
            disabled={!canProposeStocktake(data.stocktake) || hasUnsavedChanges || hasMissingReason}
            onClick={onPropose}
          >
            Gửi đề nghị điều chỉnh
          </button>
        )}
      </div>
    </section>
  );
}

function StocktakePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState({ search: '', workflowState: '' });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', workflowState: '' });
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [detailState, setDetailState] = useState({ data: null, error: null, isLoading: false });
  const [note, setNote] = useState('');
  const [proposalComment, setProposalComment] = useState('');
  const [success, setSuccess] = useState('');
  const [actionError, setActionError] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isProposing, setIsProposing] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const selectedId = searchParams.get('stocktakeId');

  const loadList = useCallback(async (signal) => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await listWarehouseStocktakes({ ...appliedFilters, page, pageSize: PAGE_SIZE }, { signal });
      setState({ data, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setState({ data: null, error, isLoading: false });
    }
  }, [appliedFilters, page, reloadKey]);

  const loadDetail = useCallback(async (signal) => {
    if (!selectedId) {
      setDetailState({ data: null, error: null, isLoading: false });
      return null;
    }
    setDetailState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await getWarehouseStocktake(selectedId, signal ? { signal } : {});
      setDetailState({ data, error: null, isLoading: false });
      return data;
    } catch (error) {
      if (error.name !== 'AbortError') setDetailState({ data: null, error, isLoading: false });
      return null;
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
  const refreshDetailAndList = async (message) => {
    await loadDetail();
    refresh();
    setSuccess(message);
  };

  const handleCreate = async () => {
    setIsCreating(true);
    setActionError(null);
    setSuccess('');
    try {
      const created = await createStocktake({ note: note.trim() || null });
      setNote('');
      setDetailState({ data: created, error: null, isLoading: false });
      setSearchParams({ stocktakeId: created.stocktake.stocktakeId });
      setSuccess(`Đã tạo snapshot kiểm kê ${created.stocktake.stocktakeId}.`);
      refresh();
    } catch (error) {
      setActionError(error);
    } finally {
      setIsCreating(false);
    }
  };

  const handlePropose = async () => {
    setIsProposing(true);
    setActionError(null);
    try {
      await proposeStocktake(selectedId, { comment: proposalComment.trim() || null });
      setProposalComment('');
      setProposalOpen(false);
      await refreshDetailAndList(`Đã gửi đợt ${selectedId} cho quản lý phê duyệt.`);
    } catch (error) {
      setActionError(error);
    } finally {
      setIsProposing(false);
    }
  };

  const columns = useMemo(() => [
    { key: 'stocktakeId', header: 'Mã đợt' },
    { key: 'startedAt', header: 'Ngày kiểm kê', render: (item) => new Date(item.startedAt).toLocaleString('vi-VN') },
    { key: 'totalLots', header: 'Số lô' },
    { key: 'discrepancyCount', header: 'Dòng lệch' },
    { key: 'status', header: 'Trạng thái', render: (item) => <StocktakeStatus stocktake={item} /> },
    { key: 'action', header: 'Thao tác', render: (item) => <button className="table-action" type="button" onClick={() => setSearchParams({ stocktakeId: item.stocktakeId })}>Mở đợt</button> },
  ], [setSearchParams]);

  const pagination = state.data?.pagination ?? { page, totalPages: 0 };

  return (
    <section className="workspace-page">
      <PageHeader
        eyebrow="MH-14 · F25/F26/F27"
        title="Kiểm kê kho"
        description="Tạo snapshot tồn theo lô, ghi nhận số lượng thực tế và gửi chênh lệch cho quản lý phê duyệt."
      />
      <Notice tone="success">{success}</Notice>
      <Notice tone="error">{actionError && getErrorMessage(actionError)}</Notice>

      <section className="stocktake-create-card">
        <div><p className="eyebrow">Tạo đợt mới</p><h2>Chụp snapshot tồn hiện tại</h2><p>Hệ thống tự lấy toàn bộ lô tồn kho; không chỉnh sửa trực tiếp dữ liệu lô tại đây.</p></div>
        <FormField htmlFor="stocktakeNote" label="Ghi chú đợt kiểm kê">
          <input id="stocktakeNote" maxLength="255" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ví dụ: Kiểm kê cuối tháng" />
        </FormField>
        <button className="button button--primary" type="button" disabled={isCreating} onClick={handleCreate}>{isCreating ? 'Đang tạo…' : 'Tạo đợt kiểm kê'}</button>
      </section>

      <form className="filter-bar stocktake-filter" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedFilters(filters); }}>
        <FormField htmlFor="stocktakeSearch" label="Mã đợt hoặc người tạo">
          <input id="stocktakeSearch" type="search" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        </FormField>
        <FormField htmlFor="stocktakeWorkflow" label="Quy trình">
          <select id="stocktakeWorkflow" value={filters.workflowState} onChange={(event) => setFilters((current) => ({ ...current, workflowState: event.target.value }))}>
            <option value="">Tất cả</option>
            <option value="DRAFT">Đang kiểm kê</option>
            <option value="PENDING_APPROVAL">Chờ phê duyệt</option>
            <option value="RECOUNT_REQUIRED">Cần kiểm lại</option>
            <option value="APPROVED">Đã phê duyệt</option>
            <option value="CANCELLED">Đã hủy</option>
          </select>
        </FormField>
        <button className="button button--primary" type="submit">Lọc danh sách</button>
      </form>

      <AsyncContent error={state.error} isLoading={state.isLoading} loadingMessage="Đang tải các đợt kiểm kê…" onRetry={refresh} isEmpty={state.data?.items.length === 0} emptyTitle="Chưa có đợt kiểm kê" emptyMessage="Tạo snapshot mới hoặc thay đổi bộ lọc.">
        {state.data?.items.length > 0 && <><DataTable caption="Danh sách đợt kiểm kê" columns={columns} getRowKey={(item) => item.stocktakeId} rows={state.data.items} /><Pagination disabled={state.isLoading} page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} /></>}
      </AsyncContent>

      {selectedId && (
        <div className="stocktake-detail-region">
          <AsyncContent error={detailState.error} isLoading={detailState.isLoading} loadingMessage="Đang tải snapshot kiểm kê…" onRetry={() => loadDetail()}>
            {detailState.data && <WarehouseStocktakeDetail data={detailState.data} onChanged={refreshDetailAndList} onPropose={() => { setActionError(null); setProposalOpen(true); }} />}
          </AsyncContent>
        </div>
      )}

      {proposalOpen && (
        <ConfirmDialog
          title="Gửi đề nghị điều chỉnh?"
          description={`Đợt ${selectedId} sẽ chuyển sang trạng thái chờ phê duyệt và tạm khóa chỉnh sửa. Chênh lệch được lấy từ dữ liệu server.`}
          confirmLabel="Gửi cho quản lý"
          tone="primary"
          error={actionError && getErrorMessage(actionError)}
          isSubmitting={isProposing}
          onCancel={() => !isProposing && setProposalOpen(false)}
          onConfirm={handlePropose}
        />
      )}
    </section>
  );
}

export default StocktakePage;
