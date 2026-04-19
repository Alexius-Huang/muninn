// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateToken,
  listFolder,
  listFolderContinue,
  listFolderAll,
  DropboxAuthError,
  DropboxNetworkError,
  DropboxApiError,
} from './client';

const FAKE_ACCOUNT = {
  account_id: 'dbid:abc123',
  name: { display_name: 'Test User' },
  email: 'test@example.com',
};

function makeResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('validateToken', () => {
  it('should return account info on a 2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, FAKE_ACCOUNT)));
    const result = await validateToken('sl.valid-token');
    expect(result).toEqual(FAKE_ACCOUNT);
  });

  it('should send Authorization header and POST to get_current_account', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, FAKE_ACCOUNT));
    vi.stubGlobal('fetch', fetchMock);
    await validateToken('sl.valid-token');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.dropboxapi.com/2/users/get_current_account');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sl.valid-token');
  });

  it('should throw DropboxAuthError on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(401, 'Unauthorized')));
    await expect(validateToken('sl.bad-token')).rejects.toThrow(DropboxAuthError);
  });

  it('should throw DropboxAuthError on non-2xx non-401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(500, 'Server error')));
    await expect(validateToken('sl.token')).rejects.toThrow(DropboxAuthError);
  });

  it('should throw DropboxNetworkError when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));
    await expect(validateToken('sl.token')).rejects.toThrow(DropboxNetworkError);
  });
});

const FAKE_FOLDER = {
  '.tag': 'folder',
  name: 'Photos',
  path_display: '/Photos',
  path_lower: '/photos',
};

const FAKE_FILE = {
  '.tag': 'file',
  name: 'img.jpg',
  path_display: '/Photos/img.jpg',
  path_lower: '/photos/img.jpg',
  id: 'abc',
  size: 1024,
  server_modified: '2026-01-01T00:00:00Z',
};

function makeListResponse(
  entries: unknown[],
  has_more = false,
  cursor = 'cursor-1',
): Response {
  return makeResponse(200, { entries, cursor, has_more });
}

describe('listFolder', () => {
  it('should POST to /2/files/list_folder with correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeListResponse([FAKE_FOLDER]));
    vi.stubGlobal('fetch', fetchMock);
    await listFolder('/Photos', 'tok');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.dropboxapi.com/2/files/list_folder');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ path: '/Photos', recursive: false, limit: 2000 });
  });

  it('should return entries, cursor, has_more on 2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeListResponse([FAKE_FOLDER], true, 'cur-a')));
    const result = await listFolder('', 'tok');
    expect(result.entries).toHaveLength(1);
    expect(result.cursor).toBe('cur-a');
    expect(result.has_more).toBe(true);
  });

  it('should throw DropboxAuthError on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(401, 'Unauthorized')));
    await expect(listFolder('', 'bad-tok')).rejects.toThrow(DropboxAuthError);
  });

  it('should throw DropboxApiError with error_summary on 409', async () => {
    const body = { error_summary: 'path/not_found/...' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(409, body)));
    const err = await listFolder('', 'tok').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DropboxApiError);
    expect((err as DropboxApiError).message).toContain('path/not_found');
    expect((err as DropboxApiError).status).toBe(409);
  });
});

describe('listFolderContinue', () => {
  it('should POST to /2/files/list_folder/continue with cursor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeListResponse([FAKE_FILE]));
    vi.stubGlobal('fetch', fetchMock);
    await listFolderContinue('my-cursor', 'tok');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.dropboxapi.com/2/files/list_folder/continue');
    expect(JSON.parse(init.body as string)).toEqual({ cursor: 'my-cursor' });
  });
});

describe('listFolderAll', () => {
  it('should return entries from a single page when has_more is false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeListResponse([FAKE_FOLDER, FAKE_FILE])));
    const entries = await listFolderAll('', 'tok');
    expect(entries).toHaveLength(2);
  });

  it('should follow has_more through list_folder/continue and concatenate entries', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeListResponse([FAKE_FOLDER], true, 'cur-a'))
      .mockResolvedValueOnce(makeListResponse([FAKE_FILE], true, 'cur-b'))
      .mockResolvedValueOnce(makeListResponse([FAKE_FOLDER], false, 'cur-c'));
    vi.stubGlobal('fetch', fetchMock);
    const entries = await listFolderAll('', 'tok');
    expect(entries).toHaveLength(3);
    // second and third calls should hit /continue
    const [secondUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    const [thirdUrl] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(secondUrl).toBe('https://api.dropboxapi.com/2/files/list_folder/continue');
    expect(thirdUrl).toBe('https://api.dropboxapi.com/2/files/list_folder/continue');
    // cursors forwarded correctly
    expect(JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string)).toEqual({ cursor: 'cur-a' });
    expect(JSON.parse((fetchMock.mock.calls[2] as [string, RequestInit])[1].body as string)).toEqual({ cursor: 'cur-b' });
  });

  it('should propagate DropboxApiError raised mid-pagination', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeListResponse([FAKE_FOLDER], true, 'cur-a'))
      .mockResolvedValueOnce(makeResponse(409, { error_summary: 'no_permission/...' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listFolderAll('', 'tok')).rejects.toThrow(DropboxApiError);
  });
});
