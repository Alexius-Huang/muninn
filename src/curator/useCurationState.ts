import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readCuration, writeCuration, migrateToIdKeys, applyFlag, applyGroupId, type CurationFile, type Flag } from './curation';
import type { DropboxFile } from '../dropbox/client';

export type CurationStateReturn = {
  flags: Record<string, Flag>;
  groupIds: Record<string, string>;
  setFlag: (file: DropboxFile, value: Flag | undefined) => void;
  removeFromGroup: (file: DropboxFile) => void;
  clearAll: () => void;
  flush: () => Promise<void>;
  reload: () => Promise<void>;
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
    const next = applyFlag(recordsRef.current, file, value);
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

  const removeFromGroup = useCallback((file: DropboxFile) => {
    const next = applyGroupId(recordsRef.current, file, undefined);
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

  const reload = useCallback(async (): Promise<void> => {
    const folderPath = folderPathRef.current;
    if (!folderPath) return;
    await flush();
    const file = await readCuration(folderPath);
    let loaded = file?.records ?? {};
    if (filesRef.current.length > 0 && file) {
      const result = migrateToIdKeys({ folderPath, records: loaded }, filesRef.current);
      if (result.changed) {
        loaded = result.file.records;
        void writeCuration({ folderPath, records: loaded });
      }
    }
    recordsRef.current = loaded;
    setRecords(loaded);
  }, [flush]);

  const flags = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(records)
          .filter(([, r]) => r.flag !== undefined)
          .map(([k, r]) => [k, r.flag as Flag]),
      ),
    [records],
  );

  const groupIds = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(records)
          .filter(([, r]) => r.groupId !== undefined)
          .map(([k, r]) => [k, r.groupId as string]),
      ),
    [records],
  );

  return { flags, groupIds, setFlag, removeFromGroup, clearAll, flush, reload };
}
