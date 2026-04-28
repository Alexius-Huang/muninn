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

// Dropbox-API-Arg is an HTTP header; HTTP headers can't carry raw non-ASCII bytes.
// Dropbox's own SDKs escape any character above 0x7E as \uXXXX so the header stays
// pure ASCII while the parsed JSON still recovers the original Unicode value.
function asciiEscapeJson(json: string): string {
  return json.replace(/[\x7f-\uffff]/g, (c) =>
    '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}

// Cap concurrent thumbnail/preview HTTP requests. Without this, opening a folder of
// 80+ photos burst-fires that many parallel requests at Dropbox and trips its per-user
// rate limit (429). HTTP/2 multiplexing handles the throughput fine; this just smooths
// the request rate. 16 is well under the ~84-burst threshold we observed empirically,
// and the 429 retry below covers the rare overshoot. Shared with getPreview.
const MAX_THUMBNAIL_CONCURRENCY = 16;
let _thumbnailInFlight = 0;
const _thumbnailQueue: (() => void)[] = [];

function withThumbnailSlot<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = (): void => {
      _thumbnailInFlight++;
      fn().then(
        (v) => {
          _thumbnailInFlight--;
          _thumbnailQueue.shift()?.();
          resolve(v);
        },
        (e: unknown) => {
          _thumbnailInFlight--;
          _thumbnailQueue.shift()?.();
          reject(e as Error);
        },
      );
    };
    if (_thumbnailInFlight < MAX_THUMBNAIL_CONCURRENCY) run();
    else _thumbnailQueue.push(run);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchThumbnailV2(path: string, size: 'w256h256' | 'w2048h1536'): Promise<Response> {
  const arg = asciiEscapeJson(
    JSON.stringify({
      resource: { '.tag': 'path', path },
      format: 'jpeg',
      size,
      mode: 'strict',
    }),
  );
  const send = (): Promise<Response> =>
    authFetch('https://content.dropboxapi.com/2/files/get_thumbnail_v2', {
      method: 'POST',
      headers: { 'Dropbox-API-Arg': arg },
    });

  return withThumbnailSlot(async () => {
    let resp: Response;
    try {
      resp = await send();
    } catch (e) {
      if (e instanceof DropboxRefreshError) throw e;
      throw new DropboxNetworkError((e as Error).message);
    }
    if (resp.status === 429) {
      // Honor Retry-After (seconds), clamped so a hostile value can't stall us.
      const retryAfterSec = Number(resp.headers.get('Retry-After')) || 1;
      await sleep(Math.min(Math.max(retryAfterSec, 1), 5) * 1000);
      try {
        resp = await send();
      } catch (e) {
        if (e instanceof DropboxRefreshError) throw e;
        throw new DropboxNetworkError((e as Error).message);
      }
    }
    return resp;
  });
}

async function getThumbnailOne(path: string): Promise<ThumbnailResult> {
  const pathLower = path.toLowerCase();
  try {
    const resp = await fetchThumbnailV2(path, 'w256h256');
    if (resp.ok) {
      const blob = await resp.blob();
      const dataUrl = await blobToDataUrl(blob);
      return { tag: 'success', path_lower: pathLower, dataUrl };
    }
    // Any non-2xx becomes a per-file failure rather than throwing — one bad photo (or a
    // transient 5xx / 429) must NOT abort sibling calls inside Promise.all.
    let reason = `http_${resp.status}`;
    try {
      const body = (await resp.json()) as { error_summary?: string };
      if (body.error_summary) reason = body.error_summary.split('/')[0];
    } catch {
      // not JSON; leave reason as http_<status>
    }
    return { tag: 'failure', path_lower: pathLower, reason };
  } catch (e) {
    if (e instanceof DropboxRefreshError) throw e; // refresh failed — let auth flow react
    return { tag: 'failure', path_lower: pathLower, reason: 'network' };
  }
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
