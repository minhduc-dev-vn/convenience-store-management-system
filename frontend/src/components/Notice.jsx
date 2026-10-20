function Notice({ children, tone = 'info' }) {
  if (!children) return null;

  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export default Notice;
