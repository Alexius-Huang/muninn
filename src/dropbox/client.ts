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
  client_modified: string;
  media_info?: {
    metadata?: { time_taken?: string };
  };
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
    include_media_info: true,
    limit: 2000,
  });
}

export function listFolderContinue(cursor: string): Promise<ListFolderResult> {
  return callDropbox('https://api.dropboxapi.com/2/files/list_folder/continue', { cursor });
}

export type ThumbnailResult =
  | { tag: 'success'; path_lower: string; dataUrl: string }
  | { tag: 'failure'; path_lower: string; reason: string };

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image data'));
    reader.readAsDataURL(blob);
  });
}

async function fetchThumbnailV2(path: string, size: 'w256h256' | 'w2048h1536'): Promise<Response> {
  try {
    return await authFetch('https://content.dropboxapi.com/2/files/get_thumbnail_v2', {
      method: 'POST',
      headers: {
        'Dropbox-API-Arg': JSON.stringify({
          resource: { '.tag': 'path', path },
          format: 'jpeg',
          size,
          mode: 'strict',
        }),
      },
    });
  } catch (e) {
    if (e instanceof DropboxRefreshError) throw e;
    throw new DropboxNetworkError((e as Error).message);
  }
}

async function getThumbnailOne(path: string): Promise<ThumbnailResult> {
  const pathLower = path.toLowerCase();
  const resp = await fetchThumbnailV2(path, 'w256h256');
  if (resp.status === 409) {
    // Per-file Dropbox error (e.g. unsupported_extension, path/not_found) — surface as failure
    // without aborting sibling calls in the batch.
    let reason = 'unknown';
    try {
      const body = (await resp.json()) as { error_summary?: string };
      if (body.error_summary) reason = body.error_summary.split('/')[0];
    } catch {
      // fall through with reason='unknown'
    }
    return { tag: 'failure', path_lower: pathLower, reason };
  }
  if (!resp.ok) throw await parseError(resp);
  const blob = await resp.blob();
  const dataUrl = await blobToDataUrl(blob);
  return { tag: 'success', path_lower: pathLower, dataUrl };
}

export async function getThumbnailBatch(paths: string[]): Promise<ThumbnailResult[]> {
  if (paths.length > 25) {
    throw new Error('getThumbnailBatch: max 25 paths per call');
  }
  return Promise.all(paths.map((p) => getThumbnailOne(p)));
}

export async function getPreview(pathDisplay: string): Promise<string> {
  const resp = await fetchThumbnailV2(pathDisplay, 'w2048h1536');
  if (!resp.ok) throw await parseError(resp);
  const blob = await resp.blob();
  return blobToDataUrl(blob);
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
