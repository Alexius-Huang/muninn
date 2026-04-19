// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- hoisted mocks ---
const {
  mockGetAuth,
  mockSetAuth,
  mockDeleteAuth,
  mockDeleteLegacyToken,
  mockOnOpenUrl,
  mockOpenUrl,
  mockGenerateCodeVerifier,
  mockComputeCodeChallenge,
  mockBuildAuthorizeUrl,
  mockExchangeCodeForTokens,
  mockRefreshAccessToken,
  mockRevokeAccessToken,
} = vi.hoisted(() => ({
  mockGetAuth: vi.fn(),
  mockSetAuth: vi.fn(),
  mockDeleteAuth: vi.fn(),
  mockDeleteLegacyToken: vi.fn(),
  mockOnOpenUrl: vi.fn(),
  mockOpenUrl: vi.fn(),
  mockGenerateCodeVerifier: vi.fn(),
  mockComputeCodeChallenge: vi.fn(),
  mockBuildAuthorizeUrl: vi.fn(),
  mockExchangeCodeForTokens: vi.fn(),
  mockRefreshAccessToken: vi.fn(),
  mockRevokeAccessToken: vi.fn(),
}));

vi.mock('./keychain', () => ({
  getAuth: (...a: unknown[]) => mockGetAuth(...a),
  setAuth: (...a: unknown[]) => mockSetAuth(...a),
  deleteAuth: (...a: unknown[]) => mockDeleteAuth(...a),
  deleteLegacyToken: (...a: unknown[]) => mockDeleteLegacyToken(...a),
}));

vi.mock('@tauri-apps/plugin-deep-link', () => ({
  onOpenUrl: (...a: unknown[]) => mockOnOpenUrl(...a),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: (...a: unknown[]) => mockOpenUrl(...a),
}));

vi.mock('./oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./oauth')>();
  return {
    ...actual,
    generateCodeVerifier: (...a: unknown[]) => mockGenerateCodeVerifier(...a),
    computeCodeChallenge: (...a: unknown[]) => mockComputeCodeChallenge(...a),
    buildAuthorizeUrl: (...a: unknown[]) => mockBuildAuthorizeUrl(...a),
    exchangeCodeForTokens: (...a: unknown[]) => mockExchangeCodeForTokens(...a),
    refreshAccessToken: (...a: unknown[]) => mockRefreshAccessToken(...a),
    revokeAccessToken: (...a: unknown[]) => mockRevokeAccessToken(...a),
  };
});

// import after mocks
import {
  init,
  isAuthenticated,
  getAccessToken,
  authFetch,
  connect,
  disconnect,
  onDisconnect,
  DropboxRefreshError,
} from './dropboxAuth';

const VALID_TOKENS = {
  access_token: 'at',
  refresh_token: 'rt',
  expires_at: Date.now() + 2 * 60 * 60 * 1000, // 2h from now
};

const NEAR_EXPIRY_TOKENS = {
  access_token: 'at_near',
  refresh_token: 'rt',
  expires_at: Date.now() + 30 * 1000, // 30s from now — within 60s threshold
};

beforeEach(async () => {
  vi.clearAllMocks();
  mockGetAuth.mockResolvedValue(null);
  mockSetAuth.mockResolvedValue(undefined);
  mockDeleteAuth.mockResolvedValue(undefined);
  mockDeleteLegacyToken.mockResolvedValue(undefined);
  mockOpenUrl.mockResolvedValue(undefined);
  mockOnOpenUrl.mockResolvedValue(() => {});
  await init(); // reset singleton state
});

describe('init', () => {
  it('should load tokens from Keychain and purge legacy entry', async () => {
    mockGetAuth.mockResolvedValue(VALID_TOKENS);
    await init();
    expect(mockDeleteLegacyToken).toHaveBeenCalled();
    expect(isAuthenticated()).toBe(true);
  });

  it('should mark as unauthenticated when Keychain has no tokens', async () => {
    mockGetAuth.mockResolvedValue(null);
    await init();
    expect(isAuthenticated()).toBe(false);
  });
});

describe('getAccessToken', () => {
  it('should return the access token when valid', async () => {
    mockGetAuth.mockResolvedValue(VALID_TOKENS);
    await init();
    const token = await getAccessToken();
    expect(token).toBe('at');
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });

  it('should proactively refresh when expiry is within 60s', async () => {
    mockGetAuth.mockResolvedValue(NEAR_EXPIRY_TOKENS);
    await init();
    const refreshed = { ...VALID_TOKENS, access_token: 'new_at' };
    mockRefreshAccessToken.mockResolvedValue(refreshed);

    const token = await getAccessToken();
    expect(mockRefreshAccessToken).toHaveBeenCalled();
    expect(token).toBe('new_at');
  });

  it('should throw DropboxRefreshError when not authenticated', async () => {
    await expect(getAccessToken()).rejects.toThrow(DropboxRefreshError);
  });
});

describe('authFetch', () => {
  it('should inject Authorization header', async () => {
    mockGetAuth.mockResolvedValue(VALID_TOKENS);
    await init();
    const mockResp = { ok: true, status: 200 } as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResp));

    await authFetch('https://api.dropboxapi.com/2/users/get_current_account');

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const headers = calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer at');
    vi.unstubAllGlobals();
  });

  it('should refresh on 401 and retry the original request', async () => {
    mockGetAuth.mockResolvedValue(VALID_TOKENS);
    await init();
    const refreshed = { ...VALID_TOKENS, access_token: 'refreshed_at' };
    mockRefreshAccessToken.mockResolvedValue(refreshed);

    const resp401 = { ok: false, status: 401 } as Response;
    const resp200 = { ok: true, status: 200 } as Response;
    const mockFetch = vi.fn().mockResolvedValueOnce(resp401).mockResolvedValueOnce(resp200);
    vi.stubGlobal('fetch', mockFetch);

    const result = await authFetch('https://api.dropboxapi.com/2/files/list_folder');
    expect(result.status).toBe(200);
    expect(mockRefreshAccessToken).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('should emit disconnect and clear Keychain when refresh itself fails', async () => {
    mockGetAuth.mockResolvedValue(NEAR_EXPIRY_TOKENS);
    await init();
    mockRefreshAccessToken.mockRejectedValue(new Error('invalid_grant'));

    const disconnectCb = vi.fn();
    const unsub = onDisconnect(disconnectCb);

    await expect(getAccessToken()).rejects.toThrow(DropboxRefreshError);
    expect(mockDeleteAuth).toHaveBeenCalled();
    expect(disconnectCb).toHaveBeenCalled();
    expect(isAuthenticated()).toBe(false);
    unsub();
  });
});

describe('connect', () => {
  it('should run the full connect() flow against mocked deep-link + opener + token endpoint', async () => {
    mockGenerateCodeVerifier.mockResolvedValue('verifier123');
    mockComputeCodeChallenge.mockResolvedValue('challenge456');
    mockBuildAuthorizeUrl.mockReturnValue('https://www.dropbox.com/oauth2/authorize?...');

    // Simulate deep-link callback arriving after connect() opens the browser
    let capturedHandler: ((urls: string[]) => void) | null = null;
    mockOnOpenUrl.mockImplementation(async (handler: (urls: string[]) => void) => {
      capturedHandler = handler;
      return () => {};
    });
    mockOpenUrl.mockImplementation(async () => {
      // Simulate the browser redirect coming back immediately
      const pending = JSON.parse(sessionStorage.getItem('muninn.oauth.pending') ?? 'null');
      if (capturedHandler && pending) {
        await capturedHandler([`muninn://oauth/callback?code=auth_code&state=${pending.state}`]);
      }
    });

    mockExchangeCodeForTokens.mockResolvedValue(VALID_TOKENS);

    await connect();

    expect(mockExchangeCodeForTokens).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'auth_code', codeVerifier: 'verifier123' })
    );
    expect(mockSetAuth).toHaveBeenCalledWith(VALID_TOKENS);
    expect(isAuthenticated()).toBe(true);
  });

  it('should reject connect() if state param does not match', async () => {
    mockGenerateCodeVerifier.mockResolvedValue('verifier123');
    mockComputeCodeChallenge.mockResolvedValue('challenge456');
    mockBuildAuthorizeUrl.mockReturnValue('https://www.dropbox.com/oauth2/authorize?...');

    let capturedHandler: ((urls: string[]) => void) | null = null;
    mockOnOpenUrl.mockImplementation(async (handler: (urls: string[]) => void) => {
      capturedHandler = handler;
      return () => {};
    });
    mockOpenUrl.mockImplementation(async () => {
      if (capturedHandler) {
        await capturedHandler(['muninn://oauth/callback?code=auth_code&state=WRONG_STATE']);
      }
    });

    await expect(connect()).rejects.toThrow(/State mismatch/);
  });

  it('should reject connect() when Dropbox returns an error param', async () => {
    mockGenerateCodeVerifier.mockResolvedValue('verifier123');
    mockComputeCodeChallenge.mockResolvedValue('challenge456');
    mockBuildAuthorizeUrl.mockReturnValue('https://www.dropbox.com/oauth2/authorize?...');

    let capturedHandler: ((urls: string[]) => void) | null = null;
    mockOnOpenUrl.mockImplementation(async (handler: (urls: string[]) => void) => {
      capturedHandler = handler;
      return () => {};
    });
    mockOpenUrl.mockImplementation(async () => {
      const pending = JSON.parse(sessionStorage.getItem('muninn.oauth.pending') ?? 'null');
      if (capturedHandler && pending) {
        await capturedHandler([`muninn://oauth/callback?error=access_denied&state=${pending.state}`]);
      }
    });

    await expect(connect()).rejects.toThrow(/Dropbox declined/);
  });
});

describe('disconnect', () => {
  it('should revoke the token and clear Keychain', async () => {
    mockGetAuth.mockResolvedValue(VALID_TOKENS);
    await init();
    mockRevokeAccessToken.mockResolvedValue(undefined);

    await disconnect();

    expect(mockRevokeAccessToken).toHaveBeenCalledWith('at');
    expect(mockDeleteAuth).toHaveBeenCalled();
    expect(isAuthenticated()).toBe(false);
  });
});

describe('onDisconnect', () => {
  it('should return an unsubscribe function', async () => {
    mockGetAuth.mockResolvedValue(NEAR_EXPIRY_TOKENS);
    await init();
    mockRefreshAccessToken.mockRejectedValue(new Error('invalid_grant'));

    const cb = vi.fn();
    const unsub = onDisconnect(cb);
    unsub(); // unsubscribe before trigger

    await expect(getAccessToken()).rejects.toThrow(DropboxRefreshError);
    expect(cb).not.toHaveBeenCalled();
  });
});
