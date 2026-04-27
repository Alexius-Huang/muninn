import { useCallback, useEffect, useRef, useState } from 'react';
import { listCuration, type CurationFile } from './curation';
import type { FlatRecord } from './useAllFlagged';

export type GroupedReturn = {
  recordsByGroupId: Map<string, FlatRecord[]>;
  reload: () => Promise<void>;
  flush: () => Promise<void>;
  loading: boolean;
};

function groupByGroupId(files: CurationFile[]): Map<string, FlatRecord[]> {
  const map = new Map<string, FlatRecord[]>();
  for (const file of files) {
    for (const [key, record] of Object.entries(file.records)) {
      if (!record.groupId) continue;
      const bucket = map.get(record.groupId) ?? [];
      bucket.push({ folderPath: file.folderPath, key, record });
      map.set(record.groupId, bucket);
    }
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => a.record.name.localeCompare(b.record.name));
  }
  return map;
}

export function useGroupedRecords(): GroupedReturn {
  const [recordsByGroupId, setRecordsByGroupId] = useState<Map<string, FlatRecord[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const filesRef = useRef<CurationFile[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const files = await listCuration();
      filesRef.current = files;
      setRecordsByGroupId(groupByGroupId(files));
    } finally {
      setLoading(false);
    }
  }, []);

  const flush = useCallback((): Promise<void> => Promise.resolve(), []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { recordsByGroupId, reload, flush, loading };
}
