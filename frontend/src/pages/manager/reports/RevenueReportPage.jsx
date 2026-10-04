import { useCallback, useEffect, useState } from 'react';
import { AsyncContent, DataTable, PageHeader } from '../../../components';
import { ReportDateFilter, ReportKpiGrid, RevenueTrendChart } from '../../../components/reports';
import { getRevenueReport } from '../../../services/reporting.service';
import {
  downloadRevenueCsv,
  formatInteger,
  formatMoney,
  formatReportDate,
} from './reportingPresentation';
import useReportPeriod from './useReportPeriod';

const trendColumns = [
  { key: 'date', header: 'Ngày', render: (item) => formatReportDate(item.date) },
  { key: 'completedInvoiceCount', header: 'Hóa đơn hoàn tất', render: (item) => formatInteger(item.completedInvoiceCount) },
  { key: 'grossRevenue', header: 'Doanh thu gộp', render: (item) => formatMoney(item.grossRevenue) },
  { key: 'refundAmount', header: 'Tiền hoàn trả', render: (item) => formatMoney(item.refundAmount) },
  { key: 'netRevenue', header: 'Doanh thu thuần', render: (item) => <strong>{formatMoney(item.netRevenue)}</strong> },
];

function RevenueReportPage() {
  const { applyPeriod, draftPeriod, period, periodError, setDraftPeriod } = useReportPeriod();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ data: null, error: null, isLoading: true });

  const loadReport = useCallback(async (signal) => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await getRevenueReport(period, { signal });
      setState({ data, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setState({ data: null, error, isLoading: false });
    }
  }, [period, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    loadReport(controller.signal);
    return () => controller.abort();
  }, [loadReport]);

  const summary = state.data?.summary;
  const hasData = Number(summary?.completedInvoiceCount ?? 0) > 0 || (state.data?.trend.length ?? 0) > 0;
  const kpis = summary ? [
    { label: 'Số hóa đơn hoàn tất', value: formatInteger(summary.completedInvoiceCount), note: 'Trong khoảng đã chọn' },
    { label: 'Doanh thu gộp', value: formatMoney(summary.grossRevenue) },
    { label: 'Tiền hoàn trả', value: formatMoney(summary.refundAmount), tone: 'refund' },
    { label: 'Doanh thu thuần', value: formatMoney(summary.netRevenue), tone: 'accent' },
  ] : [];

  return (
    <section className="workspace-page report-page report-print-area">
      <PageHeader
        eyebrow="MH-23 · F35"
        title="Báo cáo doanh thu"
        description="Tổng hợp hóa đơn hoàn tất và tiền hoàn hợp lệ theo khoảng thời gian đã chọn."
        actions={(
          <div className="report-export-actions no-print">
            <button className="button button--ghost" disabled={!hasData || state.isLoading} type="button" onClick={() => window.print()}>
              Xuất PDF
            </button>
            <button className="button button--ghost" disabled={!hasData || state.isLoading} type="button" onClick={() => downloadRevenueCsv(state.data)}>
              Xuất Excel
            </button>
          </div>
        )}
      />
      <div className="no-print">
        <ReportDateFilter
          draftPeriod={draftPeriod}
          error={periodError}
          isLoading={state.isLoading}
          onChange={setDraftPeriod}
          onSubmit={applyPeriod}
        />
      </div>
      <p className="report-period-print">Kỳ báo cáo: {formatReportDate(period.from)} – {formatReportDate(period.to)}</p>

      <AsyncContent
        error={state.error}
        isEmpty={!hasData}
        isLoading={state.isLoading}
        loadingMessage="Đang tổng hợp báo cáo doanh thu…"
        emptyTitle="Chưa có doanh thu trong kỳ"
        emptyMessage="Không có hóa đơn hoàn tất hoặc doanh thu hợp lệ trong khoảng thời gian đã chọn."
        onRetry={() => setReloadKey((value) => value + 1)}
      >
        {state.data && hasData && (
          <div className="report-stack">
            <ReportKpiGrid items={kpis} />
            <RevenueTrendChart data={state.data.trend} />
            <section className="report-section">
              <header><h2>Bảng số liệu theo ngày</h2><p>Dữ liệu nguồn của biểu đồ và tệp xuất.</p></header>
              <DataTable caption="Doanh thu theo ngày" columns={trendColumns} getRowKey={(item) => item.date} rows={state.data.trend} />
            </section>
          </div>
        )}
      </AsyncContent>
      <aside className="report-decision-note">
        <strong>Chỉ số chưa hiển thị</strong>
        <p>Lợi nhuận ước tính chưa có công thức nghiệp vụ được chốt; màn hình không tự suy diễn từ doanh thu hoặc giá nhập.</p>
      </aside>
    </section>
  );
}

export default RevenueReportPage;
