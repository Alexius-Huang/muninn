import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readCuration, writeCuration, migrateToIdKeys, type CurationFile, type CurationRecord, type Flag } from './curation';
import type { DropboxFile } from '../dropbox/client';

export type CurationStateReturn = {
  flags: Record<string, Flag>;
  setFlag: (file: DropboxFile, value: Flag | undefined) => void;
  clearAll: () => void;
  flush: () => Promise<void>;
};

export function useCurationState(folderPath: string | null, files: DropboxFile[]): CurationStateReturn {
  const [records, setRecords] = useState<CurationFile['records']>({});
  const recordsRef = useRef<CurationFile['records']>({});
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const folderPathRef = useRef(folderPath);
  const filesRef = useRef<DropboxFile[]>(files);

  useEffect(() => {
    filesRef.current = files;
  });

  const flush = useCallback((): Promise<void> => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!dirtyRef.current || !folderPathRef.current) return Promise.resolve();
    dirtyRef.current = false;
    return writeCuration({ folderPath: folderPathRef.current, records: recordsRef.current });
  }, []);

  useEffect(() => {
    flush();
    folderPathRef.current = folderPath;
    recordsRef.current = {};
    setRecords({});
    dirtyRef.current = false;

    if (!folderPath) return;
    let cancelled = false;
    readCuration(folderPath).then((file) => {
      if (cancelled) return;
      let loaded = file?.records ?? {};
      if (filesRef.current.length > 0 && file) {
        const result = migrateToIdKeys({ folderPath, records: loaded }, filesRef.current);
        if (result.changed) {
          loaded = result.file.records;
          if (result.droppedCount > 0) {
            console.warn(`[muninn] migrateToIdKeys: dropped ${result.droppedCount} orphan record(s) for ${folderPath}`);
          }
          void writeCuration({ folderPath, records: loaded });
        }
      }
      recordsRef.current = loaded;
      setRecords(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [folderPath, flush]);

  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  const clearAll = useCallback((): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    recordsRef.current = {};
    setRecords({});
    if (folderPathRef.current) {
      void writeCuration({ folderPath: folderPathRef.current, records: {} });
    }
  }, []);

  const setFlag = useCallback((file: DropboxFile, value: Flag | undefined) => {
    const next = { ...recordsRef.current };
    if (value === undefined) {
      delete next[file.id];
    } else {
      const existing = recordsRef.current[file.id];
      next[file.id] = {
        photoId: file.id,
        pathLower: file.path_lower,
        pathDisplay: file.path_display,
        name: file.name,
        flag: value,
        capturedAt: existing?.capturedAt ?? file.media_info?.metadata?.time_taken ?? file.client_modified,
      } satisfies CurationRecord;
    }
    recordsRef.current = next;
    setRecords({ ...recordsRef.current });
    dirtyRef.current = true;

    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      dirtyRef.current = false;
      if (folderPathRef.current) {
        writeCuration({ folderPath: folderPathRef.current, records: recordsRef.current });
      }
    }, 250);
  }, []);

  const flags = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(records).map(([k, r]) => [k, r.flag]),
      ) as Record<string, Flag>,
    [records],
  );

  return { flags, setFlag, clearAll, flush };
}
