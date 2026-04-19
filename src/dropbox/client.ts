import { authFetch, DropboxRefreshError } from '../auth/dropboxAuth';

export type DropboxAccount = {
  account_id: string;
  name: { display_name: string };
  email: string;
};

export type DropboxFolder = {
  '.tag': 'folder';
  name: string;
  path_display: string;
  path_lower: string;
};

export type DropboxFile = {
  '.tag': 'file';
  name: string;
  path_display: string;
  path_lower: string;
  id: string;
  size: number;
  server_modified: string;
};

export type DropboxEntry = DropboxFolder | DropboxFile;

export class DropboxAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DropboxAuthError';
  }
}

export class DropboxNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DropboxNetworkError';
  }
}

export class DropboxApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'DropboxApiError';
    this.status = status;
  }
}

export { DropboxRefreshError };

async function parseError(resp: Response): Promise<Error> {
  if (resp.status === 401) {
    return new DropboxAuthError('Session expired — please reconnect.');
  }
  let summary: string | undefined;
  try {
    const body = await resp.json();
    summary = body?.error_summary;
  } catch {
    summary = await resp.text().catch(() => undefined);
  }
  return new DropboxApiError(summary || resp.statusText || 'Dropbox request failed', resp.status);
}

export async function validateToken(): Promise<DropboxAccount> {
  let resp: Response;
  try {
    resp = await authFetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null',
    });
  } catch (e) {
    if (e instanceof DropboxRefreshError) throw e;
    throw new DropboxNetworkError((e as Error).message);
  }

  if (resp.status === 401) {
    throw new DropboxAuthError('Session expired — please reconnect.');
  }
  if (!resp.ok) {
    const body = await resp.text();
    throw new DropboxAuthError(body || `Dropbox returned ${resp.status}`);
  }
  return resp.json() as Promise<DropboxAccount>;
}

type ListFolderResult = { entries: DropboxEntry[]; cursor: string; has_more: boolean };

async function callDropbox(url: string, body: unknown): Promise<ListFolderResult> {
  let resp: Response;
  try {
    resp = await authFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof DropboxRefreshError) throw e;
    throw new DropboxNetworkError((e as Error).message);
  }
  if (!resp.ok) throw await parseError(resp);
  return resp.json() as Promise<ListFolderResult>;
}

export function listFolder(path: string): Promise<ListFolderResult> {
  return callDropbox('https://api.dropboxapi.com/2/files/list_folder', {
    path,
    recursive: false,
    include_media_info: false,
    limit: 2000,
  });
}

export function listFolderContinue(cursor: string): Promise<ListFolderResult> {
  return callDropbox('https://api.dropboxapi.com/2/files/list_folder/continue', { cursor });
}

export type ThumbnailResult =
  | { tag: 'success'; path_lower: string; dataUrl: string }
  | { tag: 'failure'; path_lower: string; reason: string };

type RawThumbnailEntry =
  | { '.tag': 'success'; metadata: { path_lower: string }; thumbnail: string }
  | { '.tag': 'failure'; failure: { '.tag': string } };

export async function getThumbnailBatch(paths: string[]): Promise<ThumbnailResult[]> {
  if (paths.length > 25) {
    throw new Error('getThumbnailBatch: max 25 paths per call');
  }
  let resp: Response;
  try {
    resp = await authFetch('https://content.dropboxapi.com/2/files/get_thumbnail_batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: paths.map((path) => ({ path, format: 'jpeg', size: 'w256h256', mode: 'strict' })),
      }),
    });
  } catch (e) {
    if (e instanceof DropboxRefreshError) throw e;
    throw new DropboxNetworkError((e as Error).message);
  }
  if (!resp.ok) throw await parseError(resp);
  const body = (await resp.json()) as { entries: RawThumbnailEntry[] };
  return body.entries.map((entry, i) => {
    if (entry['.tag'] === 'success') {
      return {
        tag: 'success' as const,
        path_lower: entry.metadata.path_lower,
        dataUrl: 'data:image/jpeg;base64,' + entry.thumbnail,
      };
    }
    return {
      tag: 'failure' as const,
      path_lower: paths[i].toLowerCase(),
      reason: entry.failure?.['.tag'] ?? 'unknown',
    };
  });
}

export async function getPreview(pathDisplay: string): Promise<string> {
  let resp: Response;
  try {
    resp = await authFetch('https://content.dropboxapi.com/2/files/get_thumbnail_v2', {
      method: 'POST',
      headers: {
        'Dropbox-API-Arg': JSON.stringify({
          resource: { '.tag': 'path', path: pathDisplay },
          format: 'jpeg',
          size: 'w2048h1536',
          mode: 'strict',
        }),
      },
    });
  } catch (e) {
    if (e instanceof DropboxRefreshError) throw e;
    throw new DropboxNetworkError((e as Error).message);
  }
  if (!resp.ok) throw await parseError(resp);
  const blob = await resp.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image data'));
    reader.readAsDataURL(blob);
  });
}

export async function listFolderAll(path: string): Promise<DropboxEntry[]> {
  const all: DropboxEntry[] = [];
  let result = await listFolder(path);
  all.push(...result.entries);
  while (result.has_more) {
    result = await listFolderContinue(result.cursor);
    all.push(...result.entries);
  }
  return all;
}
