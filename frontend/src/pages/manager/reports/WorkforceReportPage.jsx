import { useCallback, useEffect, useState } from 'react';
import { AsyncContent, DataTable, PageHeader, Pagination } from '../../../components';
import { HorizontalBarChart, ReportDateFilter } from '../../../components/reports';
import { getEmployeeReport, getShiftReport } from '../../../services/reporting.service';
import {
  formatInteger,
  formatMoney,
  formatReportDateTime,
} from './reportingPresentation';
import useReportPeriod from './useReportPeriod';

const PAGE_SIZE = 10;

const employeeColumns = [
  { key: 'employeeId', header: 'Mã NV' },
  { key: 'name', header: 'Thu ngân' },
  { key: 'openedShiftCount', header: 'Số ca đã mở', render: (item) => formatInteger(item.openedShiftCount) },
  { key: 'completedInvoiceCount', header: 'Hóa đơn đã bán', render: (item) => formatInteger(item.completedInvoiceCount) },
  { key: 'grossRevenue', header: 'Doanh thu gộp', render: (item) => formatMoney(item.grossRevenue) },
  { key: 'refundAmount', header: 'Tiền hoàn', render: (item) => formatMoney(item.refundAmount) },
  { key: 'netRevenue', header: 'Tổng tiền thu được', render: (item) => <strong>{formatMoney(item.netRevenue)}</strong> },
];

const shiftColumns = [
  { key: 'shiftId', header: 'Mã ca', render: (item) => `#${item.shiftId}` },
  { key: 'employee', header: 'Thu ngân', render: (item) => item.employee?.name || item.employee?.employeeId || '—' },
  { key: 'openedAt', header: 'Giờ mở', render: (item) => formatReportDateTime(item.openedAt) },
  { key: 'closedAt', header: 'Giờ đóng', render: (item) => formatReportDateTime(item.closedAt) },
  { key: 'openingCash', header: 'Tiền đầu ca', render: (item) => formatMoney(item.openingCash) },
  { key: 'closingCash', header: 'Tiền cuối ca', render: (item) => item.closingCash == null ? '—' : formatMoney(item.closingCash) },
  { key: 'netRevenue', header: 'Doanh thu thuần', render: (item) => formatMoney(item.netRevenue) },
  { key: 'cashDifference', header: 'Chênh lệch', render: (item) => item.cashDifference == null ? '—' : <strong>{formatMoney(item.cashDifference)}</strong> },
];

function WorkforceReportPage() {
  const { applyPeriod, draftPeriod, period, periodError, setDraftPeriod } = useReportPeriod();
  const [employeePage, setEmployeePage] = useState(1);
  const [shiftPage, setShiftPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ data: null, error: null, isLoading: true });

  const loadReport = useCallback(async (signal) => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const [employees, shifts] = await Promise.all([
        getEmployeeReport({ ...period, page: employeePage, pageSize: PAGE_SIZE }, { signal }),
        getShiftReport({ ...period, page: shiftPage, pageSize: PAGE_SIZE }, { signal }),
      ]);
      setState({ data: { employees, shifts }, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setState({ data: null, error, isLoading: false });
    }
  }, [employeePage, period, reloadKey, shiftPage]);

  useEffect(() => {
    const controller = new AbortController();
    loadReport(controller.signal);
    return () => controller.abort();
  }, [loadReport]);

  const submitPeriod = (event) => {
    if (applyPeriod(event)) {
      setEmployeePage(1);
      setShiftPage(1);
    }
  };
  const data = state.data;
  const isEmpty = data ? data.employees.items.length === 0 && data.shifts.items.length === 0 : false;

  return (
    <section className="workspace-page report-page">
      <PageHeader
        title="Doanh thu theo nhân viên và ca"
        description="Đánh giá hiệu suất thu ngân, doanh thu hợp lệ và chênh lệch tiền mặt của từng ca."
      />
      <ReportDateFilter
        draftPeriod={draftPeriod}
        error={periodError}
        isLoading={state.isLoading}
        onChange={setDraftPeriod}
        onSubmit={submitPeriod}
      />

      <AsyncContent
        error={state.error}
        isEmpty={isEmpty}
        isLoading={state.isLoading}
        loadingMessage="Đang tổng hợp báo cáo nhân viên và ca…"
        emptyTitle="Chưa có dữ liệu nhân viên hoặc ca"
        emptyMessage="Không có ca làm việc và hóa đơn hoàn tất trong khoảng thời gian đã chọn."
        onRetry={() => setReloadKey((value) => value + 1)}
      >
        {data && !isEmpty && (
          <div className="report-stack">
            <HorizontalBarChart
              data={data.employees.items}
              labelKey="name"
              title="So sánh doanh thu nhân viên"
              valueKey="netRevenue"
            />
            <section className="report-section">
              <header><h2>Doanh thu theo thu ngân</h2><p>Số ca, số hóa đơn và doanh thu trong kỳ theo từng nhân viên.</p></header>
              <DataTable caption="Doanh thu theo thu ngân" columns={employeeColumns} getRowKey={(item) => item.employeeId} rows={data.employees.items} />
              <Pagination
                disabled={state.isLoading}
                page={data.employees.pagination.page}
                totalPages={data.employees.pagination.totalPages}
                onPageChange={setEmployeePage}
              />
            </section>
            <section className="report-section">
              <header><h2>Lịch sử ca làm việc</h2><p>Giờ mở/đóng, tiền đầu/cuối ca, doanh thu và chênh lệch tiền mặt.</p></header>
              <DataTable caption="Lịch sử ca làm việc" columns={shiftColumns} getRowKey={(item) => item.shiftId} rows={data.shifts.items} />
              <Pagination
                disabled={state.isLoading}
                page={data.shifts.pagination.page}
                totalPages={data.shifts.pagination.totalPages}
                onPageChange={setShiftPage}
              />
            </section>
          </div>
        )}
      </AsyncContent>
    </section>
  );
}

export default WorkforceReportPage;
