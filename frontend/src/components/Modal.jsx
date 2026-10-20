import { useEffect, useRef } from 'react';

function Modal({ children, title, description, onClose, size = 'medium' }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        aria-describedby={description ? 'modal-description' : undefined}
        aria-labelledby="modal-title"
        aria-modal="true"
        className={`modal modal--${size}`}
        role="dialog"
      >
        <header className="modal__header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description && <p id="modal-description">{description}</p>}
          </div>
          <button ref={closeButtonRef} className="modal__close" type="button" onClick={onClose} aria-label="Đóng hộp thoại">×</button>
        </header>
        <div className="modal__body">{children}</div>
      </section>
    </div>
  );
}

export default Modal;
