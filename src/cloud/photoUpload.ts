import { downloadFile } from '../dropbox/client';
import type { R2Client } from './r2Client';

export async function uploadPhotoToR2(
  r2: R2Client,
  input: { photoId: string; pathDisplay: string },
  download: (pathDisplay: string) => Promise<Blob> = downloadFile,
): Promise<{ r2Key: string }> {
  const r2Key = `photos/${input.photoId}`;
  const blob = await download(input.pathDisplay);
  await r2.putObject(r2Key, blob);
  return { r2Key };
}
