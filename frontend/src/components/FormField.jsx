function FormField({ children, error, hint, htmlFor, label, required = false }) {
  return (
    <div className={`form-field${error ? ' form-field--error' : ''}`}>
      <label htmlFor={htmlFor}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && !error && <small>{hint}</small>}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

export default FormField;
