import { getSchemaStatusPresentation, getWorkflowPresentation } from './stocktakePresentation';

const dateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export function formatStocktakeDate(value) {
  return value ? dateTime.format(new Date(value)) : '—';
}

export function StocktakeStatus({ stocktake }) {
  const schema = getSchemaStatusPresentation(stocktake?.schemaStatus);
  const workflow = getWorkflowPresentation(stocktake?.workflow?.state);
  return (
    <span className="stocktake-status-stack">
      <span className={`status-badge status-badge--${schema.tone}`}>{schema.label}</span>
      <span className={`status-badge status-badge--${workflow.tone}`}>{workflow.label}</span>
    </span>
  );
}

function StocktakeSummary({ stocktake }) {
  if (!stocktake) return null;
  return (
    <dl className="stocktake-summary-grid">
      <div><dt>Mã đợt</dt><dd>{stocktake.stocktakeId}</dd></div>
      <div><dt>Ngày kiểm kê</dt><dd>{formatStocktakeDate(stocktake.startedAt)}</dd></div>
      <div><dt>Người tạo</dt><dd>{stocktake.createdBy?.name || stocktake.createdBy?.employeeId || '—'}</dd></div>
      <div><dt>Tổng số lô</dt><dd>{stocktake.totalLots}</dd></div>
      <div><dt>Số dòng chênh lệch</dt><dd>{stocktake.discrepancyCount}</dd></div>
      <div><dt>Tổng chênh lệch tuyệt đối</dt><dd>{stocktake.totalAbsoluteDiscrepancy}</dd></div>
      <div className="stocktake-summary-grid__wide"><dt>Trạng thái</dt><dd><StocktakeStatus stocktake={stocktake} /></dd></div>
      <div className="stocktake-summary-grid__wide"><dt>Ghi chú</dt><dd>{stocktake.note || '—'}</dd></div>
    </dl>
  );
}

export default StocktakeSummary;
