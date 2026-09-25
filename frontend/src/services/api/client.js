const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';

export const apiConfig = Object.freeze({
  baseUrl: configuredBaseUrl.replace(/\/$/, ''),
});

export function buildApiUrl(path) {
  if (!apiConfig.baseUrl) {
    throw new Error('VITE_API_BASE_URL is not configured');
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiConfig.baseUrl}${normalizedPath}`;
}
