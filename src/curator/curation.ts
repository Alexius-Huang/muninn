import { invoke } from '@tauri-apps/api/core';
import type { DropboxFile } from '../dropbox/client';

export type Flag = 'keep' | 'discard';
export type CurationFlags = Record<string, Flag>;

export type CurationRecord = {
  photoId?: string;
  pathLower: string;
  pathDisplay: string;
  name: string;
  flag: Flag;
  capturedAt?: string;
};

export type CurationFile = {
  folderPath: string;
  records: Record<string, CurationRecord>; // keyed by pathLower
};

function basename(pathLower: string): string {
  return pathLower.split('/').filter(Boolean).pop() ?? pathLower;
}

export function migrateLegacyCurationFile(raw: unknown): CurationFile {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid curation file: not an object');
  }
  const obj = raw as Record<string, unknown>;

  // New shape: has `records`
  if ('records' in obj && typeof obj.records === 'object' && obj.records !== null) {
    return obj as unknown as CurationFile;
  }

  // Legacy shape: has `flags: Record<pathLower, Flag>`
  if ('flags' in obj && typeof obj.flags === 'object' && obj.flags !== null) {
    const flags = obj.flags as Record<string, Flag>;
    const records: Record<string, CurationRecord> = {};
    for (const [pathLower, flag] of Object.entries(flags)) {
      records[pathLower] = {
        pathLower,
        pathDisplay: pathLower,
        name: basename(pathLower),
        flag,
      };
    }
    return {
      folderPath: typeof obj.folderPath === 'string' ? obj.folderPath : '',
      records,
    };
  }

  throw new Error('Invalid curation file: missing records or flags');
}

export function migrateToIdKeys(
  file: CurationFile,
  dropboxFiles: DropboxFile[],
): { file: CurationFile; changed: boolean; droppedCount: number } {
  const keys = Object.keys(file.records);
  if (keys.length === 0 || keys.every((k) => k.startsWith('id:'))) {
    return { file, changed: false, droppedCount: 0 };
  }

  const byPathLower = new Map(dropboxFiles.map((f) => [f.path_lower, f]));
  const newRecords: Record<string, CurationRecord> = {};
  let droppedCount = 0;

  for (const [key, record] of Object.entries(file.records)) {
    if (key.startsWith('id:')) {
      newRecords[key] = record;
      continue;
    }
    const dbFile = byPathLower.get(record.pathLower);
    if (!dbFile) {
      droppedCount++;
      continue;
    }
    newRecords[dbFile.id] = {
      ...record,
      photoId: dbFile.id,
      capturedAt: record.capturedAt ?? dbFile.media_info?.metadata?.time_taken ?? dbFile.client_modified,
    };
  }

  return { file: { ...file, records: newRecords }, changed: true, droppedCount };
}

export async function readCuration(folderPath: string): Promise<CurationFile | null> {
  const raw = await invoke<string | null>('read_curation', { folderPath });
  if (raw === null) return null;
  return migrateLegacyCurationFile(JSON.parse(raw));
}

export async function writeCuration(file: CurationFile): Promise<void> {
  await invoke('write_curation', {
    folderPath: file.folderPath,
    contents: JSON.stringify(file, null, 2),
  });
}

export async function listCuration(): Promise<CurationFile[]> {
  const blobs = await invoke<string[]>('list_curation');
  return blobs.map((blob) => migrateLegacyCurationFile(JSON.parse(blob)));
}
