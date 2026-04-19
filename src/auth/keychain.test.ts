// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));

import { getDropboxToken, setDropboxToken, deleteDropboxToken } from './keychain';

beforeEach(() => {
  mockInvoke.mockReset();
});

describe('getDropboxToken', () => {
  it('should call get_dropbox_token and return null when no entry', async () => {
    mockInvoke.mockResolvedValue(null);
    const result = await getDropboxToken();
    expect(mockInvoke).toHaveBeenCalledWith('get_dropbox_token');
    expect(result).toBeNull();
  });

  it('should call get_dropbox_token and return the stored string', async () => {
    mockInvoke.mockResolvedValue('sl.my-token');
    const result = await getDropboxToken();
    expect(mockInvoke).toHaveBeenCalledWith('get_dropbox_token');
    expect(result).toBe('sl.my-token');
  });
});

describe('setDropboxToken', () => {
  it('should call set_dropbox_token with { token }', async () => {
    mockInvoke.mockResolvedValue(null);
    await setDropboxToken('sl.my-token');
    expect(mockInvoke).toHaveBeenCalledWith('set_dropbox_token', { token: 'sl.my-token' });
  });
});

describe('deleteDropboxToken', () => {
  it('should call delete_dropbox_token with no extra args', async () => {
    mockInvoke.mockResolvedValue(null);
    await deleteDropboxToken();
    expect(mockInvoke).toHaveBeenCalledWith('delete_dropbox_token');
  });
});
