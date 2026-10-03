import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../api';
import AsyncContent from '../../components/AsyncContent';
import ConfirmDialog from '../../components/ConfirmDialog';
import FormField from '../../components/FormField';
import Notice from '../../components/Notice';
import PageHeader from '../../components/PageHeader';
import { canStartInvoiceReturn } from '../../components/invoicePresentation';
import { getInvoice } from '../../services/invoice.service';
import { createReturn } from '../../services/return.service';
import {
  buildReturnRequest,
  countSelectedUnits,
  createReturnRows,
  updateReturnRow,
} from './returnForm';

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value ?? 0);
}

function ReturnResult({ result }) {
  if (!result) return null;
  return (
    <article className="return-result" aria-live="polite">
      <header>
        <div>
          <p className="eyebrow">Phiếu trả đã hoàn tất</p>
          <h2>{result.returnId}</h2>
        </div>
        <span className="status-badge status-badge--active">{result.status}</span>
      </header>
      <dl className="return-result__summary">
        <div><dt>Hóa đơn gốc</dt><dd>{result.invoiceId}</dd></div>
        <div><dt>Tổng tiền hoàn</dt><dd>{formatMoney(result.refundAmount)}</dd></div>
        <div><dt>Điểm điều chỉnh</dt><dd>{result.loyaltyPointsAdjusted > 0 ? `-${result.loyaltyPointsAdjusted}` : '0'}</dd></div>
        <div><dt>Trạng thái hóa đơn</dt><dd>{result.invoiceStatus}</dd></div>
      </dl>
      <div className="table-scroll" tabIndex={0}>
        <table className="data-table return-result__table">
          <caption>Chi tiết tiền hoàn do máy chủ xác nhận</caption>
          <thead><tr><th>Sản phẩm</th><th>Lô</th><th>SL trả</th><th>Tình trạng</th><th>Tiền hoàn</th></tr></thead>
          <tbody>
            {result.items.map((item) => (
              <tr key={`${item.lineId}:${item.lot.lotId}`}>
                <td><strong>{item.product.name}</strong><small>{item.product.productId} · {item.product.unit}</small></td>
                <td>{item.lot.manufacturerLot || item.lot.lotId}</td>
                <td>{item.quantity}</td>
                <td>{item.condition === 'RESALABLE' ? 'Bán lại được' : 'Hư hỏng'}</td>
                <td><strong>{formatMoney(item.refundAmount)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function CashierReturnPage() {
  const { invoiceId: routeInvoiceId } = useParams();
  const navigate = useNavigate();
  const [invoiceInput, setInvoiceInput] = useState(routeInvoiceId ?? '');
  const [invoiceState, setInvoiceState] = useState({ data: null, error: null, isLoading: false });
  const [rows, setRows] = useState([]);
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [refreshWarning, setRefreshWarning] = useState('');

  const loadInvoice = useCallback(async (invoiceId) => {
    const normalized = invoiceId.trim();
    if (!normalized) {
      setFormError('Vui lòng nhập mã hóa đơn gốc.');
      return;
    }
    setFormError('');
    setRefreshWarning('');
    setInvoiceState({ data: null, error: null, isLoading: true });
    try {
      const data = await getInvoice(normalized);
      setInvoiceState({ data: data.invoice, error: null, isLoading: false });
      setRows(createReturnRows(data.invoice));
      setReason('');
      setResult(null);
      navigate(`/cashier/returns/${encodeURIComponent(data.invoice.invoiceId)}`, { replace: true });
    } catch (error) {
      setInvoiceState({ data: null, error, isLoading: false });
      setRows([]);
    }
  }, [navigate]);

  useEffect(() => {
    if (routeInvoiceId && routeInvoiceId !== invoiceState.data?.invoiceId) {
      setInvoiceInput(routeInvoiceId);
      loadInvoice(routeInvoiceId);
    }
  }, [invoiceState.data?.invoiceId, loadInvoice, routeInvoiceId]);

  const selectedUnits = useMemo(() => countSelectedUnits(rows), [rows]);
  const eligible = canStartInvoiceReturn(invoiceState.data);

  const openConfirmation = () => {
    try {
      const request = buildReturnRequest(invoiceState.data?.invoiceId, reason, rows);
      setFormError('');
      setSubmitError('');
      setConfirmation(request);
    } catch (error) {
      setFormError(error.message);
    }
  };

  const submitReturn = async () => {
    setIsSubmitting(true);
    setSubmitError('');
    let completedReturn;
    try {
      const data = await createReturn(confirmation);
      completedReturn = data.return;
      setResult(completedReturn);
      setConfirmation(null);
    } catch (error) {
      setSubmitError(getErrorMessage(error));
      setIsSubmitting(false);
      return;
    }

    try {
      const refreshed = await getInvoice(completedReturn.invoiceId);
      setInvoiceState({ data: refreshed.invoice, error: null, isLoading: false });
      setRows(createReturnRows(refreshed.invoice));
      setReason('');
    } catch (error) {
      setRefreshWarning('Phiếu trả đã hoàn tất nhưng chưa thể tải lại hóa đơn. Hãy bấm Tải lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="workspace-page return-page">
      <PageHeader
        eyebrow="MH-09 · F17"
        title="Xử lý đổi / trả hàng"
        description="Tải hóa đơn gốc, chọn đúng lô hàng cần trả và để hệ thống xác nhận số tiền hoàn."
      />

      <form
        className="return-invoice-search"
        onSubmit={(event) => {
          event.preventDefault();
          loadInvoice(invoiceInput);
        }}
      >
        <FormField htmlFor="return-invoice-id" label="Mã hóa đơn gốc" required>
          <input
            id="return-invoice-id"
            maxLength="15"
            placeholder="Nhập mã hóa đơn"
            value={invoiceInput}
            onChange={(event) => setInvoiceInput(event.target.value)}
          />
        </FormField>
        <button className="button button--primary" disabled={invoiceState.isLoading} type="submit">
          {invoiceState.isLoading ? 'Đang tải…' : 'Tải hóa đơn'}
        </button>
      </form>

      <Notice tone="error">{formError}</Notice>
      <Notice tone="warning">{refreshWarning}</Notice>
      <ReturnResult result={result} />

      <AsyncContent
        error={invoiceState.error}
        isLoading={invoiceState.isLoading}
        loadingMessage="Đang tải hóa đơn gốc…"
        onRetry={() => loadInvoice(invoiceInput)}
      >
        {invoiceState.data && (
          <article className="return-workspace">
            <header className="return-workspace__header">
              <div>
                <p className="eyebrow">Hóa đơn gốc</p>
                <h2>{invoiceState.data.invoiceId}</h2>
                <p>{invoiceState.data.customer?.name || 'Khách lẻ'} · {formatMoney(invoiceState.data.totals.totalAmount)}</p>
              </div>
              <span className={`status-badge status-badge--${eligible ? 'active' : 'warning'}`}>
                {invoiceState.data.status}
              </span>
            </header>

            {!eligible ? (
              <Notice tone="error">Hóa đơn này không còn ở trạng thái cho phép đổi/trả hoặc không còn sản phẩm có thể trả.</Notice>
            ) : (
              <>
                <div className="table-scroll" tabIndex={0}>
                  <table className="data-table return-item-table">
                    <caption>Sản phẩm và lô còn có thể trả</caption>
                    <thead>
                      <tr>
                        <th>Sản phẩm / lô</th><th>Đã mua</th><th>Đã trả</th><th>Còn được trả</th>
                        <th>Trả lần này</th><th>Tình trạng</th><th>Tiền hoàn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.key}>
                          <td><strong>{row.productName}</strong><small>{row.productId} · Lô {row.manufacturerLot || row.lotId}</small></td>
                          <td>{row.quantitySold}</td>
                          <td>{row.quantityReturned}</td>
                          <td>{row.quantityReturnable}</td>
                          <td>
                            <input
                              aria-label={`Số lượng trả ${row.productName} lô ${row.manufacturerLot || row.lotId}`}
                              className="return-quantity-input"
                              inputMode="numeric"
                              max={row.quantityReturnable}
                              min="0"
                              type="number"
                              value={row.quantity}
                              onChange={(event) => {
                                const value = event.target.value;
                                if (value === '' || (/^\d+$/.test(value) && Number(value) <= row.quantityReturnable)) {
                                  setRows((current) => updateReturnRow(current, row.key, { quantity: value }));
                                }
                              }}
                            />
                          </td>
                          <td>
                            <select
                              aria-label={`Tình trạng ${row.productName} lô ${row.manufacturerLot || row.lotId}`}
                              value={row.condition}
                              onChange={(event) => setRows((current) => updateReturnRow(current, row.key, { condition: event.target.value }))}
                            >
                              <option value="RESALABLE">Bán lại được</option>
                              <option value="DAMAGED">Hư hỏng</option>
                            </select>
                          </td>
                          <td><span className="server-calculated">Máy chủ xác nhận</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="return-form-footer">
                  <FormField
                    error={reason.length > 255 ? 'Tối đa 255 ký tự.' : ''}
                    htmlFor="return-reason"
                    hint={`${reason.length}/255 ký tự`}
                    label="Lý do đổi/trả"
                    required
                  >
                    <textarea
                      id="return-reason"
                      maxLength="255"
                      rows="4"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </FormField>
                  <div className="return-submit-summary">
                    <span>Đã chọn</span>
                    <strong>{selectedUnits} đơn vị</strong>
                    <small>Tiền hoàn do máy chủ tính từ hóa đơn đã lưu.</small>
                    <button className="button button--primary" disabled={selectedUnits === 0} type="button" onClick={openConfirmation}>
                      Xác nhận đổi/trả
                    </button>
                  </div>
                </div>
              </>
            )}
          </article>
        )}
      </AsyncContent>

      {confirmation && (
        <ConfirmDialog
          confirmLabel="Hoàn tất đổi/trả"
          description={`Xác nhận trả ${selectedUnits} đơn vị thuộc hóa đơn ${confirmation.invoiceId}. Số tiền hoàn sẽ do máy chủ tính.`}
          error={submitError}
          isSubmitting={isSubmitting}
          onCancel={() => !isSubmitting && setConfirmation(null)}
          onConfirm={submitReturn}
          title="Xác nhận lập phiếu trả"
          tone="primary"
        />
      )}
    </section>
  );
}

export default CashierReturnPage;
