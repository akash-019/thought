/**
 * File: src/api/client.test.ts
 *
 * Tests: the API client sends the access token, refreshes it once when it has expired and
 * retries, shares one refresh between parallel requests, and logs out when refreshing fails.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, LOGGED_OUT_EVENT, tokens } from './client';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const expired = () => json(401, { error: { code: 'TOKEN_EXPIRED', message: 'Your session expired.' } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  tokens.save({ accessToken: 'old-access', refreshToken: 'old-refresh' });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const authHeaderOf = (call: unknown[]) => (call[1] as RequestInit).headers as Record<string, string>;

describe('api()', () => {
  it('sends the access token as a Bearer header', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await api('/me');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/me');
    expect(authHeaderOf(fetchMock.mock.calls[0]!).Authorization).toBe('Bearer old-access');
  });

  it('on TOKEN_EXPIRED: refreshes once, saves the new tokens, and retries the request', async () => {
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(json(200, { accessToken: 'new-access', refreshToken: 'new-refresh' }))
      .mockResolvedValueOnce(json(200, { sessions: [] }));
    expect(await api('/sessions')).toEqual({ sessions: [] });
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/auth/refresh');
    expect(authHeaderOf(fetchMock.mock.calls[2]!).Authorization).toBe('Bearer new-access');
    expect(tokens.refresh()).toBe('new-refresh');
  });

  it('parallel requests with an expired token share a single refresh (a refresh token works once)', async () => {
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === '/api/auth/refresh') return json(200, { accessToken: 'new-access', refreshToken: 'new-refresh' });
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === 'Bearer new-access' ? json(200, { ok: true }) : expired();
    });
    await Promise.all([api('/a'), api('/b'), api('/c')]);
    expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/auth/refresh')).toHaveLength(1);
  });

  it('if refreshing fails: clears the tokens and tells the app to log out', async () => {
    const loggedOut = vi.fn();
    window.addEventListener(LOGGED_OUT_EVENT, loggedOut);
    fetchMock.mockResolvedValueOnce(expired()).mockResolvedValueOnce(json(401, { error: { code: 'INVALID_REFRESH_TOKEN' } }));
    await expect(api('/sessions')).rejects.toBeInstanceOf(ApiError);
    expect(tokens.access()).toBeNull();
    expect(loggedOut).toHaveBeenCalled();
    window.removeEventListener(LOGGED_OUT_EVENT, loggedOut);
  });

  it('turns error responses into an ApiError with the backend’s code and message', async () => {
    fetchMock.mockResolvedValue(json(409, { error: { code: 'SLOT_TAKEN', message: 'Sorry, this time was just booked.' } }));
    await expect(api('/sessions', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 409,
      code: 'SLOT_TAKEN',
      message: 'Sorry, this time was just booked.',
    });
  });
});
