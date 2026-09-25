import { ApiError } from './errors';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';
const EMPTY_TOKEN_PROVIDER = () => null;

let accessTokenProvider = EMPTY_TOKEN_PROVIDER;

export const apiConfig = Object.freeze({
  baseUrl: configuredBaseUrl.replace(/\/$/, ''),
});

export function setAccessTokenProvider(provider) {
  if (provider !== null && typeof provider !== 'function') {
    throw new TypeError('Access token provider must be a function or null');
  }

  accessTokenProvider = provider ?? EMPTY_TOKEN_PROVIDER;
}

export function buildApiUrl(path) {
  if (!apiConfig.baseUrl) {
    throw new ApiError('Frontend chưa được cấu hình địa chỉ API.', {
      code: 'API_BASE_URL_MISSING',
    });
  }

  if (typeof path !== 'string' || !path.trim()) {
    throw new TypeError('API path must be a non-empty string');
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiConfig.baseUrl}${normalizedPath}`;
}

async function parseResponse(response) {
  if (response.status === 204) return null;

  const responseText = await response.text();
  if (!responseText) return null;

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return responseText;

  try {
    return JSON.parse(responseText);
  } catch (error) {
    throw new ApiError('Máy chủ trả về dữ liệu không hợp lệ.', {
      code: 'INVALID_API_RESPONSE',
      status: response.status,
      cause: error,
    });
  }
}

function mapResponseError(response, payload) {
  const apiError = payload?.error;

  return new ApiError(
    apiError?.message || `Yêu cầu thất bại với mã HTTP ${response.status}.`,
    {
      code: apiError?.code || `HTTP_${response.status}`,
      status: response.status,
      details: apiError?.details ?? null,
    },
  );
}

async function request(path, options = {}) {
  const {
    body,
    headers,
    includeAuthorization = true,
    ...fetchOptions
  } = options;
  const requestHeaders = new Headers(headers);

  requestHeaders.set('Accept', 'application/json');

  let requestBody = body;
  if (body !== undefined && body !== null && !(body instanceof FormData)) {
    requestHeaders.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(body);
  }

  if (includeAuthorization) {
    const accessToken = await accessTokenProvider();
    if (accessToken) requestHeaders.set('Authorization', `Bearer ${accessToken}`);
  }

  let response;
  try {
    response = await fetch(buildApiUrl(path), {
      ...fetchOptions,
      body: requestBody,
      headers: requestHeaders,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;

    throw new ApiError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối.', {
      code: 'NETWORK_ERROR',
      cause: error,
    });
  }

  const payload = await parseResponse(response);
  if (!response.ok) throw mapResponseError(response, payload);

  if (payload && Object.hasOwn(payload, 'success')) {
    if (payload.success !== true) throw mapResponseError(response, payload);
    return payload.data;
  }

  return payload;
}

export const apiClient = Object.freeze({
  request,
  get(path, options = {}) {
    return request(path, { ...options, method: 'GET' });
  },
  post(path, body, options = {}) {
    return request(path, { ...options, body, method: 'POST' });
  },
  put(path, body, options = {}) {
    return request(path, { ...options, body, method: 'PUT' });
  },
  patch(path, body, options = {}) {
    return request(path, { ...options, body, method: 'PATCH' });
  },
  delete(path, options = {}) {
    return request(path, { ...options, method: 'DELETE' });
  },
});
