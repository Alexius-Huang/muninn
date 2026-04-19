// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateToken, DropboxAuthError, DropboxNetworkError } from './client';

const FAKE_ACCOUNT = {
  account_id: 'dbid:abc123',
  name: { display_name: 'Test User' },
  email: 'test@example.com',
};

function makeResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('validateToken', () => {
  it('should return account info on a 2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, FAKE_ACCOUNT)));
    const result = await validateToken('sl.valid-token');
    expect(result).toEqual(FAKE_ACCOUNT);
  });

  it('should send Authorization header and POST to get_current_account', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, FAKE_ACCOUNT));
    vi.stubGlobal('fetch', fetchMock);
    await validateToken('sl.valid-token');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.dropboxapi.com/2/users/get_current_account');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sl.valid-token');
  });

  it('should throw DropboxAuthError on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(401, 'Unauthorized')));
    await expect(validateToken('sl.bad-token')).rejects.toThrow(DropboxAuthError);
  });

  it('should throw DropboxAuthError on non-2xx non-401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(500, 'Server error')));
    await expect(validateToken('sl.token')).rejects.toThrow(DropboxAuthError);
  });

  it('should throw DropboxNetworkError when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));
    await expect(validateToken('sl.token')).rejects.toThrow(DropboxNetworkError);
  });
});
