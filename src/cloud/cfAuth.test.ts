// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));

import { getCfAuth, setCfAuth, deleteCfAuth } from './cfAuth';
import type { CfAuth } from './cfAuth';

const AUTH: CfAuth = {
  accountId: 'acct-1',
  d1ApiToken: 'tok-1',
  d1DatabaseId: 'db-1',
  r2AccessKeyId: 'key-1',
  r2SecretAccessKey: 'secret-1',
  r2Bucket: 'bucket-1',
};

beforeEach(() => {
  mockInvoke.mockReset();
});

describe('getCfAuth', () => {
  it('returns null when invoke resolves null', async () => {
    mockInvoke.mockResolvedValue(null);
    expect(await getCfAuth()).toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith('read_cf_token');
  });

  it('parses and returns stored CfAuth', async () => {
    mockInvoke.mockResolvedValue(JSON.stringify(AUTH));
    expect(await getCfAuth()).toEqual(AUTH);
  });

  it('returns null when stored value is invalid JSON', async () => {
    mockInvoke.mockResolvedValue('not-json');
    expect(await getCfAuth()).toBeNull();
  });
});

describe('setCfAuth', () => {
  it('saves and verifies with a matching read-back', async () => {
    mockInvoke
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(JSON.stringify(AUTH));
    await expect(setCfAuth(AUTH)).resolves.toBeUndefined();
    expect(mockInvoke).toHaveBeenCalledWith('save_cf_token', { json: JSON.stringify(AUTH) });
    expect(mockInvoke).toHaveBeenCalledWith('read_cf_token');
  });

  it('throws "Keychain verification failed" when read-back returns a different blob', async () => {
    const different: CfAuth = { ...AUTH, accountId: 'tampered' };
    mockInvoke
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(JSON.stringify(different));
    await expect(setCfAuth(AUTH)).rejects.toThrow('Keychain verification failed');
  });

  it('throws "Keychain verification failed" when read-back returns null', async () => {
    mockInvoke
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(null);
    await expect(setCfAuth(AUTH)).rejects.toThrow('Keychain verification failed');
  });

  it('propagates error when save_cf_token rejects', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Keychain locked'));
    await expect(setCfAuth(AUTH)).rejects.toThrow('Keychain locked');
  });
});

describe('deleteCfAuth', () => {
  it('calls delete_cf_token', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await deleteCfAuth();
    expect(mockInvoke).toHaveBeenCalledWith('delete_cf_token');
  });
});
