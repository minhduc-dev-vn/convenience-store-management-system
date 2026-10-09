import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../api';
import { getInvoice, listInvoices } from '../services/invoice.service';
import AsyncContent from './AsyncContent';
import DataTable from './DataTable';
import FormField from './FormField';
import Notice from './Notice';
import PageHeader from './PageHeader';
import Pagination from './Pagination';
import {
  canStartInvoiceReturn,
  countReturnableUnits,
  invoiceStatusLabel,
} from './invoicePresentation';

const PAGE_SIZE = 10;

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value ?? 0);
}

function formatDateTime(value) {
  return value
    ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '—';
}

function statusClass(status) {
  if (status === 'PAID') return 'active';
  if (status === 'REFUNDED') return 'warning';
  if (status === 'CANCELLED') return 'inactive';
  return 'pending';
}

function InvoiceDetail({ invoice, isCashier, onSelectReturn }) {
  const returnableUnits = countReturnableUnits(invoice);
  const returnEligible = isCashier && canStartInvoiceReturn(invoice);

  return (
    <article className="invoice-lookup-detail invoice-print-area">
      <header className="invoice-lookup-detail__header">
        <div>
          <h2>{invoice.invoiceId}</h2>
          <p>{formatDateTime(invoice.issuedAt)} · Ca #{invoice.shiftId}</p>
        </div>
        <span className={`status-badge status-badge--${statusClass(invoice.status)}`}>
          {invoiceStatusLabel(invoice.status)}
        </span>
      </header>

      <dl className="invoice-lookup-meta">
        <div><dt>Thu ngân</dt><dd>{invoice.cashier?.name || invoice.cashier?.employeeId}</dd></div>
        <div><dt>Khách hàng</dt><dd>{invoice.customer ? `${invoice.customer.name} · ${invoice.customer.phone}` : 'Khách lẻ'}</dd></div>
        <div><dt>Tổng thanh toán</dt><dd>{formatMoney(invoice.totals.totalAmount)}</dd></div>
        <div><dt>Còn có thể trả</dt><dd>{returnableUnits} đơn vị</dd></div>
      </dl>

      <div className="table-scroll" tabIndex={0}>
        <table className="data-table data-table--standard invoice-item-table">
          <caption>Hàng hóa trong hóa đơn</caption>
          <thead><tr><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>Giảm</th><th>Thành tiền</th><th>Còn được trả</th></tr></thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.lineId}>
                <td><strong>{item.name}</strong><small>{item.productId} · {item.unit}</small></td>
                <td>{item.quantity}</td>
                <td>{formatMoney(item.unitPrice)}</td>
                <td>{formatMoney(item.discountAmount)}</td>
                <td>{formatMoney(item.lineTotal)}</td>
                <td>{item.quantityReturnable}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="invoice-lookup-detail__lower">
        <section>
          <h3>Thanh toán</h3>
          {invoice.payments.length === 0 ? <p>Chưa có giao dịch thanh toán.</p> : invoice.payments.map((payment) => (
            <p key={payment.paymentId}>
              <strong>{payment.method}</strong> · {formatMoney(payment.amount)} · {payment.status}
            </p>
          ))}
        </section>
        <section>
          <h3>Lịch sử đổi/trả</h3>
          {invoice.returns.length === 0 ? <p>Chưa có phiếu trả hoàn tất.</p> : invoice.returns.map((item) => (
            <p key={item.returnId}>
              <strong>{item.returnId}</strong> · {formatMoney(item.refundAmount)} · {item.status}
            </p>
          ))}
        </section>
      </div>

      <dl className="invoice-totals invoice-lookup-totals">
        <div><dt>Tạm tính</dt><dd>{formatMoney(invoice.totals.subtotal)}</dd></div>
        <div><dt>Tổng giảm</dt><dd>-{formatMoney(invoice.totals.totalDiscount)}</dd></div>
        <div><dt>Tổng thanh toán</dt><dd>{formatMoney(invoice.totals.totalAmount)}</dd></div>
      </dl>

      <div className="invoice-lookup-actions no-print">
        <button className="button button--secondary" type="button" onClick={() => window.print()}>
          In lại hóa đơn
        </button>
        {returnEligible && (
          <button className="button button--primary" type="button" onClick={() => onSelectReturn(invoice)}>
            Chọn để xử lý đổi/trả
          </button>
        )}
      </div>
    </article>
  );
}

function InvoiceLookupWorkspace({ role }) {
  const isCashier = role === 'CASHIER';
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ invoiceId: '', from: '', to: '', cashierId: '' });
  const [appliedFilters, setAppliedFilters] = useState({ invoiceId: '', from: '', to: '', cashierId: '' });
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [detail, setDetail] = useState({ data: null, error: null, isLoading: false });
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [filterError, setFilterError] = useState('');

  const load = useCallback(async (signal) => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      const data = await listInvoices(
        { ...appliedFilters, page, pageSize: PAGE_SIZE },
        { signal },
      );
      setState({ data, error: null, isLoading: false });
    } catch (error) {
      if (error.name !== 'AbortError') setState({ data: null, error, isLoading: false });
    }
  }, [appliedFilters, page, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const loadDetail = async (invoiceId) => {
    setSelectedInvoiceId(invoiceId);
    setDetail({ data: null, error: null, isLoading: true });
    try {
      const data = await getInvoice(invoiceId);
      setDetail({ data: data.invoice, error: null, isLoading: false });
    } catch (error) {
      setDetail({ data: null, error, isLoading: false });
    }
  };

  const columns = useMemo(() => [
    { key: 'invoiceId', header: 'Mã HĐ' },
    { key: 'issuedAt', header: 'Ngày giờ', render: (row) => formatDateTime(row.issuedAt) },
    { key: 'cashier', header: 'Thu ngân', render: (row) => row.cashier?.name || row.cashier?.employeeId },
    { key: 'customer', header: 'Khách hàng', render: (row) => row.customer?.name || 'Khách lẻ' },
    { key: 'total', header: 'Tổng tiền', render: (row) => formatMoney(row.totals.totalAmount) },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (row) => (
        <span className={`status-badge status-badge--${statusClass(row.status)}`}>
          {invoiceStatusLabel(row.status)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      render: (row) => (
        <button className="table-action" type="button" onClick={() => loadDetail(row.invoiceId)}>
          Xem chi tiết
        </button>
      ),
    },
  ], []);

  const pagination = state.data?.pagination ?? { page, totalPages: 0 };

  return (
    <section className="workspace-page invoice-lookup-page">
      <PageHeader
        title="Tra cứu hóa đơn"
        description="Tìm hóa đơn theo mã, khoảng ngày hoặc thu ngân và xem lại dữ liệu giao dịch đã lưu."
      />

      <Notice tone="error">{filterError}</Notice>

      <form
        className="filter-bar invoice-filter"
        onSubmit={(event) => {
          event.preventDefault();
          if (filters.from && filters.to && filters.from > filters.to) {
            setFilterError('Từ ngày không thể sau đến ngày.');
            return;
          }
          setFilterError('');
          setPage(1);
          setAppliedFilters(filters);
          setDetail({ data: null, error: null, isLoading: false });
          setSelectedInvoiceId('');
        }}
      >
        <FormField htmlFor={`${role}-invoice-id`} label="Mã hóa đơn">
          <input id={`${role}-invoice-id`} maxLength="15" value={filters.invoiceId} onChange={(event) => setFilters((current) => ({ ...current, invoiceId: event.target.value }))} />
        </FormField>
        <FormField htmlFor={`${role}-invoice-from`} label="Từ ngày">
          <input id={`${role}-invoice-from`} type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
        </FormField>
        <FormField htmlFor={`${role}-invoice-to`} label="Đến ngày">
          <input id={`${role}-invoice-to`} type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
        </FormField>
        <FormField htmlFor={`${role}-cashier-id`} label="Mã thu ngân">
          <input id={`${role}-cashier-id`} maxLength="10" value={filters.cashierId} onChange={(event) => setFilters((current) => ({ ...current, cashierId: event.target.value }))} />
        </FormField>
        <button className="button button--primary" type="submit">Tìm kiếm</button>
      </form>

      <AsyncContent
        error={state.error}
        isEmpty={state.data?.items.length === 0}
        isLoading={state.isLoading}
        loadingMessage="Đang tra cứu hóa đơn…"
        emptyTitle="Không tìm thấy hóa đơn"
        emptyMessage="Hãy kiểm tra mã hóa đơn hoặc thay đổi điều kiện tra cứu."
        onRetry={() => setReloadKey((value) => value + 1)}
      >
        {state.data?.items.length > 0 && (
          <>
            <DataTable caption="Danh sách hóa đơn" columns={columns} getRowKey={(row) => row.invoiceId} rows={state.data.items} />
            <Pagination disabled={state.isLoading} page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
          </>
        )}
      </AsyncContent>

      <section className="invoice-detail-region" aria-live="polite">
        <AsyncContent
          error={detail.error}
          isLoading={detail.isLoading}
          loadingMessage="Đang tải chi tiết hóa đơn…"
          onRetry={() => selectedInvoiceId && loadDetail(selectedInvoiceId)}
        >
          {detail.data && (
            <InvoiceDetail
              invoice={detail.data}
              isCashier={isCashier}
              onSelectReturn={(invoice) => navigate(`/cashier/returns/${encodeURIComponent(invoice.invoiceId)}`)}
            />
          )}
        </AsyncContent>
      </section>
    </section>
  );
}

export default InvoiceLookupWorkspace;
