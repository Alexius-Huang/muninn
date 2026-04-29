import { create } from 'zustand';
import { getThumbnailBatch } from '../dropbox/client';
import { listCuration, writeCuration, transitionToGroup, type CurationFile, type CurationRecord, type Flag } from './curation';
import { readGroups, createGroupAndPersist, deleteGroupAndCascade } from './groups';
import type { Group } from './groups';
import type { NominatimLocation } from '@/components/NominatimSearch';

// ---------------------------------------------------------------------------
// Thumbnail cache
// ---------------------------------------------------------------------------

export type ThumbnailState =
  | { tag: 'loading' }
  | { tag: 'success'; dataUrl: string }
  | { tag: 'error' };

export type ThumbnailCache = {
  request: (pathDisplay: string) => ThumbnailState;
  subscribe: (pathLower: string, cb: () => void) => () => void;
  peek: (pathLower: string) => ThumbnailState;
};

const DEFAULT_LOADING: ThumbnailState = { tag: 'loading' };

export function createThumbnailCache(): ThumbnailCache {
  const cacheMap = new Map<string, ThumbnailState>();
  const subsMap = new Map<string, Set<() => void>>();
  const pending = new Set<string>();
  let scheduled = false;

  function notify(pathLower: string) {
    subsMap.get(pathLower)?.forEach((cb) => cb());
  }

  function flush() {
    scheduled = false;
    const all = [...pending];
    pending.clear();
    if (all.length === 0) return;

    for (let i = 0; i < all.length; i += 25) {
      const chunk = all.slice(i, i + 25);
      getThumbnailBatch(chunk).then(
        (results) => {
          for (const r of results) {
            if (r.tag === 'success') {
              cacheMap.set(r.path_lower, { tag: 'success', dataUrl: r.dataUrl });
              notify(r.path_lower);
            } else {
              cacheMap.set(r.path_lower, { tag: 'error' });
              notify(r.path_lower);
            }
          }
        },
        () => {
          for (const p of chunk) {
            const key = p.toLowerCase();
            cacheMap.set(key, { tag: 'error' });
            notify(key);
          }
        },
      );
    }
  }

  function request(pathDisplay: string): ThumbnailState {
    const key = pathDisplay.toLowerCase();
    const existing = cacheMap.get(key);
    if (existing) return existing;

    cacheMap.set(key, { tag: 'loading' });
    pending.add(pathDisplay);

    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }

    return { tag: 'loading' };
  }

  function subscribe(pathLower: string, cb: () => void): () => void {
    if (!subsMap.has(pathLower)) subsMap.set(pathLower, new Set());
    subsMap.get(pathLower)!.add(cb);
    return () => { subsMap.get(pathLower)?.delete(cb); };
  }

  function peek(pathLower: string): ThumbnailState {
    return cacheMap.get(pathLower) ?? DEFAULT_LOADING;
  }

  return { request, subscribe, peek };
}

// ---------------------------------------------------------------------------
// FlatRecord type (was in useAllFlagged.ts)
// ---------------------------------------------------------------------------

export type FlatRecord = { folderPath: string; key: string; record: CurationRecord };

// ---------------------------------------------------------------------------
// Flatten helper (was in useAllFlagged.ts)
// ---------------------------------------------------------------------------

function flattenFlagged(files: CurationFile[]): FlatRecord[] {
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

// ---------------------------------------------------------------------------
// Grouped helper (was in useGroupedRecords.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type AppStore = {
  // groups
  groups: Group[];
  loadGroups: () => Promise<void>;
  createGroup: (args: {
    name: string;
    location: NominatimLocation;
    photos: { folderPath: string; key: string }[];
  }) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;

  // grouped records (groupId → photos)
  recordsByGroupId: Map<string, FlatRecord[]>;
  groupedLoading: boolean;
  loadGrouped: () => Promise<void>;
  flushGrouped: () => Promise<void>;

  // cross-folder flagged records
  flaggedRecords: FlatRecord[];
  flaggedLoading: boolean;
  loadFlagged: () => Promise<void>;
  flushFlagged: () => Promise<void>;
  setFlaggedFlag: (folderPath: string, key: string, value: Flag | undefined) => void;
  clearAllFlagged: () => void;
  assignGroupId: (photos: { folderPath: string; key: string }[], groupId: string) => Promise<void>;

  // thumbnail cache (non-reactive instance)
  cache: ThumbnailCache;
};

// Mutable state that lives outside the Zustand reactive graph — same semantics
// as useRef in the hook variants, but closed over by the action implementations.
let flaggedFiles = new Map<string, CurationFile['records']>();
let flaggedTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useAppStore = create<AppStore>((set, get) => ({
  // ---------------------------------------------------------------------------
  // Groups
  // ---------------------------------------------------------------------------
  groups: [],

  async loadGroups() {
    const groups = await readGroups();
    set({ groups });
  },

  async createGroup({ name, location, photos }) {
    const group = await createGroupAndPersist({
      name,
      lat: location.lat,
      lng: location.lng,
      placeId: location.placeId,
      locationName: location.displayName,
      photoIds: photos.map((p) => p.key),
    });
    await get().assignGroupId(photos, group.id);
    await get().loadGroups();
    await get().loadGrouped();
  },

  async deleteGroup(id) {
    await deleteGroupAndCascade(id);
    await Promise.all([
      get().loadGroups(),
      get().loadGrouped(),
      get().loadFlagged(),
    ]);
  },

  // ---------------------------------------------------------------------------
  // Grouped records
  // ---------------------------------------------------------------------------
  recordsByGroupId: new Map(),
  groupedLoading: false,

  async loadGrouped() {
    set({ groupedLoading: true });
    try {
      const files = await listCuration();
      set({ recordsByGroupId: groupByGroupId(files) });
    } finally {
      set({ groupedLoading: false });
    }
  },

  flushGrouped: async () => { /* no-op — grouped records have no pending writes */ },

  // ---------------------------------------------------------------------------
  // Flagged records
  // ---------------------------------------------------------------------------
  flaggedRecords: [],
  flaggedLoading: false,

  async loadFlagged() {
    set({ flaggedLoading: true });
    try {
      const files = await listCuration();
      const diskPaths = new Set(files.map((f) => f.folderPath));

      // Overlay in-memory writes on top of disk data
      for (const file of files) {
        if (flaggedTimers.has(file.folderPath)) {
          const inMemory = flaggedFiles.get(file.folderPath);
          if (inMemory !== undefined) file.records = inMemory;
        }
      }

      // Preserve in-memory-only folders not yet flushed to disk
      for (const [folderPath, recs] of flaggedFiles) {
        if (!diskPaths.has(folderPath) && flaggedTimers.has(folderPath)) {
          files.push({ folderPath, records: recs });
        }
      }

      flaggedFiles = new Map(files.map((f) => [f.folderPath, f.records]));
      set({ flaggedRecords: flattenFlagged(files) });
    } finally {
      set({ flaggedLoading: false });
    }
  },

  async flushFlagged() {
    const writes: Promise<void>[] = [];
    for (const [folderPath, timer] of flaggedTimers) {
      clearTimeout(timer);
      const recs = flaggedFiles.get(folderPath);
      if (recs !== undefined) writes.push(writeCuration({ folderPath, records: recs }));
    }
    flaggedTimers.clear();
    await Promise.all(writes);
  },

  setFlaggedFlag(folderPath, key, value) {
    const current = flaggedFiles.get(folderPath) ?? {};
    const next = { ...current };
    if (value === undefined) {
      delete next[key];
    } else {
      const existing = next[key];
      if (!existing) return;
      next[key] = { ...existing, flag: value };
    }
    flaggedFiles.set(folderPath, next);

    const allFiles: CurationFile[] = [];
    for (const [fp, recs] of flaggedFiles) allFiles.push({ folderPath: fp, records: recs });
    set({ flaggedRecords: flattenFlagged(allFiles) });

    const existing = flaggedTimers.get(folderPath);
    if (existing !== undefined) clearTimeout(existing);
    const timer = setTimeout(() => {
      flaggedTimers.delete(folderPath);
      void writeCuration({ folderPath, records: next });
    }, 250);
    flaggedTimers.set(folderPath, timer);
  },

  clearAllFlagged() {
    for (const timer of flaggedTimers.values()) clearTimeout(timer);
    flaggedTimers.clear();
    for (const [folderPath, recs] of flaggedFiles) {
      if (Object.keys(recs).length > 0) {
        void writeCuration({ folderPath, records: {} });
      }
    }
    flaggedFiles = new Map(Array.from(flaggedFiles.keys()).map((fp) => [fp, {}]));
    set({ flaggedRecords: [] });
  },

  async assignGroupId(photos, groupId) {
    const byFolder = new Map<string, string[]>();
    for (const { folderPath, key } of photos) {
      const keys = byFolder.get(folderPath) ?? [];
      keys.push(key);
      byFolder.set(folderPath, keys);
    }

    const writes: Promise<void>[] = [];
    for (const [folderPath, keys] of byFolder) {
      const existing = flaggedTimers.get(folderPath);
      if (existing !== undefined) {
        clearTimeout(existing);
        flaggedTimers.delete(folderPath);
      }
      let recs = flaggedFiles.get(folderPath) ?? {};
      for (const key of keys) recs = transitionToGroup(recs, key, groupId);
      flaggedFiles.set(folderPath, recs);
      writes.push(writeCuration({ folderPath, records: recs }));
    }
    await Promise.all(writes);

    const allFiles: CurationFile[] = [];
    for (const [fp, recs] of flaggedFiles) allFiles.push({ folderPath: fp, records: recs });
    set({ flaggedRecords: flattenFlagged(allFiles) });
  },

  // ---------------------------------------------------------------------------
  // Cache
  // ---------------------------------------------------------------------------
  cache: createThumbnailCache(),
}));

export function _resetStoreForTesting() {
  for (const t of flaggedTimers.values()) clearTimeout(t);
  flaggedFiles = new Map();
  flaggedTimers = new Map();
  useAppStore.setState({
    groups: [],
    recordsByGroupId: new Map(),
    groupedLoading: false,
    flaggedRecords: [],
    flaggedLoading: false,
    cache: createThumbnailCache(),
  });
}

