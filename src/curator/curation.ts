import { invoke } from '@tauri-apps/api/core';

export type Flag = 'keep' | 'discard';
export type CurationFlags = Record<string, Flag>;

export type CurationRecord = {
  pathLower: string;
  pathDisplay: string;
  name: string;
  flag: Flag;
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
