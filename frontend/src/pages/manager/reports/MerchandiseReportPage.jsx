import { useCallback, useEffect, useMemo, useState } from 'react';
import { AsyncContent, DataTable, PageHeader, Pagination } from '../../../components';
import {
  CategoryDonutChart,
  HorizontalBarChart,
  ReportDateFilter,
  ReportKpiGrid,
} from '../../../components/reports';
import {
  getInventoryReport,
  getProductReport,
  getReceivingReport,
} from '../../../services/reporting.service';
import { formatInteger, formatMoney } from './reportingPresentation';
import useReportPeriod from './useReportPeriod';

const PAGE_SIZE = 10;

const productColumns = [
  { key: 'rank', header: 'Hạng', render: (item) => `#${item.rank}` },
  { key: 'productId', header: 'Mã SP' },
  { key: 'name', header: 'Tên sản phẩm' },
  { key: 'category', header: 'Ngành hàng', render: (item) => item.category?.name || '—' },
  { key: 'netSoldQuantity', header: 'SL bán thuần', render: (item) => formatInteger(item.netSoldQuantity) },
  { key: 'netRevenue', header: 'Doanh thu thuần', render: (item) => <strong>{formatMoney(item.netRevenue)}</strong> },
  { key: 'currentStock', header: 'Tồn hiện tại', render: (item) => formatInteger(item.currentStock) },
];

const inventoryColumns = [
  { key: 'productId', header: 'Mã SP' },
  { key: 'name', header: 'Sản phẩm' },
  { key: 'category', header: 'Ngành hàng', render: (item) => item.category?.name || '—' },
  { key: 'totalStock', header: 'Tổng tồn', render: (item) => formatInteger(item.totalStock) },
  { key: 'sellableStock', header: 'Có thể bán', render: (item) => formatInteger(item.sellableStock) },
  { key: 'blockedStock', header: 'Bị khóa', render: (item) => formatInteger(item.blockedStock) },
  { key: 'expiredStock', header: 'Hết hạn', render: (item) => formatInteger(item.expiredStock) },
  { key: 'inventoryCostValue', header: 'Giá trị tồn', render: (item) => <strong>{formatMoney(item.inventoryCostValue)}</strong> },
];

const supplierColumns = [
  { key: 'supplierId', header: 'Mã NCC' },
  { key: 'name', header: 'Nhà cung cấp' },
  { key: 'confirmedReceiptCount', header: 'Phiếu đã xác nhận', render: (item) => formatInteger(item.confirmedReceiptCount) },
  { key: 'receivedQuantity', header: 'SL nhập', render: (item) => formatInteger(item.receivedQuantity) },
  { key: 'receivingCost', header: 'Chi phí nhập', render: (item) => <strong>{formatMoney(item.receivingCost)}</strong> },
];

function MerchandiseReportPage() {
  const { applyPeriod, draftPeriod, period, periodError, setDraftPeriod } = useReportPeriod();
  const [inventoryPage, setInventoryPage] = useState(1);
  const [receivingPage, setReceivingPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ data: null, error: null, isLoading: true });

  const loadReport = useCallback(async (signal) => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const [products, inventory, receiving] = await Promise.all([
        getProductReport({ ...period, limit: 10 }, { signal }),
        getInventoryReport({ page: inventoryPage, pageSize: PAGE_SIZE }, { signal }),
        getReceivingReport({ ...period, page: receivingPage, pageSize: PAGE_SIZE }, { signal }),
      ]);
      setState({ data: { inventory, products, receiving }, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setState({ data: null, error, isLoading: false });
    }
  }, [inventoryPage, period, receivingPage, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    loadReport(controller.signal);
    return () => controller.abort();
  }, [loadReport]);

  const submitPeriod = (event) => {
    if (applyPeriod(event)) {
      setInventoryPage(1);
      setReceivingPage(1);
    }
  };

  const data = state.data;
  const isEmpty = data
    ? data.products.categories.length === 0
      && data.products.bestProducts.length === 0
      && data.products.slowProducts.length === 0
      && data.inventory.items.length === 0
      && data.receiving.suppliers.items.length === 0
    : false;
  const kpis = useMemo(() => data ? [
    { label: 'Tổng giá trị tồn kho', value: formatMoney(data.inventory.summary.inventoryCostValue), note: 'Snapshot hiện tại' },
    { label: 'Tổng chi phí nhập hàng', value: formatMoney(data.receiving.summary.receivingCost), note: 'Trong khoảng đã chọn', tone: 'accent' },
    { label: 'Tổng lượng tồn', value: formatInteger(data.inventory.summary.totalStock) },
    { label: 'Phiếu nhập xác nhận', value: formatInteger(data.receiving.summary.confirmedReceiptCount) },
  ] : [], [data]);

  return (
    <section className="workspace-page report-page">
      <PageHeader
        title="Hàng bán, tồn kho và nhập hàng"
        description="Theo dõi cơ cấu doanh thu, tốc độ bán, giá trị tồn hiện tại và chi phí nhập trong kỳ."
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
        loadingMessage="Đang tổng hợp báo cáo hàng hóa…"
        emptyTitle="Chưa có dữ liệu hàng hóa"
        emptyMessage="Không tìm thấy giao dịch bán, nhập hoặc tồn kho phù hợp."
        onRetry={() => setReloadKey((value) => value + 1)}
      >
        {data && !isEmpty && (
          <div className="report-stack">
            <ReportKpiGrid items={kpis} />
            <div className="report-chart-grid">
              <CategoryDonutChart data={data.products.categories} />
              <HorizontalBarChart
                data={data.products.categories.slice(0, 8)}
                labelKey="name"
                title="Doanh thu thuần theo ngành hàng"
                valueKey="netRevenue"
              />
            </div>
            <section className="report-section">
              <header><h2>Top 10 sản phẩm bán chạy</h2><p>Xếp hạng theo dữ liệu bán hàng hợp lệ trong kỳ.</p></header>
              <DataTable caption="Top 10 sản phẩm bán chạy" columns={productColumns} getRowKey={(item) => item.productId} rows={data.products.bestProducts} />
            </section>
            <section className="report-section">
              <header><h2>Sản phẩm bán chậm</h2><p>Đối chiếu lượng bán thuần với tồn hiện tại để nhận diện hàng luân chuyển chậm.</p></header>
              <DataTable caption="Sản phẩm bán chậm" columns={productColumns} getRowKey={(item) => item.productId} rows={data.products.slowProducts} />
            </section>
            <section className="report-section">
              <header><h2>Tình hình tồn kho</h2><p>Snapshot tồn theo lô hiện tại; chỉ số này không bị hồi tố theo bộ lọc ngày.</p></header>
              <DataTable caption="Tình hình tồn kho" columns={inventoryColumns} getRowKey={(item) => item.productId} rows={data.inventory.items} />
              <Pagination
                disabled={state.isLoading}
                page={data.inventory.pagination.page}
                totalPages={data.inventory.pagination.totalPages}
                onPageChange={setInventoryPage}
              />
            </section>
            <section className="report-section">
              <header><h2>Tình hình nhập hàng</h2><p>Chi phí và sản lượng nhập theo nhà cung cấp trong kỳ.</p></header>
              <DataTable caption="Tình hình nhập hàng" columns={supplierColumns} getRowKey={(item) => item.supplierId} rows={data.receiving.suppliers.items} />
              <Pagination
                disabled={state.isLoading}
                page={data.receiving.suppliers.pagination.page}
                totalPages={data.receiving.suppliers.pagination.totalPages}
                onPageChange={setReceivingPage}
              />
            </section>
          </div>
        )}
      </AsyncContent>
    </section>
  );
}

export default MerchandiseReportPage;
