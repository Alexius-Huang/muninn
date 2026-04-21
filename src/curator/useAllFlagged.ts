import { useCallback, useEffect, useRef, useState } from 'react';
import { listCuration, writeCuration, type CurationFile, type CurationRecord, type Flag } from './curation';

export type FlatRecord = {
  folderPath: string;
  record: CurationRecord;
};

export type AllFlaggedReturn = {
  records: FlatRecord[];
  setFlag: (folderPath: string, pathLower: string, value: Flag | undefined) => void;
  reload: () => Promise<void>;
  flush: () => void;
  loading: boolean;
};

function flatten(files: CurationFile[]): FlatRecord[] {
  const result: FlatRecord[] = [];
  const sorted = [...files].sort((a, b) => a.folderPath.localeCompare(b.folderPath));
  for (const file of sorted) {
    const recs = Object.values(file.records)
      .filter((r) => r.flag !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const record of recs) {
      result.push({ folderPath: file.folderPath, record });
    }
  }
  return result;
}

export function useAllFlagged(): AllFlaggedReturn {
  const [records, setRecords] = useState<FlatRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const filesRef = useRef<Map<string, CurationFile['records']>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const flush = useCallback(() => {
    for (const [folderPath, timer] of timersRef.current) {
      clearTimeout(timer);
      const recs = filesRef.current.get(folderPath);
      if (recs !== undefined) {
        writeCuration({ folderPath, records: recs });
      }
    }
    timersRef.current.clear();
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const files = await listCuration();
      const diskPaths = new Set(files.map((f) => f.folderPath));
      // Overlay pending in-memory writes on top of disk data
      for (const file of files) {
        if (timersRef.current.has(file.folderPath)) {
          const inMemory = filesRef.current.get(file.folderPath);
          if (inMemory !== undefined) file.records = inMemory;
        }
      }
      // Preserve in-memory-only folders not yet flushed to disk
      for (const [folderPath, recs] of filesRef.current) {
        if (!diskPaths.has(folderPath) && timersRef.current.has(folderPath)) {
          files.push({ folderPath, records: recs });
        }
      }
      filesRef.current = new Map(files.map((f) => [f.folderPath, f.records]));
      setRecords(flatten(files));
    } finally {
      setLoading(false);
    }
  }, []);

  const setFlag = useCallback((folderPath: string, pathLower: string, value: Flag | undefined) => {
    const current = filesRef.current.get(folderPath) ?? {};
    const next = { ...current };
    if (value === undefined) {
      delete next[pathLower];
    } else {
      const existing = next[pathLower];
      next[pathLower] = {
        pathLower,
        pathDisplay: existing?.pathDisplay ?? pathLower,
        name: existing?.name ?? (pathLower.split('/').filter(Boolean).pop() ?? pathLower),
        flag: value,
      };
    }
    filesRef.current.set(folderPath, next);

    const allFiles: CurationFile[] = [];
    for (const [fp, recs] of filesRef.current) {
      allFiles.push({ folderPath: fp, records: recs });
    }
    setRecords(flatten(allFiles));

    const existing = timersRef.current.get(folderPath);
    if (existing !== undefined) clearTimeout(existing);
    const timer = setTimeout(() => {
      timersRef.current.delete(folderPath);
      writeCuration({ folderPath, records: next });
    }, 250);
    timersRef.current.set(folderPath, timer);
  }, []);

  // Initial load on mount; flush pending writes on unmount
  useEffect(() => {
    void reload();
    return flush;
  }, [reload, flush]);

  return { records, setFlag, reload, flush, loading };
}
