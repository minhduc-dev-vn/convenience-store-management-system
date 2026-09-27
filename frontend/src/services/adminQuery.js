export function buildAdminQuery(filters = {}, allowedFields = []) {
  const query = new URLSearchParams();
  for (const field of allowedFields) {
    const value = filters[field];
    if (value !== undefined && value !== null && value !== '') {
      query.set(field, String(value));
    }
  }
  return query.size > 0 ? `?${query.toString()}` : '';
}

export function encodeAdminId(value, fieldName) {
  const normalized = typeof value === 'number' && Number.isSafeInteger(value)
    ? String(value)
    : value;
  if (typeof normalized !== 'string' || !normalized.trim()) {
    throw new TypeError(`${fieldName} must be a non-empty string or integer`);
  }
  return encodeURIComponent(normalized.trim());
}
