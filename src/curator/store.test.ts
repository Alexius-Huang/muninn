// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import type { CurationFile } from './curation';

const mockListCuration = vi.fn();
const mockWriteCuration = vi.fn();
const mockReadGroups = vi.fn();
const mockCreateGroupAndPersist = vi.fn();
const mockDeleteGroupAndCascade = vi.fn();
const mockGetThumbnailBatch = vi.fn();

vi.mock('./curation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./curation')>();
  return {
    ...actual,
    listCuration: (...args: unknown[]) => mockListCuration(...args),
    writeCuration: (...args: unknown[]) => mockWriteCuration(...args),
  };
});

vi.mock('./groups', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./groups')>();
  return {
    ...actual,
    readGroups: (...args: unknown[]) => mockReadGroups(...args),
    createGroupAndPersist: (...args: unknown[]) => mockCreateGroupAndPersist(...args),
    deleteGroupAndCascade: (...args: unknown[]) => mockDeleteGroupAndCascade(...args),
  };
});

vi.mock('../dropbox/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dropbox/client')>();
  return {
    ...actual,
    getThumbnailBatch: (...args: unknown[]) => mockGetThumbnailBatch(...args),
  };
});

import { useAppStore, _resetStoreForTesting, createThumbnailCache } from './store';

function makeFlaggedFile(
  folderPath: string,
  entries: Array<{ pathLower: string; name: string; flag: 'keep' | 'discard' }>,
): CurationFile {
  const records: CurationFile['records'] = {};
  for (const e of entries) {
    records[e.pathLower] = { pathLower: e.pathLower, pathDisplay: e.pathLower, name: e.name, flag: e.flag };
  }
  return { folderPath, records };
}

function makeGroupedFile(
  folderPath: string,
  entries: Array<{ key: string; name: string; groupId: string }>,
): CurationFile {
  const records: CurationFile['records'] = {};
  for (const e of entries) {
    records[e.key] = { pathLower: e.key, pathDisplay: e.key, name: e.name, groupId: e.groupId };
  }
  return { folderPath, records };
}

beforeEach(() => {
  vi.useFakeTimers();
  _resetStoreForTesting();
  mockListCuration.mockReset();
  mockWriteCuration.mockReset();
  mockReadGroups.mockReset();
  mockCreateGroupAndPersist.mockReset();
  mockDeleteGroupAndCascade.mockReset();
  mockGetThumbnailBatch.mockReset();
  mockListCuration.mockResolvedValue([]);
  mockWriteCuration.mockResolvedValue(undefined);
  mockReadGroups.mockResolvedValue([]);
  mockCreateGroupAndPersist.mockResolvedValue({ id: 'g1', name: 'Test', lat: 0, lng: 0, photoIds: [] });
  mockDeleteGroupAndCascade.mockResolvedValue(undefined);
  mockGetThumbnailBatch.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

describe('useAppStore — groups', () => {
  it('hydrates groups via loadGroups', async () => {
    const group = { id: 'g1', name: 'Paris', lat: 48, lng: 2, photoIds: [] };
    mockReadGroups.mockResolvedValue([group]);
    await act(async () => { await useAppStore.getState().loadGroups(); });
    expect(useAppStore.getState().groups).toEqual([group]);
  });

  it('appends a group via createGroup and reloads grouped records', async () => {
    const newGroup = { id: 'g1', name: 'Lyon', lat: 45, lng: 4, photoIds: ['k1'] };
    mockCreateGroupAndPersist.mockResolvedValue(newGroup);
    mockReadGroups.mockResolvedValue([newGroup]);
    mockListCuration.mockResolvedValue([
      makeGroupedFile('/Photos/Lyon', [{ key: 'k1', name: 'a.jpg', groupId: 'g1' }]),
    ]);

    const loc = { lat: 45, lng: 4, placeId: 'p1', displayName: 'Lyon, France', name: 'Lyon, France' };
    await act(async () => {
      await useAppStore.getState().createGroup({
        name: 'Lyon',
        location: loc,
        photos: [{ folderPath: '/Photos/Lyon', key: 'k1' }],
      });
    });

    expect(useAppStore.getState().groups).toEqual([newGroup]);
    expect(useAppStore.getState().recordsByGroupId.has('g1')).toBe(true);
  });

  it('removes a group via deleteGroup and clears its bucket from recordsByGroupId', async () => {
    useAppStore.setState({
      groups: [{ id: 'g1', name: 'Paris', lat: 48, lng: 2, photoIds: [] }],
      recordsByGroupId: new Map([['g1', []]]),
    });
    mockReadGroups.mockResolvedValue([]);
    mockListCuration.mockResolvedValue([]);

    await act(async () => { await useAppStore.getState().deleteGroup('g1'); });

    expect(mockDeleteGroupAndCascade).toHaveBeenCalledWith('g1');
    expect(useAppStore.getState().groups).toEqual([]);
    expect(useAppStore.getState().recordsByGroupId.has('g1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Flagged records
// ---------------------------------------------------------------------------

describe('useAppStore — flagged', () => {
  it('hydrates flaggedRecords via loadFlagged', async () => {
    mockListCuration.mockResolvedValue([
      makeFlaggedFile('/Photos/Lyon', [{ pathLower: '/photos/lyon/a.jpg', name: 'a.jpg', flag: 'keep' }]),
      makeFlaggedFile('/Photos/Paris', [{ pathLower: '/photos/paris/b.jpg', name: 'b.jpg', flag: 'discard' }]),
    ]);
    await act(async () => { await useAppStore.getState().loadFlagged(); });
    expect(useAppStore.getState().flaggedRecords).toHaveLength(2);
    expect(useAppStore.getState().flaggedRecords[0].folderPath).toBe('/Photos/Lyon');
    expect(useAppStore.getState().flaggedRecords[1].folderPath).toBe('/Photos/Paris');
  });

  it('updates flaggedRecords synchronously on setFlaggedFlag and debounces disk write', async () => {
    mockListCuration.mockResolvedValue([
      makeFlaggedFile('/Photos/Lyon', [{ pathLower: '/photos/lyon/a.jpg', name: 'a.jpg', flag: 'keep' }]),
    ]);
    await act(async () => { await useAppStore.getState().loadFlagged(); });

    act(() => { useAppStore.getState().setFlaggedFlag('/Photos/Lyon', '/photos/lyon/a.jpg', 'discard'); });

    const rec = useAppStore.getState().flaggedRecords.find((r) => r.record.pathLower === '/photos/lyon/a.jpg');
    expect(rec?.record.flag).toBe('discard');
    expect(mockWriteCuration).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(250); });
    expect(mockWriteCuration).toHaveBeenCalledOnce();
  });

  it('removes flag entries on setFlaggedFlag(undefined)', async () => {
    mockListCuration.mockResolvedValue([
      makeFlaggedFile('/Photos/Lyon', [{ pathLower: '/photos/lyon/a.jpg', name: 'a.jpg', flag: 'keep' }]),
    ]);
    await act(async () => { await useAppStore.getState().loadFlagged(); });

    act(() => { useAppStore.getState().setFlaggedFlag('/Photos/Lyon', '/photos/lyon/a.jpg', undefined); });

    const rec = useAppStore.getState().flaggedRecords.find((r) => r.record.pathLower === '/photos/lyon/a.jpg');
    expect(rec).toBeUndefined();
  });

  it('empties flaggedRecords on clearAllFlagged and writes empty curation per folder', async () => {
    mockListCuration.mockResolvedValue([
      makeFlaggedFile('/Photos/Lyon', [{ pathLower: '/photos/lyon/a.jpg', name: 'a.jpg', flag: 'keep' }]),
    ]);
    await act(async () => { await useAppStore.getState().loadFlagged(); });
    expect(useAppStore.getState().flaggedRecords).toHaveLength(1);

    act(() => { useAppStore.getState().clearAllFlagged(); });

    expect(useAppStore.getState().flaggedRecords).toHaveLength(0);
    expect(mockWriteCuration).toHaveBeenCalledWith({ folderPath: '/Photos/Lyon', records: {} });
  });

  it('transitions records to grouped state on assignGroupId (clears flag, sets groupId)', async () => {
    mockListCuration.mockResolvedValue([
      makeFlaggedFile('/Photos/Lyon', [{ pathLower: '/photos/lyon/a.jpg', name: 'a.jpg', flag: 'keep' }]),
    ]);
    await act(async () => { await useAppStore.getState().loadFlagged(); });
    expect(useAppStore.getState().flaggedRecords).toHaveLength(1);

    await act(async () => {
      await useAppStore.getState().assignGroupId(
        [{ folderPath: '/Photos/Lyon', key: '/photos/lyon/a.jpg' }],
        'g1',
      );
    });

    // Photo now has groupId, so it's no longer in flaggedRecords (which only includes flag !== undefined)
    expect(useAppStore.getState().flaggedRecords).toHaveLength(0);
    expect(mockWriteCuration).toHaveBeenCalledOnce();
    const writeCall = mockWriteCuration.mock.calls[0][0] as { folderPath: string; records: Record<string, unknown> };
    expect(writeCall.records['/photos/lyon/a.jpg']).toMatchObject({ groupId: 'g1' });
  });
});

// ---------------------------------------------------------------------------
// Grouped records
// ---------------------------------------------------------------------------

describe('useAppStore — grouped records', () => {
  it('hydrates recordsByGroupId via loadGrouped', async () => {
    mockListCuration.mockResolvedValue([
      makeGroupedFile('/Photos/Lyon', [
        { key: '/photos/lyon/a.jpg', name: 'a.jpg', groupId: 'g1' },
        { key: '/photos/lyon/b.jpg', name: 'b.jpg', groupId: 'g1' },
      ]),
    ]);
    await act(async () => { await useAppStore.getState().loadGrouped(); });
    const bucket = useAppStore.getState().recordsByGroupId.get('g1');
    expect(bucket).toHaveLength(2);
  });

  it('reflects deleteGroup cascade in flaggedRecords if any member was still flagged', async () => {
    useAppStore.setState({
      groups: [{ id: 'g1', name: 'Paris', lat: 48, lng: 2, photoIds: [] }],
    });
    mockListCuration.mockResolvedValue([
      makeFlaggedFile('/Photos/Lyon', [{ pathLower: '/photos/lyon/a.jpg', name: 'a.jpg', flag: 'keep' }]),
    ]);
    mockReadGroups.mockResolvedValue([]);

    await act(async () => { await useAppStore.getState().loadFlagged(); });
    expect(useAppStore.getState().flaggedRecords).toHaveLength(1);

    // After delete, disk has no flagged records
    mockListCuration.mockResolvedValue([]);

    await act(async () => { await useAppStore.getState().deleteGroup('g1'); });

    expect(useAppStore.getState().flaggedRecords).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

describe('useAppStore — cache', () => {
  it('exposes a stable ThumbnailCache instance', () => {
    const cache1 = useAppStore.getState().cache;
    const cache2 = useAppStore.getState().cache;
    expect(cache1).toBe(cache2);
  });

  it('createThumbnailCache returns loading state for unseen paths', () => {
    const cache = createThumbnailCache();
    expect(cache.peek('/photos/a.jpg')).toEqual({ tag: 'loading' });
  });

  it('createThumbnailCache subscribes and notifies on success', async () => {
    const cache = createThumbnailCache();
    mockGetThumbnailBatch.mockResolvedValue([
      { tag: 'success', path_lower: '/photos/a.jpg', dataUrl: 'data:image/jpeg;base64,abc' },
    ]);
    const cb = vi.fn();
    cache.subscribe('/photos/a.jpg', cb);

    cache.request('/Photos/a.jpg');
    await act(async () => { await Promise.resolve(); }); // flush microtask
    await act(async () => {}); // flush promises

    expect(cb).toHaveBeenCalled();
    expect(cache.peek('/photos/a.jpg')).toEqual({ tag: 'success', dataUrl: 'data:image/jpeg;base64,abc' });
  });
});
