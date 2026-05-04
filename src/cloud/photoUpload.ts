import { downloadFile } from '../dropbox/client';
import type { R2Client } from './r2Client';

function contentTypeFromPath(pathDisplay: string): string {
  const ext = pathDisplay.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

export async function uploadPhotoToR2(
  r2: R2Client,
  input: { photoId: string; pathDisplay: string },
  download: (pathDisplay: string) => Promise<Blob> = downloadFile,
): Promise<{ r2Key: string }> {
  const r2Key = `photos/${input.photoId}`;
  const blob = await download(input.pathDisplay);
  await r2.putObject(r2Key, blob, contentTypeFromPath(input.pathDisplay));
  return { r2Key };
}
