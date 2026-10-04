function ReportKpiGrid({ items }) {
  return (
    <div className="report-kpi-grid">
      {items.map((item) => (
        <article className={`report-kpi${item.tone ? ` report-kpi--${item.tone}` : ''}`} key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.note && <small>{item.note}</small>}
        </article>
      ))}
    </div>
  );
}

export default ReportKpiGrid;
