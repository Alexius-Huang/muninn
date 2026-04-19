// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateToken,
  listFolder,
  listFolderContinue,
  listFolderAll,
  getThumbnailBatch,
  getPreview,
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

describe('getThumbnailBatch', () => {
  it('should POST to content.dropboxapi.com/2/files/get_thumbnail_batch with correct entry shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(200, { entries: [{ '.tag': 'success', metadata: { path_lower: '/photos/img.jpg' }, thumbnail: 'abc123' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await getThumbnailBatch(['/Photos/img.jpg'], 'tok');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://content.dropboxapi.com/2/files/get_thumbnail_batch');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
    const body = JSON.parse(init.body as string);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({ path: '/Photos/img.jpg', format: 'jpeg', size: 'w256h256', mode: 'strict' });
  });

  it('should map success entries to { tag: "success", path_lower, dataUrl } with data:image/jpeg;base64, prefix', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeResponse(200, { entries: [{ '.tag': 'success', metadata: { path_lower: '/photos/img.jpg' }, thumbnail: 'base64data' }] }),
    ));
    const results = await getThumbnailBatch(['/Photos/img.jpg'], 'tok');
    expect(results[0]).toEqual({ tag: 'success', path_lower: '/photos/img.jpg', dataUrl: 'data:image/jpeg;base64,base64data' });
  });

  it('should map failure entries to { tag: "failure", path_lower, reason } using request-order path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeResponse(200, { entries: [{ '.tag': 'failure', failure: { '.tag': 'unsupported_extension' } }] }),
    ));
    const results = await getThumbnailBatch(['/Photos/RAW.cr2'], 'tok');
    expect(results[0]).toEqual({ tag: 'failure', path_lower: '/photos/raw.cr2', reason: 'unsupported_extension' });
  });

  it('should throw DropboxAuthError on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(401, 'Unauthorized')));
    await expect(getThumbnailBatch(['/a.jpg'], 'tok')).rejects.toThrow(DropboxAuthError);
  });

  it('should throw DropboxApiError with error_summary on non-2xx non-401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(409, { error_summary: 'too_many_files/...' })));
    const err = await getThumbnailBatch(['/a.jpg'], 'tok').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DropboxApiError);
    expect((err as DropboxApiError).message).toContain('too_many_files');
  });

  it('should throw DropboxNetworkError when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));
    await expect(getThumbnailBatch(['/a.jpg'], 'tok')).rejects.toThrow(DropboxNetworkError);
  });

  it('should throw synchronously when given more than 25 paths', async () => {
    const paths = Array.from({ length: 26 }, (_, i) => `/img-${i}.jpg`);
    await expect(getThumbnailBatch(paths, 'tok')).rejects.toThrow('max 25 paths per call');
  });
});

describe('getPreview', () => {
  function makeBinaryResponse(status: number, bytes: Uint8Array): Response {
    return {
      status,
      ok: status >= 200 && status < 300,
      arrayBuffer: () => Promise.resolve(bytes.buffer as ArrayBuffer),
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    } as unknown as Response;
  }

  it('should POST to files/get_thumbnail_v2 with the expected Dropbox-API-Arg header', async () => {
    const bytes = new Uint8Array([0x00, 0x01]);
    const fetchMock = vi.fn().mockResolvedValue(makeBinaryResponse(200, bytes));
    vi.stubGlobal('fetch', fetchMock);
    await getPreview('/Photos/img.jpg', 'tok');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://content.dropboxapi.com/2/files/get_thumbnail_v2');
    const arg = JSON.parse((init.headers as Record<string, string>)['Dropbox-API-Arg']);
    expect(arg.resource).toEqual({ '.tag': 'path', path: '/Photos/img.jpg' });
    expect(arg.size).toBe('w2048h1536');
    expect(arg.mode).toBe('strict');
  });

  it('should return a data:image/jpeg;base64,… URL on success', async () => {
    const bytes = new Uint8Array([0xff, 0xd8]);
    const fetchMock = vi.fn().mockResolvedValue(makeBinaryResponse(200, bytes));
    vi.stubGlobal('fetch', fetchMock);
    const result = await getPreview('/Photos/img.jpg', 'tok');
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('should throw DropboxAuthError on 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(401, 'Unauthorized'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getPreview('/Photos/img.jpg', 'tok')).rejects.toThrow(DropboxAuthError);
  });

  it('should throw DropboxNetworkError when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));
    await expect(getPreview('/Photos/img.jpg', 'tok')).rejects.toThrow(DropboxNetworkError);
  });
});
