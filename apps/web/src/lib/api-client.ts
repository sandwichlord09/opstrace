export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

const TOKEN_STORAGE_KEY = 'opstrace_access_token';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

interface RequestOptions extends RequestInit {
  skipAuthRedirect?: boolean;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { skipAuthRedirect = false, headers: customHeaders, ...rest } = options;

  const token = getAuthToken();
  const headers = new Headers(customHeaders);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (rest.body && !(rest.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const url = path.startsWith('http')
    ? path
    : `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...rest,
    headers,
  });

  if (response.status === 401 && !skipAuthRedirect) {
    clearAuthToken();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Session expired. Please sign in again.');
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const rawMessage = payload?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : `Request failed with status ${response.status}`;

    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
