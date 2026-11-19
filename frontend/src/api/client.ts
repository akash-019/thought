/**
 * File: src/api/client.ts
 *
 * One function, `api()`, for every call to the backend.
 * - Sends the access token as `Authorization: Bearer <token>`.
 * - If the access token has expired (401 TOKEN_EXPIRED), it gets a new pair with the refresh
 *   token once, then retries the request. If that fails, the user is logged out.
 * - Turns error responses into an ApiError with the backend's code and readable message.
 *
 * Tokens are kept in localStorage so a page reload keeps you logged in (trade-off noted in DECISIONS.md).
 */
import type { AuthResponse } from './types';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const tokens = {
  access: () => localStorage.getItem(ACCESS_KEY),
  refresh: () => localStorage.getItem(REFRESH_KEY),
  save(auth: Pick<AuthResponse, 'accessToken' | 'refreshToken'>) {
    localStorage.setItem(ACCESS_KEY, auth.accessToken);
    localStorage.setItem(REFRESH_KEY, auth.refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/** Fired when the session cannot be renewed; AuthContext listens and shows the login page. */
export const LOGGED_OUT_EVENT = 'auth:logged-out';

// If several requests find the token expired at the same time, they share one refresh call
// (a refresh token only works once).
let refreshing: Promise<boolean> | null = null;

/** Asks the backend for a new token pair. True if it worked. */
async function requestNewTokens(): Promise<boolean> {
  const refreshToken = tokens.refresh();
  if (!refreshToken) return false;
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  tokens.save(await res.json());
  return true;
}

/** Like requestNewTokens, but parallel callers share the one request that is already running. */
function refreshTokens(): Promise<boolean> {
  if (!refreshing) {
    refreshing = requestNewTokens().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  // Reads the access token each time, so a retry after refreshing uses the new one.
  const send = () => {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const accessToken = tokens.access();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  };

  let res = await send();
  if (res.status === 401 && tokens.refresh()) {
    const body = await res.clone().json().catch(() => null);
    if (body?.error?.code === 'TOKEN_EXPIRED') {
      if (await refreshTokens()) {
        res = await send();
      } else {
        tokens.clear();
        window.dispatchEvent(new Event(LOGGED_OUT_EVENT));
      }
    }
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? 'Something went wrong. Please try again.');
  }
  return data as T;
}

/** A message to show for any error caught in a page. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}
