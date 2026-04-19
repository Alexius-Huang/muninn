import { useCallback, useEffect, useRef, useState } from 'react';
import { readCuration, writeCuration, type CurationFlags, type Flag } from './curation';

export function useCurationState(folderPath: string | null): {
  flags: CurationFlags;
  setFlag: (pathLower: string, value: Flag | undefined) => void;
} {
  const [flags, setFlags] = useState<CurationFlags>({});
  const flagsRef = useRef<CurationFlags>({});
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
    writeCuration({ folderPath: folderPathRef.current, flags: flagsRef.current });
  }, []);

  useEffect(() => {
    // flush pending write from previous folder before switching
    flush();
    folderPathRef.current = folderPath;
    flagsRef.current = {};
    setFlags({});
    dirtyRef.current = false;

    if (!folderPath) return;
    let cancelled = false;
    readCuration(folderPath).then((file) => {
      if (cancelled) return;
      const loaded = file?.flags ?? {};
      flagsRef.current = loaded;
      setFlags(loaded);
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

  const setFlag = useCallback((pathLower: string, value: Flag | undefined) => {
    const next = { ...flagsRef.current };
    if (value === undefined) {
      delete next[pathLower];
    } else {
      next[pathLower] = value;
    }
    flagsRef.current = next;
    setFlags({ ...flagsRef.current });
    dirtyRef.current = true;

    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      dirtyRef.current = false;
      if (folderPathRef.current) {
        writeCuration({ folderPath: folderPathRef.current, flags: flagsRef.current });
      }
    }, 250);
  }, []);

  return { flags, setFlag };
}
