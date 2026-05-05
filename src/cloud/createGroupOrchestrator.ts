import type { Group } from '../curator/groups';
import type { D1Client } from './d1Client';
import type { R2Client } from './r2Client';
import type { PhotoRow } from './groupWrites';
import type { uploadPhotoToR2 } from './photoUpload';
import type { insertGroupRow, insertPhotoRows } from './groupWrites';

export type PhotoRowWithSource = PhotoRow & { dropboxPath: string };

export type CreateGroupResult = {
  succeeded: string[];
  failed: string[];
};

export type OrchestratorDeps = {
  d1: D1Client;
  r2: R2Client;
  uploadPhotoToR2: typeof uploadPhotoToR2;
  insertGroupRow: typeof insertGroupRow;
  insertPhotoRows: typeof insertPhotoRows;
  persistLocal: () => Promise<void>;
  rollbackLocal: () => Promise<void>;
};

export const R2_UPLOAD_CONCURRENCY = 3;
export const RETRY_DELAYS_MS = [500, 1000, 2000] as const;

export class D1PhotoInsertError extends Error {
  readonly succeededR2PhotoIds: string[];
  constructor(message: string, succeededR2PhotoIds: string[]) {
    super(message);
    this.name = 'D1PhotoInsertError';
    this.succeededR2PhotoIds = succeededR2PhotoIds;
  }
}

async function settledWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await tasks[i]() };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

async function withExponentialRetry(
  fn: () => Promise<void>,
  delays: readonly number[],
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < delays.length) {
        await new Promise<void>((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }
  }
  throw lastErr;
}

export async function runCreateGroupTransaction(
  group: Group,
  photos: PhotoRowWithSource[],
  deps: OrchestratorDeps,
): Promise<CreateGroupResult> {
  // Phase 1 — Local persist
  try {
    await deps.persistLocal();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to persist group locally: ${reason}`);
  }

  // Phase 2 — D1 group insert (group row only, no photo rows yet)
  try {
    await deps.insertGroupRow(deps.d1, group);
  } catch (err) {
    try {
      await deps.rollbackLocal();
    } catch (rbErr) {
      console.warn('[phase-2-rollback] rollbackLocal failed:', rbErr);
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to write group metadata to D1: ${reason}`);
  }

  // Phase 3 — R2 uploads (best-effort, concurrency-capped; failures collected, do not abort)
  const uploadResults = await settledWithConcurrency(
    photos.map((p) => () =>
      deps.uploadPhotoToR2(deps.r2, { photoId: p.id, pathDisplay: p.dropboxPath }),
    ),
    R2_UPLOAD_CONCURRENCY,
  );

  const succeededPhotos: PhotoRowWithSource[] = [];
  const failedIds: string[] = [];
  uploadResults.forEach((r, i) => {
    if (r.status === 'fulfilled') succeededPhotos.push(photos[i]);
    else failedIds.push(photos[i].id);
  });

  // Phase 4 — D1 batch photo insert for succeeded uploads only, with exponential retry
  const succeededIds = succeededPhotos.map((p) => p.id);
  if (succeededPhotos.length > 0) {
    try {
      await withExponentialRetry(
        () => deps.insertPhotoRows(deps.d1, succeededPhotos),
        RETRY_DELAYS_MS,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new D1PhotoInsertError(
        `Failed to insert photo rows to D1: ${reason}`,
        succeededIds,
      );
    }
  }

  return { succeeded: succeededIds, failed: failedIds };
}
