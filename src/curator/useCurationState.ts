import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readCuration, writeCuration, type CurationFile, type CurationRecord, type Flag } from './curation';
import type { DropboxFile } from '../dropbox/client';

export type CurationStateReturn = {
  flags: Record<string, Flag>;
  setFlag: (file: DropboxFile, value: Flag | undefined) => void;
  flush: () => void;
};

export function useCurationState(folderPath: string | null): CurationStateReturn {
  const [records, setRecords] = useState<CurationFile['records']>({});
  const recordsRef = useRef<CurationFile['records']>({});
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const folderPathRef = useRef(folderPath);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!dirtyRef.current || !folderPathRef.current) return;
    dirtyRef.current = false;
    writeCuration({ folderPath: folderPathRef.current, records: recordsRef.current });
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
      const loaded = file?.records ?? {};
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

  const setFlag = useCallback((file: DropboxFile, value: Flag | undefined) => {
    const next = { ...recordsRef.current };
    if (value === undefined) {
      delete next[file.path_lower];
    } else {
      next[file.path_lower] = {
        pathLower: file.path_lower,
        pathDisplay: file.path_display,
        name: file.name,
        flag: value,
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

  return { flags, setFlag, flush };
}
