import FormField from '../FormField';
import Notice from '../Notice';

function ReportDateFilter({ draftPeriod, error, isLoading, onChange, onSubmit }) {
  return (
    <>
      <form className="report-filter" onSubmit={onSubmit}>
        <FormField htmlFor="reportFrom" label="Báo cáo từ ngày" required>
          <input
            id="reportFrom"
            type="date"
            value={draftPeriod.from}
            onChange={(event) => onChange((current) => ({ ...current, from: event.target.value }))}
          />
        </FormField>
        <FormField htmlFor="reportTo" label="Báo cáo đến ngày" required>
          <input
            id="reportTo"
            type="date"
            value={draftPeriod.to}
            onChange={(event) => onChange((current) => ({ ...current, to: event.target.value }))}
          />
        </FormField>
        <button className="button button--primary" disabled={isLoading} type="submit">
          {isLoading ? 'Đang lập báo cáo…' : 'Lập báo cáo'}
        </button>
      </form>
      <Notice tone="error">{error}</Notice>
    </>
  );
}

export default ReportDateFilter;
