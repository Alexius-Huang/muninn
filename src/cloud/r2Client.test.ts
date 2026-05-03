// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createR2Client } from './r2Client';
import type { CfAuth } from './cfAuth';

const AUTH: CfAuth = {
  accountId: 'acct-1',
  d1ApiToken: 'tok-1',
  d1DatabaseId: 'db-1',
  r2AccessKeyId: 'AKIATEST',
  r2SecretAccessKey: 'secretkey',
  r2Bucket: 'muninn-photos',
};

const BASE_URL = 'https://acct-1.r2.cloudflarestorage.com/muninn-photos';

beforeEach(() => {
  vi.restoreAllMocks();
});

// aws4fetch calls fetch(request) with a Request object, not fetch(url, init)
function capturedRequest(fetchMock: ReturnType<typeof vi.fn>): Request {
  return fetchMock.mock.calls[0][0] as Request;
}

describe('r2Client.putObject', () => {
  it('PUTs to the correct R2 URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('') });
    vi.stubGlobal('fetch', fetchMock);

    const client = createR2Client(AUTH);
    await client.putObject('test/key.bin', new Blob(['x']));

    expect(capturedRequest(fetchMock).url).toBe(`${BASE_URL}/test/key.bin`);
  });

  it('uses PUT method', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('') });
    vi.stubGlobal('fetch', fetchMock);

    const client = createR2Client(AUTH);
    await client.putObject('key.bin', new Blob(['x']));

    expect(capturedRequest(fetchMock).method).toBe('PUT');
  });

  it('adds AWS SigV4 Authorization, x-amz-date, and x-amz-content-sha256 headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('') });
    vi.stubGlobal('fetch', fetchMock);

    const client = createR2Client(AUTH);
    await client.putObject('key.bin', new Blob(['x']));

    const headers = capturedRequest(fetchMock).headers;
    expect(headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(headers.get('x-amz-date')).toMatch(/^\d{8}T\d{6}Z$/);
    expect(headers.get('x-amz-content-sha256')).toBeTruthy();
  });

  it('throws on non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('AccessDenied'),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createR2Client(AUTH);
    await expect(client.putObject('key.bin', new Blob(['x']))).rejects.toThrow('R2 PUT 403');
  });
});

describe('r2Client.getObject', () => {
  it('GETs from the correct R2 URL', async () => {
    const blob = new Blob(['content']);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(blob) });
    vi.stubGlobal('fetch', fetchMock);

    const client = createR2Client(AUTH);
    await client.getObject('test/key.bin');

    expect(capturedRequest(fetchMock).url).toBe(`${BASE_URL}/test/key.bin`);
  });

  it('returns Blob on 200', async () => {
    const blob = new Blob(['hello']);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(blob) });
    vi.stubGlobal('fetch', fetchMock);

    const client = createR2Client(AUTH);
    const result = await client.getObject('key.bin');
    expect(result).toBe(blob);
  });

  it('returns null on 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('Not Found') });
    vi.stubGlobal('fetch', fetchMock);

    const client = createR2Client(AUTH);
    const result = await client.getObject('missing.bin');
    expect(result).toBeNull();
  });
});
