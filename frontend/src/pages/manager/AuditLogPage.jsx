import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AsyncContent,
  AuditDataView,
  DataTable,
  FormField,
  Modal,
  Notice,
  PageHeader,
  Pagination,
} from '../../components';
import { getAuditLog, listAuditLogs } from '../../services/audit.service';
import { AUDIT_ACTION_SUGGESTIONS, validateAuditDateRange } from './auditPresentation';

const PAGE_SIZE = 20;
const EMPTY_FILTERS = {
  action: '',
  from: '',
  recordId: '',
  table: '',
  to: '',
  username: '',
};

function formatDateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('vi-VN');
}

function AuditLogDetail({ auditLog }) {
  const actorName = auditLog.actor?.displayName || auditLog.actor?.username || 'Hệ thống';
  const target = auditLog.target?.table
    ? `${auditLog.target.table}${auditLog.target.recordId ? ` #${auditLog.target.recordId}` : ''}`
    : '—';

  return (
    <div className="audit-detail">
      <dl className="audit-detail__meta">
        <div><dt>Người thực hiện</dt><dd>{actorName}</dd></div>
        <div><dt>Tài khoản</dt><dd>{auditLog.actor?.username || '—'}</dd></div>
        <div><dt>Vai trò</dt><dd>{auditLog.actor?.role || '—'}</dd></div>
        <div><dt>Hành động</dt><dd>{auditLog.action || '—'}</dd></div>
        <div><dt>Đối tượng</dt><dd>{target}</dd></div>
        <div><dt>Thời gian</dt><dd>{formatDateTime(auditLog.occurredAt)}</dd></div>
        <div><dt>Địa chỉ IP</dt><dd>{auditLog.ipAddress || '—'}</dd></div>
        <div><dt>Mã nhật ký</dt><dd>#{auditLog.auditLogId}</dd></div>
      </dl>
      <div className="audit-change-grid">
        <AuditDataView label="Dữ liệu cũ" value={auditLog.changes?.before} />
        <AuditDataView label="Dữ liệu mới" value={auditLog.changes?.after} />
      </div>
      <p className="audit-security-note">Các trường xác thực nhạy cảm được ẩn phòng thủ trước khi hiển thị.</p>
    </div>
  );
}

function AuditLogPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [filterError, setFilterError] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [selectedAuditLogId, setSelectedAuditLogId] = useState(null);
  const [detailState, setDetailState] = useState({ data: null, error: null, isLoading: false });

  const loadList = useCallback(async (signal) => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await listAuditLogs(
        { ...appliedFilters, page, pageSize: PAGE_SIZE },
        { signal },
      );
      setState({ data, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setState({ data: null, error, isLoading: false });
    }
  }, [appliedFilters, page, reloadKey]);

  const loadDetail = useCallback(async (auditLogId, signal) => {
    setDetailState({ data: null, error: null, isLoading: true });
    try {
      const data = await getAuditLog(auditLogId, signal ? { signal } : {});
      setDetailState({ data, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setDetailState({ data: null, error, isLoading: false });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadList(controller.signal);
    return () => controller.abort();
  }, [loadList]);

  useEffect(() => {
    if (!selectedAuditLogId) return undefined;
    const controller = new AbortController();
    loadDetail(selectedAuditLogId, controller.signal);
    return () => controller.abort();
  }, [loadDetail, selectedAuditLogId]);

  const columns = useMemo(() => [
    { key: 'auditLogId', header: 'Mã Log', render: (item) => `#${item.auditLogId}` },
    {
      key: 'actor',
      header: 'Tài khoản',
      render: (item) => (
        <span className="owner-cell">
          <strong>{item.actor?.displayName || item.actor?.username || 'Hệ thống'}</strong>
          <small>{item.actor?.username || 'Không gắn tài khoản'}</small>
        </span>
      ),
    },
    { key: 'action', header: 'Hành động', render: (item) => <span className="audit-action">{item.action || '—'}</span> },
    {
      key: 'target',
      header: 'Bảng / bản ghi',
      render: (item) => (
        <span className="owner-cell">
          <strong>{item.target?.table || '—'}</strong>
          <small>{item.target?.recordId ? `Bản ghi ${item.target.recordId}` : 'Không có mã bản ghi'}</small>
        </span>
      ),
    },
    { key: 'occurredAt', header: 'Thời gian', render: (item) => formatDateTime(item.occurredAt) },
    { key: 'ipAddress', header: 'Địa chỉ IP', render: (item) => item.ipAddress || '—' },
    {
      key: 'view',
      header: 'Thao tác',
      render: (item) => (
        <button className="table-action" type="button" onClick={() => setSelectedAuditLogId(item.auditLogId)}>
          Xem thay đổi
        </button>
      ),
    },
  ], []);

  const submitFilters = (event) => {
    event.preventDefault();
    const error = validateAuditDateRange(filters);
    setFilterError(error);
    if (error) return;
    setPage(1);
    setAppliedFilters(Object.fromEntries(
      Object.entries(filters).map(([key, value]) => [key, value.trim()]),
    ));
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setFilterError('');
    setPage(1);
  };

  const pagination = state.data?.pagination ?? { page, totalPages: 0 };

  return (
    <section className="workspace-page">
      <PageHeader
        title="Nhật ký hoạt động hệ thống"
        description="Tra cứu các thao tác nhạy cảm theo người thực hiện, hành động, đối tượng và thời gian. Dữ liệu chỉ đọc và do backend phân quyền MANAGER."
      />

      <form className="filter-bar audit-filter" onSubmit={submitFilters}>
        <FormField htmlFor="auditFrom" label="Nhật ký từ ngày">
          <input id="auditFrom" type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
        </FormField>
        <FormField htmlFor="auditTo" label="Nhật ký đến ngày">
          <input id="auditTo" type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
        </FormField>
        <FormField htmlFor="auditUsername" label="Tài khoản thực hiện" hint="Khớp chính xác username.">
          <input id="auditUsername" maxLength="50" value={filters.username} onChange={(event) => setFilters((current) => ({ ...current, username: event.target.value }))} />
        </FormField>
        <FormField htmlFor="auditAction" label="Loại hành động" hint="Có thể nhập mã hành động khác.">
          <input id="auditAction" list="auditActionSuggestions" maxLength="50" value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))} />
          <datalist id="auditActionSuggestions">
            {AUDIT_ACTION_SUGGESTIONS.map((action) => <option key={action} value={action} />)}
          </datalist>
        </FormField>
        <FormField htmlFor="auditTable" label="Bảng tác động">
          <input id="auditTable" maxLength="128" placeholder="Ví dụ: TAI_KHOAN" value={filters.table} onChange={(event) => setFilters((current) => ({ ...current, table: event.target.value }))} />
        </FormField>
        <FormField htmlFor="auditRecordId" label="Mã bản ghi">
          <input id="auditRecordId" maxLength="100" value={filters.recordId} onChange={(event) => setFilters((current) => ({ ...current, recordId: event.target.value }))} />
        </FormField>
        <div className="audit-filter__actions">
          <button className="button button--ghost" type="button" onClick={resetFilters}>Xóa bộ lọc</button>
          <button className="button button--primary" type="submit">Tra cứu</button>
        </div>
      </form>
      <Notice tone="error">{filterError}</Notice>

      <AsyncContent
        error={state.error}
        isLoading={state.isLoading}
        loadingMessage="Đang tải nhật ký hệ thống…"
        onRetry={() => setReloadKey((value) => value + 1)}
        isEmpty={state.data?.items.length === 0}
        emptyTitle="Không có nhật ký phù hợp"
        emptyMessage="Hãy thay đổi khoảng thời gian hoặc bộ lọc tra cứu."
      >
        {state.data?.items.length > 0 && (
          <>
            <DataTable
              caption="Nhật ký hoạt động hệ thống"
              columns={columns}
              getRowKey={(item) => item.auditLogId}
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

      {selectedAuditLogId && (
        <Modal
          title={`Chi tiết nhật ký #${selectedAuditLogId}`}
          description="Dữ liệu trước và sau thao tác từ bản ghi audit chỉ đọc."
          onClose={() => setSelectedAuditLogId(null)}
          size="large"
        >
          <AsyncContent
            error={detailState.error}
            isLoading={detailState.isLoading}
            loadingMessage="Đang tải chi tiết nhật ký…"
            onRetry={() => loadDetail(selectedAuditLogId)}
          >
            {detailState.data && <AuditLogDetail auditLog={detailState.data} />}
          </AsyncContent>
        </Modal>
      )}
    </section>
  );
}

export default AuditLogPage;
