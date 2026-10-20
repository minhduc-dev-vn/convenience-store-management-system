import Modal from './Modal';
import Notice from './Notice';

function ConfirmDialog({ confirmLabel = 'Xác nhận', description, error, isSubmitting = false, onCancel, onConfirm, title, tone = 'danger' }) {
  return (
    <Modal title={title} description={description} onClose={onCancel} size="small">
      <Notice tone="error">{error}</Notice>
      <div className="modal__actions">
        <button className="button button--ghost" type="button" onClick={onCancel} disabled={isSubmitting}>Hủy</button>
        <button className={`button button--${tone}`} type="button" onClick={onConfirm} disabled={isSubmitting}>
          {isSubmitting ? 'Đang xử lý…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
