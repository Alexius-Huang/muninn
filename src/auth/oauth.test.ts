// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateCodeVerifier,
  computeCodeChallenge,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  REDIRECT_URI,
  AUTH_BASE,
  TOKEN_URL,
} from './oauth';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('generateCodeVerifier', () => {
  it('should produce a 43-char base64url string', async () => {
    const verifier = await generateCodeVerifier();
    expect(typeof verifier).toBe('string');
    // 32 bytes → base64url without padding = ceil(32 * 4/3) = 43 chars
    expect(verifier.length).toBe(43);
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('should produce a different value each call', async () => {
    const a = await generateCodeVerifier();
    const b = await generateCodeVerifier();
    expect(a).not.toBe(b);
  });
});

describe('computeCodeChallenge', () => {
  it('should compute an S256 challenge matching a known vector', async () => {
    // RFC 7636 appendix B test vector
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await computeCodeChallenge(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('buildAuthorizeUrl', () => {
  it('should build an authorize URL with all required params', () => {
    const url = buildAuthorizeUrl({ appKey: 'mykey', codeChallenge: 'abc123', state: 'xyz' });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(AUTH_BASE);
    expect(parsed.searchParams.get('client_id')).toBe('mykey');
    expect(parsed.searchParams.get('code_challenge')).toBe('abc123');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('state')).toBe('xyz');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(parsed.searchParams.get('token_access_type')).toBe('offline');
  });
});

describe('exchangeCodeForTokens', () => {
  it('should exchange a code for tokens and compute expires_at', async () => {
    const now = 1000000000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'at', refresh_token: 'rt', expires_in: 14400 }),
    }));

    const tokens = await exchangeCodeForTokens({ appKey: 'k', code: 'c', codeVerifier: 'v' });
    expect(tokens.access_token).toBe('at');
    expect(tokens.refresh_token).toBe('rt');
    expect(tokens.expires_at).toBe(now + 14400 * 1000);

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe(TOKEN_URL);
    expect(call[1].method).toBe('POST');
  });

  it('should surface auth errors from /oauth2/token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'invalid_grant',
    }));

    await expect(
      exchangeCodeForTokens({ appKey: 'k', code: 'bad', codeVerifier: 'v' })
    ).rejects.toThrow('400');
  });
});

describe('refreshAccessToken', () => {
  it('should use the existing refresh_token if none is returned', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new_at', expires_in: 14400 }),
    }));

    const tokens = await refreshAccessToken({ appKey: 'k', refreshToken: 'old_rt' });
    expect(tokens.access_token).toBe('new_at');
    expect(tokens.refresh_token).toBe('old_rt');
  });

  it('should use a new refresh_token when Dropbox returns one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new_at', refresh_token: 'new_rt', expires_in: 14400 }),
    }));

    const tokens = await refreshAccessToken({ appKey: 'k', refreshToken: 'old_rt' });
    expect(tokens.refresh_token).toBe('new_rt');
  });
});
