// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));

import { getAuth, setAuth, deleteAuth, deleteLegacyToken } from './keychain';
import type { AuthTokens } from './oauth';

const TOKENS: AuthTokens = {
  access_token: 'at',
  refresh_token: 'rt',
  expires_at: 9999999999999,
};

beforeEach(() => {
  mockInvoke.mockReset();
});

describe('getAuth', () => {
  it('should call get_dropbox_auth and return null when no entry', async () => {
    mockInvoke.mockResolvedValue(null);
    const result = await getAuth();
    expect(mockInvoke).toHaveBeenCalledWith('get_dropbox_auth');
    expect(result).toBeNull();
  });

  it('should parse and return stored AuthTokens', async () => {
    mockInvoke.mockResolvedValue(JSON.stringify(TOKENS));
    const result = await getAuth();
    expect(result).toEqual(TOKENS);
  });

  it('should return null when stored value is invalid JSON', async () => {
    mockInvoke.mockResolvedValue('not-json');
    const result = await getAuth();
    expect(result).toBeNull();
  });
});

describe('setAuth', () => {
  it('should call set_dropbox_auth with JSON-stringified tokens', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await setAuth(TOKENS);
    expect(mockInvoke).toHaveBeenCalledWith('set_dropbox_auth', {
      json: JSON.stringify(TOKENS),
    });
  });
});

describe('deleteAuth', () => {
  it('should call delete_dropbox_auth', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await deleteAuth();
    expect(mockInvoke).toHaveBeenCalledWith('delete_dropbox_auth');
  });
});

describe('deleteLegacyToken', () => {
  it('should call delete_legacy_dropbox_token', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await deleteLegacyToken();
    expect(mockInvoke).toHaveBeenCalledWith('delete_legacy_dropbox_token');
  });
});
