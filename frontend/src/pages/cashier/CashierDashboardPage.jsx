import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorState, FormField, LoadingState, Notice, PageHeader } from '../../components';
import { getErrorMessage } from '../../api/errors';
import { getCurrentPosShift, openPosShift } from '../../services/pos.service';

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

function CashierDashboardPage() {
  const navigate = useNavigate();
  const [shift, setShift] = useState(null);
  const [openingCash, setOpeningCash] = useState('0');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadShift() {
    setStatus('loading');
    setError('');
    try {
      const data = await getCurrentPosShift();
      setShift(data.shift);
      setStatus('ready');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setStatus('error');
    }
  }

  useEffect(() => {
    loadShift();
  }, []);

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
      navigate('/cashier/pos', { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (status === 'loading') return <LoadingState message="Đang kiểm tra ca làm việc hiện tại" />;
  if (status === 'error') return <ErrorState message={error} onRetry={loadShift} />;

  return (
    <section className="workspace-page cashier-shift-page">
      <PageHeader
        eyebrow="MH-05 · F09"
        title={shift ? 'Ca làm việc đang mở' : 'Mở ca làm việc'}
        description="Trạng thái ca được tải trực tiếp từ backend trước khi thu ngân truy cập quầy bán hàng."
      />

      {shift ? (
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
    </section>
  );
}

export default CashierDashboardPage;
