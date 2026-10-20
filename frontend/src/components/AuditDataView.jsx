import { formatAuditValue } from '../pages/manager/auditPresentation';

function AuditDataView({ label, value }) {
  return (
    <section className="audit-data-card">
      <h3>{label}</h3>
      <pre>{formatAuditValue(value)}</pre>
    </section>
  );
}

export default AuditDataView;
