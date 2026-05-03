// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createD1Client } from './d1Client';
import type { CfAuth } from './cfAuth';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));

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

describe('d1Client.query', () => {
  it('invokes query_d1 with correct args', async () => {
    mockInvoke.mockResolvedValue(JSON.stringify([]));
    const client = createD1Client(AUTH);
    await client.query('SELECT 1', [42]);

    expect(mockInvoke).toHaveBeenCalledWith('query_d1', {
      accountId: 'acct-1',
      databaseId: 'db-1',
      apiToken: 'tok-1',
      sql: 'SELECT 1',
      params: [42],
    });
  });

  it('returns parsed rows on success', async () => {
    const rows = [{ id: '1', name: 'test' }];
    mockInvoke.mockResolvedValue(JSON.stringify(rows));

    const client = createD1Client(AUTH);
    const result = await client.query('SELECT * FROM groups', []);
    expect(result).toEqual(rows);
  });

  it('defaults params to empty array', async () => {
    mockInvoke.mockResolvedValue(JSON.stringify([]));
    const client = createD1Client(AUTH);
    await client.query('SELECT 1');

    expect(mockInvoke).toHaveBeenCalledWith('query_d1', expect.objectContaining({ params: [] }));
  });

  it('propagates errors thrown by invoke', async () => {
    mockInvoke.mockRejectedValue(new Error('table not found'));
    const client = createD1Client(AUTH);
    await expect(client.query('SELECT * FROM nope', [])).rejects.toThrow('table not found');
  });
});
