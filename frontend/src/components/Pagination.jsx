function Pagination({ page, totalPages, onPageChange, disabled = false }) {
  const safeTotalPages = Math.max(totalPages, 1);

  return (
    <nav className="pagination" aria-label="Phân trang">
      <button
        className="button button--ghost"
        type="button"
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Trang trước
      </button>
      <span>Trang {page} / {safeTotalPages}</span>
      <button
        className="button button--ghost"
        type="button"
        disabled={disabled || totalPages === 0 || page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Trang sau
      </button>
    </nav>
  );
}

export default Pagination;
