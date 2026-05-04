import type { Group } from '../curator/groups';
import type { D1Client } from './d1Client';
import type { R2Client } from './r2Client';
import type { PhotoRow } from './groupWrites';
import type { uploadPhotoToR2 } from './photoUpload';
import type { insertGroupAndPhotos, deleteGroupRowsFromD1 } from './groupWrites';

export type PhotoRowWithSource = PhotoRow & { dropboxPath: string };

export type OrchestratorDeps = {
  d1: D1Client;
  r2: R2Client;
  uploadPhotoToR2: typeof uploadPhotoToR2;
  insertGroupAndPhotos: typeof insertGroupAndPhotos;
  deleteGroupRowsFromD1: typeof deleteGroupRowsFromD1;
  persistLocal: () => Promise<void>;
  rollbackLocal: () => Promise<void>;
};

function r2KeyFor(photoId: string): string {
  return `photos/${photoId}`;
}

async function deleteR2Objects(
  r2: R2Client,
  photoIds: string[],
  label: string,
): Promise<void> {
  const settled = await Promise.allSettled(
    photoIds.map((id) => r2.deleteObject(r2KeyFor(id))),
  );
  settled.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn(`[${label}] R2 deleteObject(${r2KeyFor(photoIds[i])}) failed:`, r.reason);
    }
  });
}

export async function runCreateGroupTransaction(
  group: Group,
  photos: PhotoRowWithSource[],
  deps: OrchestratorDeps,
): Promise<void> {
  // Phase 1 — R2 uploads
  const uploadResults = await Promise.allSettled(
    photos.map((p) =>
      deps.uploadPhotoToR2(deps.r2, { photoId: p.id, pathDisplay: p.dropboxPath }),
    ),
  );
  const fulfilledIds: string[] = [];
  const rejectedReasons: unknown[] = [];
  uploadResults.forEach((r, i) => {
    if (r.status === 'fulfilled') fulfilledIds.push(photos[i].id);
    else rejectedReasons.push(r.reason);
  });
  if (rejectedReasons.length > 0) {
    await deleteR2Objects(deps.r2, fulfilledIds, 'phase-1-rollback');
    const firstReason =
      rejectedReasons[0] instanceof Error
        ? rejectedReasons[0].message
        : String(rejectedReasons[0]);
    throw new Error(
      `Failed to upload ${rejectedReasons.length} of ${photos.length} photos to R2: ${firstReason}`,
    );
  }

  const allPhotoIds = photos.map((p) => p.id);

  // Phase 2 — D1 insert
  try {
    await deps.insertGroupAndPhotos(deps.d1, group, photos);
  } catch (err) {
    await deleteR2Objects(deps.r2, allPhotoIds, 'phase-2-rollback');
    const d1Settled = await Promise.allSettled([
      deps.deleteGroupRowsFromD1(deps.d1, group.id),
    ]);
    if (d1Settled[0].status === 'rejected') {
      console.warn(
        `[phase-2-rollback] deleteGroupRowsFromD1(${group.id}) failed:`,
        d1Settled[0].reason,
      );
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to write group metadata to D1: ${reason}`);
  }

  // Phase 3 — Local persistence
  try {
    await deps.persistLocal();
  } catch (err) {
    await deleteR2Objects(deps.r2, allPhotoIds, 'phase-3-rollback');
    const d1Settled = await Promise.allSettled([
      deps.deleteGroupRowsFromD1(deps.d1, group.id),
    ]);
    if (d1Settled[0].status === 'rejected') {
      console.warn(
        `[phase-3-rollback] deleteGroupRowsFromD1(${group.id}) failed:`,
        d1Settled[0].reason,
      );
    }
    try {
      await deps.rollbackLocal();
    } catch (rbErr) {
      console.warn(`[phase-3-rollback] rollbackLocal failed:`, rbErr);
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to persist group locally: ${reason}`);
  }
}
