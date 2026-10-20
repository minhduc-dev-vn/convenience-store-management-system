import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AsyncContent,
  DashboardMetricGrid,
  RoleDashboardHeader,
} from '../../components';
import { getInventoryReport, getRevenueReport } from '../../services/reporting.service';
import { listManagerStocktakes } from '../../services/stocktake.service';
import {
  formatInteger,
  formatMoney,
  getDefaultReportPeriod,
} from './reports/reportingPresentation';

const MANAGER_ACTIONS = Object.freeze([
  { title: 'Nhân viên', description: 'Tra cứu, thêm, cập nhật hồ sơ và trạng thái nhân viên.', to: '/manager/employees' },
  { title: 'Tài khoản và phân quyền', description: 'Tạo tài khoản, gán role, khóa/mở và cấp lại mật khẩu.', to: '/manager/accounts' },
  { title: 'Khách hàng thành viên', description: 'Tra cứu thành viên, điểm, hạng, hóa đơn và trạng thái tài khoản.', to: '/manager/customers' },
  { title: 'Sản phẩm và loại hàng', description: 'Quản lý danh mục, barcode, giá niêm yết và trạng thái kinh doanh.', to: '/manager/products' },
  { title: 'Giá bán và lịch sử', description: 'Cập nhật giá có xác nhận, lý do và lịch sử audit.', to: '/manager/products/pricing' },
  { title: 'Chương trình khuyến mãi', description: 'Quản lý điều kiện, thời gian và sản phẩm áp dụng.', to: '/manager/promotions' },
  { title: 'Nhà cung cấp', description: 'Quản lý hồ sơ và trạng thái hợp tác của nhà cung cấp.', to: '/manager/suppliers' },
  { title: 'Tồn kho và cảnh báo', description: 'Theo dõi tồn tổng, lô, tồn thấp và hạn sử dụng.', to: '/manager/inventory' },
  { title: 'Phê duyệt điều chỉnh kho', description: 'Xem chênh lệch kiểm kê và phê duyệt hoặc yêu cầu kiểm lại.', to: '/manager/stocktakes' },
  { title: 'Nhật ký hệ thống', description: 'Tra cứu actor, hành động, đối tượng và dữ liệu thay đổi.', to: '/manager/audit-logs' },
  { title: 'Báo cáo kinh doanh', description: 'Phân tích doanh thu, hàng hóa, nhập kho, nhân viên và ca.', to: '/manager/reports' },
]);

function ManagerDashboardPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ data: null, error: null, isLoading: true });

  const loadDashboard = useCallback(async (signal) => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const period = getDefaultReportPeriod();
      const [revenue, inventory, pendingStocktakes] = await Promise.all([
        getRevenueReport(period, { signal }),
        getInventoryReport({ page: 1, pageSize: 1 }, { signal }),
        listManagerStocktakes({ page: 1, pageSize: 5, workflowState: 'PENDING_APPROVAL' }, { signal }),
      ]);
      setState({ data: { inventory, pendingStocktakes, period, revenue }, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setState({ data: null, error, isLoading: false });
    }
  }, [reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    loadDashboard(controller.signal);
    return () => controller.abort();
  }, [loadDashboard]);

  const data = state.data;
  const pendingCount = data?.pendingStocktakes.pagination.totalItems ?? 0;
  const metrics = data ? [
    {
      label: 'Doanh thu thuần tháng',
      value: formatMoney(data.revenue.summary.netRevenue),
      note: `${data.period.from} → ${data.period.to}`,
      tone: 'accent',
      to: '/manager/reports/revenue',
      linkLabel: 'Xem doanh thu',
    },
    {
      label: 'Hóa đơn hoàn tất',
      value: formatInteger(data.revenue.summary.completedInvoiceCount),
      note: 'Trong tháng hiện tại',
      to: '/manager/invoices',
      linkLabel: 'Tra cứu hóa đơn',
    },
    {
      label: 'Giá trị tồn kho',
      value: formatMoney(data.inventory.summary.inventoryCostValue),
      note: `${formatInteger(data.inventory.summary.totalStock)} đơn vị đang tồn`,
      to: '/manager/reports/merchandise',
      linkLabel: 'Xem hàng hóa',
    },
    {
      label: 'Chờ duyệt kiểm kê',
      value: formatInteger(pendingCount),
      note: 'Đề nghị điều chỉnh kho',
      tone: pendingCount > 0 ? 'warning' : 'success',
      to: '/manager/stocktakes',
      linkLabel: 'Mở danh sách duyệt',
    },
  ] : [];

  return (
    <section className="workspace-page">
      <RoleDashboardHeader
        title="Tổng quan điều hành"
        description="Theo dõi KPI từ báo cáo hệ thống, các đề nghị kiểm kê chờ xử lý và truy cập nhanh toàn bộ nghiệp vụ quản trị."
      />

      <AsyncContent
        error={state.error}
        isLoading={state.isLoading}
        loadingMessage="Đang tổng hợp dữ liệu điều hành…"
        onRetry={() => setReloadKey((value) => value + 1)}
      >
        {data && (
          <div className="dashboard-live-section">
            <DashboardMetricGrid items={metrics} />
            <article className="dashboard-task-panel dashboard-task-panel--wide">
              <div className="dashboard-task-panel__heading">
                <div><h2>Đề nghị điều chỉnh kho chờ duyệt</h2></div>
                <Link to="/manager/stocktakes">Xem tất cả</Link>
              </div>
              {data.pendingStocktakes.items.length === 0 ? (
                <p className="dashboard-task-empty">Không có đề nghị kiểm kê đang chờ phê duyệt.</p>
              ) : (
                <ul className="dashboard-task-list">
                  {data.pendingStocktakes.items.map((stocktake) => (
                    <li key={stocktake.stocktakeId}>
                      <span>
                        <strong>{stocktake.stocktakeId}</strong>
                        <small>{stocktake.createdBy?.name || stocktake.createdBy?.employeeId || 'Nhân viên kho'} · {stocktake.discrepancyCount} dòng lệch</small>
                      </span>
                      <Link to={`/manager/stocktakes?stocktakeId=${encodeURIComponent(stocktake.stocktakeId)}`}>Xem đề nghị</Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>
        )}
      </AsyncContent>

      <div className="dashboard-section-heading">
        <h2>Không gian quản trị</h2>
      </div>
      <div className="dashboard-grid dashboard-grid--compact">
        {MANAGER_ACTIONS.map((action) => (
          <article className="action-card" key={action.to}>
            <h2>{action.title}</h2>
            <p>{action.description}</p>
            <Link className="button button--primary" to={action.to}>Mở chức năng</Link>
          </article>
        ))}
      </div>
    </section>
  );
}

export default ManagerDashboardPage;
