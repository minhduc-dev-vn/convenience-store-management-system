import { useState } from 'react';
import { getDefaultReportPeriod, validateReportPeriod } from './reportingPresentation';

export default function useReportPeriod() {
  const initial = getDefaultReportPeriod();
  const [draftPeriod, setDraftPeriod] = useState(initial);
  const [period, setPeriod] = useState(initial);
  const [periodError, setPeriodError] = useState('');

  const applyPeriod = (event) => {
    event.preventDefault();
    const error = validateReportPeriod(draftPeriod);
    setPeriodError(error);
    if (error) return false;
    setPeriod({ ...draftPeriod });
    return true;
  };

  return {
    applyPeriod,
    draftPeriod,
    period,
    periodError,
    setDraftPeriod,
  };
}
