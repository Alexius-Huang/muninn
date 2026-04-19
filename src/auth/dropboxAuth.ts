import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { openUrl } from '@tauri-apps/plugin-opener';
import { getAuth, setAuth, deleteAuth, deleteLegacyToken } from './keychain';
import {
  generateCodeVerifier,
  computeCodeChallenge,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  revokeAccessToken,
} from './oauth';
import type { AuthTokens } from './oauth';

export class DropboxRefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DropboxRefreshError';
  }
}

const APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY as string;
const OAUTH_PENDING_KEY = 'muninn.oauth.pending';
const REFRESH_THRESHOLD_MS = 60 * 1000; // refresh if expiry within 60s
const CONNECT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

let _tokens: AuthTokens | null = null;
let _refreshing: Promise<string> | null = null;
const _disconnectListeners = new Set<() => void>();

export async function init(): Promise<void> {
  await deleteLegacyToken();
  const stored = await getAuth();
  _tokens = stored;
}

export function isAuthenticated(): boolean {
  return _tokens !== null;
}

export async function getAccessToken(): Promise<string> {
  if (!_tokens) throw new DropboxRefreshError('Not authenticated');

  if (_tokens.expires_at - Date.now() < REFRESH_THRESHOLD_MS) {
    return _doRefresh();
  }
  return _tokens.access_token;
}

function _doRefresh(): Promise<string> {
  if (_refreshing) return _refreshing;

  _refreshing = (async () => {
    if (!_tokens) throw new DropboxRefreshError('Not authenticated');
    try {
      const refreshed = await refreshAccessToken({
        appKey: APP_KEY,
        refreshToken: _tokens.refresh_token,
      });
      _tokens = refreshed;
      await setAuth(refreshed);
      if (import.meta.env.DEV) {
        console.log('[dropboxAuth] refreshed access token');
      }
      return refreshed.access_token;
    } catch (err) {
      _tokens = null;
      await deleteAuth();
      _disconnectListeners.forEach((cb) => cb());
      throw new DropboxRefreshError(
        `Session expired — please reconnect. (${(err as Error).message})`
      );
    } finally {
      _refreshing = null;
    }
  })();

  return _refreshing;
}

export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const resp = await fetch(url, { ...init, headers });

  if (resp.status === 401) {
    // Reactive refresh: token was rejected — refresh once and retry
    let newToken: string;
    try {
      newToken = await _doRefresh();
    } catch {
      return resp; // let the caller see the 401 if refresh itself fails
    }
    const retryHeaders = new Headers(init?.headers);
    retryHeaders.set('Authorization', `Bearer ${newToken}`);
    return fetch(url, { ...init, headers: retryHeaders });
  }

  return resp;
}

export async function connect(): Promise<void> {
  if (!APP_KEY) {
    throw new Error('VITE_DROPBOX_APP_KEY is not configured. Set it in .env.local.');
  }

  const verifier = await generateCodeVerifier();
  const challenge = await computeCodeChallenge(verifier);
  const state = crypto.randomUUID();

  sessionStorage.setItem(OAUTH_PENDING_KEY, JSON.stringify({ verifier, state }));

  const authUrl = buildAuthorizeUrl({ appKey: APP_KEY, codeChallenge: challenge, state });

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let unlisten: (() => void) | null = null;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      sessionStorage.removeItem(OAUTH_PENDING_KEY);
      if (unlisten) unlisten();
      reject(new Error('Authorization timed out — please try again.'));
    }, CONNECT_TIMEOUT_MS);

    const handleUrls = async (urls: string[]) => {
      if (settled) return;
      const callbackUrl = urls.find((u) => u.startsWith('muninn://oauth/callback'));
      if (!callbackUrl) return;

      settled = true;
      clearTimeout(timeout);
      if (unlisten) unlisten();

      try {
        const parsed = new URL(callbackUrl);
        const code = parsed.searchParams.get('code');
        const returnedState = parsed.searchParams.get('state');
        const error = parsed.searchParams.get('error');

        const pending = JSON.parse(sessionStorage.getItem(OAUTH_PENDING_KEY) ?? 'null') as {
          verifier: string;
          state: string;
        } | null;
        sessionStorage.removeItem(OAUTH_PENDING_KEY);

        if (error) {
          throw new Error(`Dropbox declined: ${error}`);
        }
        if (!code) {
          throw new Error('No authorization code in callback');
        }
        if (!pending || returnedState !== pending.state) {
          throw new Error('State mismatch — possible CSRF attack');
        }

        const tokens = await exchangeCodeForTokens({
          appKey: APP_KEY,
          code,
          codeVerifier: pending.verifier,
        });
        _tokens = tokens;
        await setAuth(tokens);
        resolve();
      } catch (err) {
        reject(err);
      }
    };

    // Register deep-link listener before opening browser
    onOpenUrl(handleUrls).then((unlistenFn) => {
      unlisten = unlistenFn;
      openUrl(authUrl).catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (unlisten) unlisten();
        sessionStorage.removeItem(OAUTH_PENDING_KEY);
        reject(err);
      });
    });
  });
}

export async function disconnect(): Promise<void> {
  if (_tokens) {
    await revokeAccessToken(_tokens.access_token);
  }
  _tokens = null;
  await deleteAuth();
}

export function onDisconnect(cb: () => void): () => void {
  _disconnectListeners.add(cb);
  return () => _disconnectListeners.delete(cb);
}

// Dev-only helpers exposed on window in development
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__dropboxAuth = {
    forceExpire: () => {
      if (_tokens) _tokens = { ..._tokens, expires_at: 0 };
    },
    corruptAccessToken: async () => {
      if (_tokens) {
        _tokens = { ..._tokens, access_token: 'corrupted_token_for_testing' };
        await setAuth(_tokens);
      }
    },
  };
}
