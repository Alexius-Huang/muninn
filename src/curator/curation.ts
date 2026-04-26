import { invoke } from '@tauri-apps/api/core';
import type { DropboxFile } from '../dropbox/client';

export type Flag = 'keep' | 'discard';
export type CurationFlags = Record<string, Flag>;

// XOR invariant: a record has at most one of { flag, groupId }.
// Always mutate records through applyFlag / applyGroupId to uphold this.
export type CurationRecord = {
  photoId?: string;
  pathLower: string;
  pathDisplay: string;
  name: string;
  flag?: Flag;
  groupId?: string;
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

export function applyFlag(
  records: Record<string, CurationRecord>,
  file: DropboxFile,
  flag: Flag | undefined,
): Record<string, CurationRecord> {
  const next = { ...records };
  const existing = records[file.id];
  if (flag === undefined) {
    if (existing?.groupId) {
      const { flag: _f, ...rest } = existing;
      next[file.id] = rest;
    } else {
      delete next[file.id];
    }
  } else {
    next[file.id] = {
      photoId: file.id,
      pathLower: file.path_lower,
      pathDisplay: file.path_display,
      name: file.name,
      capturedAt: existing?.capturedAt ?? file.media_info?.metadata?.time_taken ?? file.client_modified,
      flag,
    };
  }
  return next;
}

export function applyGroupId(
  records: Record<string, CurationRecord>,
  file: DropboxFile,
  groupId: string | undefined,
): Record<string, CurationRecord> {
  const next = { ...records };
  const existing = records[file.id];
  if (groupId === undefined) {
    if (existing?.flag) {
      const { groupId: _g, ...rest } = existing;
      next[file.id] = rest;
    } else {
      delete next[file.id];
    }
  } else {
    next[file.id] = {
      photoId: file.id,
      pathLower: file.path_lower,
      pathDisplay: file.path_display,
      name: file.name,
      capturedAt: existing?.capturedAt ?? file.media_info?.metadata?.time_taken ?? file.client_modified,
      groupId,
    };
  }
  return next;
}

export function transitionToGroup(
  records: Record<string, CurationRecord>,
  key: string,
  groupId: string,
): Record<string, CurationRecord> {
  const existing = records[key];
  if (!existing) return records;
  const { flag: _flag, ...rest } = existing;
  return { ...records, [key]: { ...rest, groupId } };
}

export function clearGroupRefs(
  records: Record<string, CurationRecord>,
  groupId: string,
): { records: Record<string, CurationRecord>; changed: boolean } {
  let changed = false;
  const next = { ...records };
  for (const [key, record] of Object.entries(next)) {
    if (record.groupId === groupId) {
      changed = true;
      if (record.flag) {
        const { groupId: _g, ...rest } = record;
        next[key] = rest;
      } else {
        delete next[key];
      }
    }
  }
  return { records: next, changed };
}
