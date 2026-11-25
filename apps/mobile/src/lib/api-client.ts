import * as SecureStore from 'expo-secure-store';

declare const process: { env: Record<string, string | undefined> };

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

const TOKEN_KEY = 'opstrace_mobile_access_token';
let memoryTokenFallback: string | null = null;
let onUnauthorizedHandler: (() => void) | null = null;

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

export function setOnUnauthorized(handler: (() => void) | null): void {
  onUnauthorizedHandler = handler;
}

export async function getAuthToken(): Promise<string | null> {
  try {
    const val = await SecureStore.getItemAsync(TOKEN_KEY);
    return val ?? memoryTokenFallback;
  } catch {
    return memoryTokenFallback;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  memoryTokenFallback = token;
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    // Fallback to memory-only when SecureStore is unavailable (e.g. web preview)
  }
}

export async function clearAuthToken(): Promise<void> {
  memoryTokenFallback = null;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Ignore when SecureStore is unavailable
  }
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

interface RequestOptions extends RequestInit {
  skipAuthRedirect?: boolean;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { skipAuthRedirect = false, headers: customHeaders, ...rest } = options;
  const token = await getAuthToken();

  const headers = new Headers(customHeaders);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (rest.body && !headers.has('Content-Type')) {
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
    await clearAuthToken();
    onUnauthorizedHandler?.();
    throw new ApiError(401, 'Session expired. Please sign in again.');
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const rawMsg = payload?.message;
    const message = Array.isArray(rawMsg)
      ? rawMsg.join(', ')
      : typeof rawMsg === 'string'
        ? rawMsg
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
};
