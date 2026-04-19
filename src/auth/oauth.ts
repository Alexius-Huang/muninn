export const AUTH_BASE = 'https://www.dropbox.com/oauth2/authorize';
export const TOKEN_URL = 'https://api.dropbox.com/oauth2/token';
export const REVOKE_URL = 'https://api.dropboxapi.com/2/auth/token/revoke';
export const REDIRECT_URI = 'http://localhost:19876';

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix epoch ms
};

function base64url(buf: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function generateCodeVerifier(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export async function computeCodeChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return base64url(new Uint8Array(digest));
}

export function buildAuthorizeUrl(params: {
  appKey: string;
  codeChallenge: string;
  state: string;
}): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: params.appKey,
    redirect_uri: REDIRECT_URI,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
    state: params.state,
    token_access_type: 'offline',
  });
  return `${AUTH_BASE}?${p.toString()}`;
}

export async function exchangeCodeForTokens(params: {
  appKey: string;
  code: string;
  codeVerifier: string;
}): Promise<AuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: REDIRECT_URI,
    client_id: params.appKey,
    code_verifier: params.codeVerifier,
  });

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`Token exchange failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshAccessToken(params: {
  appKey: string;
  refreshToken: string;
}): Promise<AuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    client_id: params.appKey,
  });

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`Token refresh failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    access_token: data.access_token,
    // Dropbox may not return a new refresh_token on refresh — keep the existing one
    refresh_token: data.refresh_token ?? params.refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

export async function revokeAccessToken(accessToken: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: 'null',
  });
  // Ignore errors — best-effort revocation
}
