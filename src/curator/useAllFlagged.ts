import { useCallback, useEffect, useRef, useState } from 'react';
import { listCuration, writeCuration, type CurationFile, type CurationRecord, type Flag } from './curation';

export type FlatRecord = {
  folderPath: string;
  key: string;
  record: CurationRecord;
};

export type AllFlaggedReturn = {
  records: FlatRecord[];
  setFlag: (folderPath: string, recordKey: string, value: Flag | undefined) => void;
  reload: () => Promise<void>;
  flush: () => Promise<void>;
  loading: boolean;
};

function flatten(files: CurationFile[]): FlatRecord[] {
  const result: FlatRecord[] = [];
  const sorted = [...files].sort((a, b) => a.folderPath.localeCompare(b.folderPath));
  for (const file of sorted) {
    const recs = Object.entries(file.records)
      .filter(([, r]) => r.flag !== undefined)
      .sort(([, a], [, b]) => a.name.localeCompare(b.name));
    for (const [key, record] of recs) {
      result.push({ folderPath: file.folderPath, key, record });
    }
  }
  return result;
}

export function useAllFlagged(): AllFlaggedReturn {
  const [records, setRecords] = useState<FlatRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const filesRef = useRef<Map<string, CurationFile['records']>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const flush = useCallback((): Promise<void> => {
    const writes: Promise<void>[] = [];
    for (const [folderPath, timer] of timersRef.current) {
      clearTimeout(timer);
      const recs = filesRef.current.get(folderPath);
      if (recs !== undefined) {
        writes.push(writeCuration({ folderPath, records: recs }));
      }
    }
    timersRef.current.clear();
    return Promise.all(writes).then(() => undefined);
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

  const setFlag = useCallback((folderPath: string, recordKey: string, value: Flag | undefined) => {
    const current = filesRef.current.get(folderPath) ?? {};
    const next = { ...current };
    if (value === undefined) {
      delete next[recordKey];
    } else {
      const existing = next[recordKey];
      if (!existing) return;
      next[recordKey] = { ...existing, flag: value };
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
