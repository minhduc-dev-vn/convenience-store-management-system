import { useCallback, useEffect, useRef, useState } from 'react';
import { getApplicationHealth } from '../services/health.service';
import AsyncContent from './AsyncContent';
import DataTable from './DataTable';

const healthColumns = [
  { key: 'service', header: 'Thành phần' },
  {
    key: 'status',
    header: 'Trạng thái',
    render: (row) => <span className={`health-badge health-badge--${row.status}`}>{row.status}</span>,
  },
  { key: 'checkedAt', header: 'Thời điểm kiểm tra' },
];

function formatCheckedAt(value) {
  if (!value) return 'Vừa xong';

  const checkedAt = new Date(value);
  if (Number.isNaN(checkedAt.getTime())) return 'Không xác định';

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(checkedAt);
}

function HealthCheckPanel() {
  const abortControllerRef = useRef(null);
  const [state, setState] = useState({ data: null, error: null, isLoading: true });

  const loadHealth = useCallback(async () => {
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setState((current) => ({ ...current, error: null, isLoading: true }));

    try {
      const data = await getApplicationHealth({ signal: abortController.signal });
      setState({ data, error: null, isLoading: false });
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setState({ data: null, error, isLoading: false });
      }
    }
  }, []);

  useEffect(() => {
    loadHealth();
    return () => abortControllerRef.current?.abort();
  }, [loadHealth]);

  const rows = state.data ? [
    {
      id: 'process',
      service: 'Backend API',
      status: state.data.process.status,
      checkedAt: formatCheckedAt(state.data.process.timestamp),
    },
    {
      id: 'database',
      service: 'SQL Server',
      status: state.data.database.status,
      checkedAt: formatCheckedAt(state.data.database.checkedAt),
    },
  ] : [];

  return (
    <section className="health-section" aria-labelledby="health-heading">
      <div className="section-heading health-section__heading">
        <div>
          <p className="eyebrow">Kiểm tra tích hợp</p>
          <h2 id="health-heading">Trạng thái hệ thống</h2>
        </div>
        <button className="button button--secondary" type="button" onClick={loadHealth}>
          Kiểm tra lại
        </button>
      </div>

      <AsyncContent
        error={state.error}
        isEmpty={!state.isLoading && !state.error && rows.length === 0}
        isLoading={state.isLoading}
        loadingMessage="Đang kiểm tra kết nối hệ thống…"
        onRetry={loadHealth}
      >
        <DataTable
          caption="Kết quả kiểm tra backend và cơ sở dữ liệu"
          columns={healthColumns}
          getRowKey={(row) => row.id}
          rows={rows}
        />
      </AsyncContent>
    </section>
  );
}

export default HealthCheckPanel;
