import { useCallback, useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '../api';
import {
  AsyncContent,
  DataTable,
  FormField,
  Notice,
  PageHeader,
  Pagination,
} from '../components';
import {
  getCustomerInvoiceDetail,
  getCustomerInvoices,
  getCustomerLoyalty,
} from '../services/customer.service';

const PAGE_SIZE = 10;
const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });

function formatDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateTime.format(parsed);
}

function CustomerHistoryPage() {
  const [filters, setFilters] = useState({ from: '', to: '' });
  const [appliedFilters, setAppliedFilters] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const [filterError, setFilterError] = useState(null);
  const [listState, setListState] = useState({ data: null, error: null, isLoading: true });
  const [loyaltyState, setLoyaltyState] = useState({ data: null, error: null });
  const [detailState, setDetailState] = useState({ data: null, error: null, isLoading: false });

  const loadInvoices = useCallback(async (signal) => {
    setListState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await getCustomerInvoices(
        { ...appliedFilters, page, pageSize: PAGE_SIZE },
        { signal },
      );
      setListState({ data, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setListState({ data: null, error, isLoading: false });
    }
  }, [appliedFilters, page]);

  useEffect(() => {
    const controller = new AbortController();
    loadInvoices(controller.signal);
    return () => controller.abort();
  }, [loadInvoices]);

  useEffect(() => {
    const controller = new AbortController();
    getCustomerLoyalty({ signal: controller.signal })
      .then((data) => setLoyaltyState({ data, error: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') setLoyaltyState({ data: null, error });
      });
    return () => controller.abort();
  }, []);

  const openDetail = async (invoiceId) => {
    setDetailState({ data: null, error: null, isLoading: true });
    try {
      setDetailState({ data: await getCustomerInvoiceDetail(invoiceId), error: null, isLoading: false });
    } catch (error) {
      setDetailState({ data: null, error, isLoading: false });
    }
  };

  const columns = useMemo(() => [
    { key: 'invoiceId', header: 'Mã hóa đơn' },
    { key: 'purchasedAt', header: 'Ngày mua', render: (row) => formatDate(row.purchasedAt) },
    { key: 'status', header: 'Trạng thái' },
    { key: 'totalAmount', header: 'Tổng thanh toán', render: (row) => currency.format(row.totalAmount) },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (row) => (
        <button className="table-action" type="button" onClick={() => openDetail(row.invoiceId)}>
          Xem chi tiết
        </button>
      ),
    },
  ], []);

  const applyFilters = (event) => {
    event.preventDefault();
    setFilterError(null);
    if (filters.from && filters.to && filters.from > filters.to) {
      setFilterError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
      return;
    }
    setPage(1);
    setAppliedFilters(filters);
    setDetailState({ data: null, error: null, isLoading: false });
  };

  const pagination = listState.data?.pagination ?? { page, totalPages: 0 };

  return (
    <section className="workspace-page">
      <PageHeader
        eyebrow="MH-27"
        title="Lịch sử mua hàng và điểm"
        description="Dữ liệu chỉ gồm các hóa đơn thuộc tài khoản khách hàng hiện tại."
        actions={loyaltyState.data && (
          <div className="points-badge">
            <span>Điểm hiện tại</span>
            <strong>{loyaltyState.data.loyaltyPoints.toLocaleString('vi-VN')}</strong>
            <small>{loyaltyState.data.membershipTier}</small>
          </div>
        )}
      />
      <Notice tone="error">{loyaltyState.error && getErrorMessage(loyaltyState.error)}</Notice>
      <Notice tone="error">{filterError}</Notice>

      <form className="filter-bar" onSubmit={applyFilters}>
        <FormField htmlFor="historyFrom" label="Từ ngày">
          <input id="historyFrom" type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
        </FormField>
        <FormField htmlFor="historyTo" label="Đến ngày">
          <input id="historyTo" type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
        </FormField>
        <button className="button button--primary" type="submit">Áp dụng bộ lọc</button>
      </form>

      <AsyncContent
        emptyTitle="Chưa có hóa đơn"
        emptyMessage="Không tìm thấy hóa đơn trong khoảng thời gian đã chọn."
        error={listState.error}
        isEmpty={listState.data?.items.length === 0}
        isLoading={listState.isLoading}
        loadingMessage="Đang tải lịch sử mua hàng…"
        onRetry={() => loadInvoices()}
      >
        {listState.data && listState.data.items.length > 0 && (
          <>
            <DataTable
              caption="Danh sách hóa đơn của khách hàng"
              columns={columns}
              getRowKey={(row) => row.invoiceId}
              rows={listState.data.items}
            />
            <Pagination
              disabled={listState.isLoading}
              page={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </AsyncContent>

      {(detailState.isLoading || detailState.error || detailState.data) && (
        <section className="invoice-detail" aria-live="polite">
          <AsyncContent
            error={detailState.error}
            isLoading={detailState.isLoading}
            loadingMessage="Đang tải chi tiết hóa đơn…"
          >
            {detailState.data && (
              <>
                <div className="invoice-detail__heading">
                  <div><p className="eyebrow">Chi tiết hóa đơn</p><h2>{detailState.data.invoiceId}</h2></div>
                  <button className="button button--ghost" type="button" onClick={() => setDetailState({ data: null, error: null, isLoading: false })}>Đóng</button>
                </div>
                <p>Mua lúc {formatDate(detailState.data.purchasedAt)} · {detailState.data.status}</p>
                <DataTable
                  caption={`Sản phẩm trong hóa đơn ${detailState.data.invoiceId}`}
                  columns={[
                    { key: 'productName', header: 'Sản phẩm' },
                    { key: 'quantity', header: 'Số lượng' },
                    { key: 'unitPrice', header: 'Đơn giá', render: (row) => currency.format(row.unitPrice) },
                    { key: 'discountAmount', header: 'Giảm giá', render: (row) => currency.format(row.discountAmount) },
                    { key: 'lineTotal', header: 'Thành tiền', render: (row) => currency.format(row.lineTotal) },
                  ]}
                  getRowKey={(row) => row.productId}
                  rows={detailState.data.items}
                />
                <dl className="invoice-totals">
                  <div><dt>Tạm tính</dt><dd>{currency.format(detailState.data.subtotal)}</dd></div>
                  <div><dt>Giảm giá</dt><dd>{currency.format(detailState.data.discountAmount)}</dd></div>
                  <div><dt>Tổng thanh toán</dt><dd>{currency.format(detailState.data.totalAmount)}</dd></div>
                </dl>
              </>
            )}
          </AsyncContent>
        </section>
      )}
    </section>
  );
}

export default CustomerHistoryPage;
