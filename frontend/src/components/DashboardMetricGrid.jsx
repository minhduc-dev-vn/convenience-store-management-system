import { Link } from 'react-router-dom';

function DashboardMetricGrid({ items }) {
  return (
    <div className="role-metric-grid">
      {items.map((item) => (
        <article className={`role-metric${item.tone ? ` role-metric--${item.tone}` : ''}`} key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <small>{item.note}</small>
          {item.to && <Link to={item.to}>{item.linkLabel || 'Xem chi tiết'}</Link>}
        </article>
      ))}
    </div>
  );
}

export default DashboardMetricGrid;
