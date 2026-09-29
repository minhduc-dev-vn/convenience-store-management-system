const PRODUCT_FILTERS = new Set(['page', 'pageSize', 'search']);

function requireValue(value, fieldName) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${fieldName} is required`);
  return normalized;
}

export function buildPosProductSearchPath(filters = {}) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (!PRODUCT_FILTERS.has(key) || value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  const suffix = query.toString();
  return `/pos/products${suffix ? `?${suffix}` : ''}`;
}

export function buildPosBarcodePath(barcode) {
  return `/pos/products/barcode/${encodeURIComponent(requireValue(barcode, 'barcode'))}`;
}

