import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AsyncContent,
  DashboardMetricGrid,
  RoleDashboardHeader,
} from '../../components';
import { listInventoryProducts } from '../../services/inventory.service';

const ALERT_PAGE_SIZE = 5;
const NEAR_EXPIRY_DAYS = 30;
const number = new Intl.NumberFormat('vi-VN');

function AlertList({ emptyMessage, items }) {
  if (items.length === 0) return <p className="dashboard-task-empty">{emptyMessage}</p>;

  return (
    <ul className="dashboard-task-list">
      {items.map((product) => (
        <li key={product.productId}>
          <span>
            <strong>{product.name}</strong>
            <small>{product.productId} · {product.category?.name || 'Chưa phân loại'}</small>
          </span>
          <b>{number.format(product.totalStock)} {product.unit}</b>
        </li>
      ))}
    </ul>
  );
}

function WarehouseDashboardPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ data: null, error: null, isLoading: true });

  const loadAlerts = useCallback(async (signal) => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const [lowStock, nearExpiry] = await Promise.all([
        listInventoryProducts({ mode: 'LOW_STOCK', page: 1, pageSize: ALERT_PAGE_SIZE, nearExpiryDays: NEAR_EXPIRY_DAYS }, { signal }),
        listInventoryProducts({ mode: 'NEAR_EXPIRY', page: 1, pageSize: ALERT_PAGE_SIZE, nearExpiryDays: NEAR_EXPIRY_DAYS }, { signal }),
      ]);
      setState({ data: { lowStock, nearExpiry }, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setState({ data: null, error, isLoading: false });
    }
  }, [reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    loadAlerts(controller.signal);
    return () => controller.abort();
  }, [loadAlerts]);

  const data = state.data;
  const metrics = data ? [
    {
      label: 'Sản phẩm tồn thấp',
      value: data.lowStock.pagination.totalItems,
      note: 'Theo mức tồn tối thiểu',
      tone: data.lowStock.pagination.totalItems > 0 ? 'warning' : 'success',
      to: '/warehouse/inventory?mode=LOW_STOCK',
      linkLabel: 'Xem tồn thấp',
    },
    {
      label: 'Sản phẩm cận hạn',
      value: data.nearExpiry.pagination.totalItems,
      note: `Trong ${NEAR_EXPIRY_DAYS} ngày tới`,
      tone: data.nearExpiry.pagination.totalItems > 0 ? 'warning' : 'success',
      to: '/warehouse/inventory?mode=NEAR_EXPIRY',
      linkLabel: 'Xem lô cận hạn',
    },
  ] : [];

  return (
    <section className="workspace-page">
      <RoleDashboardHeader
        title="Tổng quan kho"
        description="Theo dõi cảnh báo tồn kho và hạn sử dụng từ dữ liệu hiện tại, đồng thời truy cập nhanh các nghiệp vụ nhập hàng và kiểm kê."
      />

      <AsyncContent
        error={state.error}
        isLoading={state.isLoading}
        loadingMessage="Đang tải cảnh báo kho…"
        onRetry={() => setReloadKey((value) => value + 1)}
      >
        {data && (
          <div className="dashboard-live-section">
            <DashboardMetricGrid items={metrics} />
            <div className="dashboard-task-grid">
              <article className="dashboard-task-panel">
                <div className="dashboard-task-panel__heading">
                  <div><h2>Tồn kho thấp</h2></div>
                  <Link to="/warehouse/inventory?mode=LOW_STOCK">Xem tất cả</Link>
                </div>
                <AlertList items={data.lowStock.items} emptyMessage="Không có sản phẩm dưới mức tồn tối thiểu." />
              </article>
              <article className="dashboard-task-panel">
                <div className="dashboard-task-panel__heading">
                  <div><h2>Lô sắp hết hạn</h2></div>
                  <Link to="/warehouse/inventory?mode=NEAR_EXPIRY">Xem tất cả</Link>
                </div>
                <AlertList items={data.nearExpiry.items} emptyMessage="Không có sản phẩm cận hạn trong ngưỡng hiện tại." />
              </article>
            </div>
          </div>
        )}
      </AsyncContent>

      <div className="dashboard-section-heading">
        <h2>Nghiệp vụ kho</h2>
      </div>
      <div className="dashboard-grid dashboard-grid--compact">
        <article className="action-card">
          <h2>Lập phiếu nhập kho</h2>
          <p>Chọn nhà cung cấp, sản phẩm, lô, ngày sản xuất, hạn dùng, số lượng và giá nhập.</p>
          <Link className="button button--primary" to="/warehouse/receiving/new">Tạo phiếu nhập</Link>
        </article>
        <article className="action-card">
          <h2>Danh sách và xác nhận</h2>
          <p>Kiểm tra phiếu nháp và xác nhận nhập kho bằng giao dịch dữ liệu an toàn.</p>
          <Link className="button button--primary" to="/warehouse/receiving">Mở danh sách phiếu</Link>
        </article>
        <article className="action-card action-card--wide">
          <h2>Tồn kho, lô và cảnh báo</h2>
          <p>Tra cứu tồn tổng, xem từng lô và lọc tồn thấp, cận hạn hoặc đã hết hạn.</p>
          <Link className="button button--primary" to="/warehouse/inventory">Mở tra cứu tồn kho</Link>
        </article>
        <article className="action-card action-card--wide">
          <h2>Tạo đợt và ghi nhận kiểm kê</h2>
          <p>Chụp snapshot tồn theo lô, nhập số lượng thực tế và gửi chênh lệch có lý do để phê duyệt.</p>
          <Link className="button button--primary" to="/warehouse/stocktakes">Mở kiểm kê kho</Link>
        </article>
      </div>
    </section>
  );
}

export default WarehouseDashboardPage;
