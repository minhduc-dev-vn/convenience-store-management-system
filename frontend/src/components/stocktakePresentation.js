const WORKFLOW_PRESENTATION = Object.freeze({
  DRAFT: { label: 'Đang kiểm kê', tone: 'draft' },
  PENDING_APPROVAL: { label: 'Chờ phê duyệt', tone: 'pending' },
  RECOUNT_REQUIRED: { label: 'Cần kiểm lại', tone: 'warning' },
  APPROVED: { label: 'Đã phê duyệt', tone: 'active' },
  CANCELLED: { label: 'Đã hủy', tone: 'cancelled' },
});

const SCHEMA_PRESENTATION = Object.freeze({
  DRAFT: { label: 'DRAFT', tone: 'draft' },
  APPROVED: { label: 'APPROVED', tone: 'active' },
  CANCELLED: { label: 'CANCELLED', tone: 'cancelled' },
});

export function getWorkflowPresentation(state) {
  return WORKFLOW_PRESENTATION[state] ?? { label: state || 'Chưa xác định', tone: 'neutral' };
}

export function getSchemaStatusPresentation(status) {
  return SCHEMA_PRESENTATION[status] ?? { label: status || 'Chưa xác định', tone: 'neutral' };
}

export function isStocktakeEditable(stocktake) {
  return stocktake?.schemaStatus === 'DRAFT'
    && !['PENDING_APPROVAL', 'APPROVED', 'CANCELLED'].includes(stocktake?.workflow?.state);
}

export function canProposeStocktake(stocktake) {
  return isStocktakeEditable(stocktake) && Number(stocktake?.discrepancyCount ?? 0) > 0;
}

export function canDecideStocktake(stocktake) {
  return stocktake?.schemaStatus === 'DRAFT'
    && stocktake?.workflow?.state === 'PENDING_APPROVAL';
}

export function buildCountPayload(form) {
  return {
    actualQuantity: Number(form.actualQuantity),
    reason: form.reason.trim() || null,
  };
}

export function validateCountForm(form) {
  const errors = {};
  const value = String(form.actualQuantity ?? '').trim();
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    errors.actualQuantity = 'Số lượng thực tế phải là số nguyên không âm.';
  }
  if ((form.reason ?? '').trim().length > 255) {
    errors.reason = 'Lý do không được vượt quá 255 ký tự.';
  }
  return errors;
}
