import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ConfirmDialog,
  DashboardMetricGrid,
  ErrorState,
  FormField,
  LoadingState,
  Notice,
  RoleDashboardHeader,
} from '../../components';
import { getErrorMessage } from '../../api/errors';
import { calculateShiftDifference } from '../../components/invoicePresentation';
import {
  closePosShift,
  getCurrentPosShift,
  getShiftReconciliation,
  openPosShift,
} from '../../services/pos.service';

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value ?? 0);
}

function formatDateTime(value) {
  return value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
}

function formatDifferencePreview(closingCash, expectedCash) {
  const difference = calculateShiftDifference(closingCash, expectedCash);
  return difference === null ? '—' : formatMoney(difference);
}

function CashierDashboardPage() {
  const navigate = useNavigate();
  const [shift, setShift] = useState(null);
  const [openingCash, setOpeningCash] = useState('0');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reconciliation, setReconciliation] = useState(null);
  const [reconciliationError, setReconciliationError] = useState('');
  const [isReconciliationLoading, setIsReconciliationLoading] = useState(false);
  const [closingCash, setClosingCash] = useState('');
  const [closingNote, setClosingNote] = useState('');
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const [closedSummary, setClosedSummary] = useState(null);

  async function loadShift() {
    setStatus('loading');
    setError('');
    try {
      const data = await getCurrentPosShift();
      setShift(data.shift);
      setClosedSummary(null);
      setStatus('ready');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setStatus('error');
    }
  }

  useEffect(() => {
    loadShift();
  }, []);

  async function loadReconciliation() {
    if (!shift) return;
    setIsReconciliationLoading(true);
    setReconciliationError('');
    try {
      const data = await getShiftReconciliation(shift.shiftId);
      setReconciliation(data.reconciliation);
      setClosingCash((current) => current || String(data.reconciliation.expectedCash));
    } catch (requestError) {
      setReconciliationError(getErrorMessage(requestError));
    } finally {
      setIsReconciliationLoading(false);
    }
  }

  useEffect(() => {
    if (shift?.shiftId) loadReconciliation();
    else setReconciliation(null);
  }, [shift?.shiftId]);

  async function handleOpenShift(event) {
    event.preventDefault();
    const amount = Number(openingCash);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Tiền mặt đầu ca phải là số lớn hơn hoặc bằng 0.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      const data = await openPosShift({ openingCash: amount, note: note.trim() || null });
      setShift(data.shift);
      setClosedSummary(null);
      navigate('/cashier/pos', { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  function prepareCloseShift(event) {
    event.preventDefault();
    const amount = Number(closingCash);
    if (!Number.isFinite(amount) || amount < 0) {
      setReconciliationError('Tiền mặt cuối ca phải là số lớn hơn hoặc bằng 0.');
      return;
    }
    setReconciliationError('');
    setIsCloseConfirmOpen(true);
  }

  async function handleCloseShift() {
    setIsSubmitting(true);
    setReconciliationError('');
    try {
      const data = await closePosShift(shift.shiftId, {
        closingCash: Number(closingCash),
        note: closingNote.trim() || null,
      });
      setClosedSummary(data.reconciliation);
      setReconciliation(data.reconciliation);
      setShift(null);
      setIsCloseConfirmOpen(false);
    } catch (requestError) {
      setReconciliationError(getErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  const dashboardHeader = (
    <RoleDashboardHeader
      title="Tổng quan thu ngân"
      description="Theo dõi trạng thái ca trực tiếp từ hệ thống và truy cập nhanh POS, hóa đơn, đổi trả hoặc đối chiếu cuối ca."
    />
  );

  if (status === 'loading') {
    return <section className="workspace-page">{dashboardHeader}<LoadingState message="Đang kiểm tra ca làm việc hiện tại" /></section>;
  }
  if (status === 'error') {
    return <section className="workspace-page">{dashboardHeader}<ErrorState message={error} onRetry={loadShift} /></section>;
  }

  const shiftMetrics = [
    {
      label: 'Trạng thái ca',
      value: shift ? 'OPEN' : 'CLOSED',
      note: shift ? `Ca #${shift.shiftId}` : 'Chưa có ca đang mở',
      tone: shift ? 'success' : 'warning',
    },
    {
      label: 'Doanh thu ca',
      value: reconciliation ? formatMoney(reconciliation.grossRevenue) : '—',
      note: reconciliation ? 'Dữ liệu đã ghi nhận' : 'Có sau khi mở ca',
    },
    {
      label: 'Hóa đơn hoàn tất',
      value: reconciliation?.completedInvoiceCount ?? '—',
      note: reconciliation ? 'Trong ca hiện tại' : 'Có sau khi mở ca',
      to: '/cashier/invoices',
      linkLabel: 'Tra cứu hóa đơn',
    },
  ];

  return (
    <section className="workspace-page cashier-shift-page">
      {dashboardHeader}
      <DashboardMetricGrid items={shiftMetrics} />

      {closedSummary ? (
        <article className="shift-active-card shift-handoff-print-area">
          <div className="shift-active-card__status">
            <span className="status-badge status-badge--inactive">{closedSummary.status}</span>
            <p>Ca #{closedSummary.shiftId} đã đóng</p>
          </div>
          <h2>Phiếu đối chiếu cuối ca</h2>
          <dl className="shift-reconciliation-grid">
            <div><dt>Thu ngân</dt><dd>{closedSummary.employee?.name || closedSummary.employee?.employeeId}</dd></div>
            <div><dt>Thời gian đóng</dt><dd>{formatDateTime(closedSummary.closedAt)}</dd></div>
            <div><dt>Tiền đầu ca</dt><dd>{formatMoney(closedSummary.openingCash)}</dd></div>
            <div><dt>Doanh thu tiền mặt</dt><dd>{formatMoney(closedSummary.cashRevenue)}</dd></div>
            <div><dt>Tiền hệ thống</dt><dd>{formatMoney(closedSummary.expectedCash)}</dd></div>
            <div><dt>Tiền kiểm đếm</dt><dd>{formatMoney(closedSummary.closingCash)}</dd></div>
            <div><dt>Chênh lệch</dt><dd>{formatMoney(closedSummary.difference)}</dd></div>
            <div><dt>Hóa đơn hoàn tất</dt><dd>{closedSummary.completedInvoiceCount}</dd></div>
          </dl>
          {closedSummary.note && <p className="shift-close-note">Ghi chú: {closedSummary.note}</p>}
          <div className="inline-actions no-print">
            <button className="button button--secondary" type="button" onClick={() => window.print()}>In phiếu bàn giao</button>
            <button className="button button--primary" type="button" onClick={() => {
              setClosedSummary(null);
              setClosingCash('');
              setClosingNote('');
            }}>Mở ca mới</button>
          </div>
        </article>
      ) : shift ? (
        <div className="cashier-shift-workspace">
          <div className="shift-active-card">
          <div className="shift-active-card__status">
            <span className="status-badge status-badge--active">{shift.status}</span>
            <p>Ca #{shift.shiftId}</p>
          </div>
          <dl className="shift-details">
            <div><dt>Thu ngân</dt><dd>{shift.employee?.name || shift.employee?.employeeId}</dd></div>
            <div><dt>Bắt đầu</dt><dd>{formatDateTime(shift.startedAt)}</dd></div>
            <div><dt>Tiền đầu ca</dt><dd>{formatMoney(shift.openingCash)}</dd></div>
            <div><dt>Ghi chú</dt><dd>{shift.note || 'Không có'}</dd></div>
          </dl>
          <Link className="button button--primary" to="/cashier/pos">Vào quầy bán hàng</Link>
          </div>

          <section className="shift-reconciliation-card">
            <div className="shift-reconciliation-card__heading">
              <div><p className="eyebrow">MH-05 · F18</p><h2>Đối chiếu và đóng ca</h2></div>
              <button className="button button--ghost" type="button" disabled={isReconciliationLoading} onClick={loadReconciliation}>Làm mới số liệu</button>
            </div>
            <Notice tone="error">{reconciliationError}</Notice>
            {isReconciliationLoading && !reconciliation ? (
              <LoadingState message="Đang tổng hợp doanh thu ca" />
            ) : reconciliation && (
              <>
                <dl className="shift-reconciliation-grid">
                  <div><dt>Tổng doanh thu</dt><dd>{formatMoney(reconciliation.grossRevenue)}</dd></div>
                  <div><dt>Doanh thu tiền mặt</dt><dd>{formatMoney(reconciliation.cashRevenue)}</dd></div>
                  <div><dt>Doanh thu không tiền mặt</dt><dd>{formatMoney(reconciliation.nonCashRevenue)}</dd></div>
                  <div><dt>Tiền dự kiến trong quầy</dt><dd>{formatMoney(reconciliation.expectedCash)}</dd></div>
                  <div><dt>Hóa đơn hoàn tất</dt><dd>{reconciliation.completedInvoiceCount}</dd></div>
                  <div><dt>Hóa đơn chưa hoàn tất</dt><dd>{reconciliation.unfinishedInvoiceCount}</dd></div>
                </dl>
                {reconciliation.unfinishedInvoiceCount > 0 && (
                  <Notice tone="warning">Cần hoàn tất hoặc xử lý các hóa đơn DRAFT trước khi đóng ca.</Notice>
                )}
                <form className="shift-close-form" onSubmit={prepareCloseShift}>
                  <FormField htmlFor="closing-cash" label="Tiền mặt cuối ca" required hint="Nhập số tiền mặt thực tế đã kiểm đếm.">
                    <input id="closing-cash" min="0" step="1000" type="number" value={closingCash} onChange={(event) => setClosingCash(event.target.value)} />
                  </FormField>
                  <FormField htmlFor="closing-note" label="Ghi chú chênh lệch">
                    <textarea id="closing-note" maxLength="255" rows="3" value={closingNote} onChange={(event) => setClosingNote(event.target.value)} />
                  </FormField>
                  <div className="shift-difference-preview">
                    <span>Chênh lệch dự kiến</span>
                    <strong>{formatDifferencePreview(closingCash, reconciliation.expectedCash)}</strong>
                  </div>
                  <button className="button button--danger" type="submit" disabled={reconciliation.unfinishedInvoiceCount > 0 || isSubmitting}>
                    Đóng ca
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      ) : (
        <form className="form-card cashier-open-form" onSubmit={handleOpenShift}>
          <div>
            <p className="eyebrow">Thông tin bàn giao đầu ca</p>
            <h2>Ghi nhận tiền mặt đầu ca</h2>
            <p>Thời điểm bắt đầu, mã ca và thu ngân được hệ thống tự ghi nhận.</p>
          </div>
          <Notice tone="error">{error}</Notice>
          <FormField htmlFor="opening-cash" label="Tiền mặt đầu ca" required hint="Nhập 0 nếu quầy không có tiền bàn giao.">
            <input
              id="opening-cash"
              min="0"
              step="1000"
              type="number"
              value={openingCash}
              onChange={(event) => setOpeningCash(event.target.value)}
            />
          </FormField>
          <FormField htmlFor="shift-note" label="Ghi chú">
            <textarea
              id="shift-note"
              maxLength="255"
              rows="3"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </FormField>
          <button className="button button--primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Đang mở ca…' : 'Mở ca và vào POS'}
          </button>
        </form>
      )}

      {isCloseConfirmOpen && reconciliation && (
        <ConfirmDialog
          title="Xác nhận đóng ca?"
          description={`Ca #${shift.shiftId} sẽ chuyển sang CLOSED. Tiền kiểm đếm ${formatMoney(Number(closingCash))}, chênh lệch ${formatDifferencePreview(closingCash, reconciliation.expectedCash)}.`}
          confirmLabel="Xác nhận đóng ca"
          error={reconciliationError}
          isSubmitting={isSubmitting}
          onCancel={() => !isSubmitting && setIsCloseConfirmOpen(false)}
          onConfirm={handleCloseShift}
        />
      )}

      <div className="dashboard-section-heading">
        <p className="eyebrow">Thao tác nhanh</p>
        <h2>Nghiệp vụ thu ngân</h2>
      </div>
      <div className="dashboard-grid dashboard-grid--compact">
        <article className="action-card">
          <p className="eyebrow">MH-06 · F10/F11</p>
          <h2>Bán hàng tại quầy</h2>
          <p>Quét barcode, tìm sản phẩm và lập giỏ hàng. POS chỉ khả dụng khi ca đang OPEN.</p>
          <Link className={`button ${shift ? 'button--primary' : 'button--ghost'}`} to={shift ? '/cashier/pos' : '/cashier'}>
            {shift ? 'Vào POS' : 'Mở ca trước'}
          </Link>
        </article>
        <article className="action-card">
          <p className="eyebrow">MH-08 · F16</p>
          <h2>Tra cứu hóa đơn</h2>
          <p>Tìm hóa đơn theo mã hoặc thời gian và xem chi tiết dữ liệu đã lưu.</p>
          <Link className="button button--primary" to="/cashier/invoices">Mở tra cứu</Link>
        </article>
        <article className="action-card action-card--wide">
          <p className="eyebrow">MH-09 · F17</p>
          <h2>Đổi / trả hàng</h2>
          <p>Tạo yêu cầu trả hàng từ hóa đơn gốc và số lượng còn đủ điều kiện.</p>
          <Link className="button button--primary" to="/cashier/returns">Mở đổi trả</Link>
        </article>
      </div>
    </section>
  );
}

export default CashierDashboardPage;
