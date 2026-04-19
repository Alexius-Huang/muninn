import { invoke } from '@tauri-apps/api/core';

export type Flag = 'keep' | 'discard';
export type CurationFlags = Record<string, Flag>;
export type CurationFile = { folderPath: string; flags: CurationFlags };

export async function readCuration(folderPath: string): Promise<CurationFile | null> {
  const raw = await invoke<string | null>('read_curation', { folderPath });
  if (raw === null) return null;
  return JSON.parse(raw) as CurationFile;
}

export async function writeCuration(file: CurationFile): Promise<void> {
  await invoke('write_curation', {
    folderPath: file.folderPath,
    contents: JSON.stringify(file, null, 2),
  });
}
