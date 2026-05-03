// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createD1Client } from './d1Client';
import type { CfAuth } from './cfAuth';

const AUTH: CfAuth = {
  accountId: 'acct-1',
  d1ApiToken: 'tok-1',
  d1DatabaseId: 'db-1',
  r2AccessKeyId: 'key-1',
  r2SecretAccessKey: 'secret-1',
  r2Bucket: 'bucket-1',
};

const EXPECTED_URL =
  'https://api.cloudflare.com/client/v4/accounts/acct-1/d1/database/db-1/query';

beforeEach(() => {
  vi.restoreAllMocks();
});

function makeFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe('d1Client.query', () => {
  it('POSTs to the correct D1 URL', async () => {
    const fetchMock = makeFetch({
      success: true,
      result: [{ results: [], success: true, meta: {} }],
      errors: [],
      messages: [],
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createD1Client(AUTH);
    await client.query('SELECT 1', []);

    expect(fetchMock).toHaveBeenCalledWith(EXPECTED_URL, expect.any(Object));
  });

  it('sends Authorization: Bearer and Content-Type headers', async () => {
    const fetchMock = makeFetch({
      success: true,
      result: [{ results: [], success: true, meta: {} }],
      errors: [],
      messages: [],
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createD1Client(AUTH);
    await client.query('SELECT 1', []);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok-1');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sends correct JSON body', async () => {
    const fetchMock = makeFetch({
      success: true,
      result: [{ results: [], success: true, meta: {} }],
      errors: [],
      messages: [],
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createD1Client(AUTH);
    await client.query('SELECT ?', [42]);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ sql: 'SELECT ?', params: [42] });
  });

  it('returns result rows on success', async () => {
    const rows = [{ id: '1', name: 'test' }];
    const fetchMock = makeFetch({
      success: true,
      result: [{ results: rows, success: true, meta: {} }],
      errors: [],
      messages: [],
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createD1Client(AUTH);
    const result = await client.query('SELECT * FROM groups', []);
    expect(result).toEqual(rows);
  });

  it('throws with errors[0].message when success is false', async () => {
    const fetchMock = makeFetch({
      success: false,
      result: [],
      errors: [{ code: 7500, message: 'table not found' }],
      messages: [],
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createD1Client(AUTH);
    await expect(client.query('SELECT * FROM nope', [])).rejects.toThrow('table not found');
  });
});
