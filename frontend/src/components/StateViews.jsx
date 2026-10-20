function StatePanel({ tone = 'neutral', label, title, children, action }) {
  return (
    <section className={`state-panel state-panel--${tone}`} aria-live="polite">
      <span className="state-indicator" aria-hidden="true" />
      <div>
        <p className="state-label">{label}</p>
        <h2>{title}</h2>
        {children && <p>{children}</p>}
        {action}
      </div>
    </section>
  );
}

export function LoadingState({ message = 'Đang tải dữ liệu…' }) {
  return (
    <StatePanel label="Đang xử lý" title={message} tone="loading">
      Vui lòng chờ trong giây lát.
    </StatePanel>
  );
}

export function ErrorState({ message = 'Không thể tải dữ liệu.', onRetry }) {
  const action = onRetry ? (
    <button className="button button--secondary" type="button" onClick={onRetry}>
      Thử lại
    </button>
  ) : null;

  return (
    <StatePanel label="Đã xảy ra lỗi" title={message} tone="error" action={action}>
      Hãy kiểm tra kết nối và thử lại.
    </StatePanel>
  );
}

export function EmptyState({
  title = 'Chưa có dữ liệu',
  message = 'Nội dung sẽ xuất hiện tại đây khi có dữ liệu phù hợp.',
}) {
  return (
    <StatePanel label="Trạng thái trống" title={title} tone="empty">
      {message}
    </StatePanel>
  );
}
