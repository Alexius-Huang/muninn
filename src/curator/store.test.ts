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
const mockGetCfAuth = vi.fn();
const mockRunCreateGroupTransaction = vi.fn();
const mockCreateD1Client = vi.fn(() => ({ query: vi.fn() }));
const mockCreateR2Client = vi.fn(() => ({ putObject: vi.fn(), getObject: vi.fn(), deleteObject: vi.fn() }));
const mockPersistGroup = vi.fn();

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
    persistGroup: (...args: unknown[]) => mockPersistGroup(...args),
  };
});

vi.mock('../dropbox/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dropbox/client')>();
  return {
    ...actual,
    getThumbnailBatch: (...args: unknown[]) => mockGetThumbnailBatch(...args),
  };
});

vi.mock('../cloud/cfAuth', () => ({
  getCfAuth: (...args: unknown[]) => mockGetCfAuth(...args),
}));

vi.mock('../cloud/createGroupOrchestrator', () => ({
  runCreateGroupTransaction: (...args: unknown[]) => mockRunCreateGroupTransaction(...args),
}));

vi.mock('../cloud/d1Client', () => ({
  createD1Client: (...args: unknown[]) => mockCreateD1Client(...args),
}));

vi.mock('../cloud/r2Client', () => ({
  createR2Client: (...args: unknown[]) => mockCreateR2Client(...args),
}));

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
  mockGetCfAuth.mockReset();
  mockRunCreateGroupTransaction.mockReset();
  mockPersistGroup.mockReset();
  mockListCuration.mockResolvedValue([]);
  mockWriteCuration.mockResolvedValue(undefined);
  mockReadGroups.mockResolvedValue([]);
  mockCreateGroupAndPersist.mockResolvedValue({ id: 'g1', name: 'Test', lat: 0, lng: 0, photoIds: [] });
  mockDeleteGroupAndCascade.mockResolvedValue(undefined);
  mockGetThumbnailBatch.mockResolvedValue([]);
  mockGetCfAuth.mockResolvedValue(null);
  mockRunCreateGroupTransaction.mockResolvedValue(undefined);
  mockPersistGroup.mockResolvedValue(undefined);
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

  const mockCfAuth = {
    accountId: 'acct', d1ApiToken: 'tok', d1DatabaseId: 'db',
    r2AccessKeyId: 'key', r2SecretAccessKey: 'secret', r2Bucket: 'bucket',
  };

  const makeFlatKeep = (folderPath: string, key: string, name: string, pathDisplay?: string) => ({
    folderPath,
    key,
    record: { pathLower: key, pathDisplay: pathDisplay ?? `${folderPath}/${name}`, name, flag: 'keep' as const },
  });

  it('should throw "Cloudflare credentials not configured" when cfAuth is null', async () => {
    const loc = { lat: 45, lng: 4, placeId: 'p1', displayName: 'Lyon, France', name: 'Lyon, France' };
    await expect(
      act(async () => {
        await useAppStore.getState().createGroup({
          name: 'Lyon', location: loc, photos: [{ folderPath: '/Photos/Lyon', key: 'k1' }],
        });
      }),
    ).rejects.toThrow('Cloudflare credentials not configured');
    expect(mockRunCreateGroupTransaction).not.toHaveBeenCalled();
  });

  it('should call runCreateGroupTransaction with a fresh-UUID group when cfAuth is present', async () => {
    useAppStore.setState({
      cfAuth: mockCfAuth,
      flaggedRecords: [makeFlatKeep('/Photos/Lyon', 'k1', 'a.jpg')],
    });
    const loc = { lat: 45, lng: 4, placeId: 'p1', displayName: 'Lyon, France', name: 'Lyon, France' };
    await act(async () => {
      await useAppStore.getState().createGroup({
        name: 'Lyon', location: loc, photos: [{ folderPath: '/Photos/Lyon', key: 'k1' }],
      });
    });
    expect(mockRunCreateGroupTransaction).toHaveBeenCalledOnce();
    const [group] = mockRunCreateGroupTransaction.mock.calls[0] as [{ id: string; name: string }];
    expect(group.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(group.name).toBe('Lyon');
  });

  it('should generate distinct UUIDs per photo (not reuse input keys)', async () => {
    useAppStore.setState({
      cfAuth: mockCfAuth,
      flaggedRecords: [
        makeFlatKeep('/Photos/Lyon', 'k1', 'a.jpg'),
        makeFlatKeep('/Photos/Lyon', 'k2', 'b.jpg'),
        makeFlatKeep('/Photos/Lyon', 'k3', 'c.jpg'),
      ],
    });
    const loc = { lat: 45, lng: 4, placeId: 'p1', displayName: 'Lyon, France', name: 'Lyon, France' };
    await act(async () => {
      await useAppStore.getState().createGroup({
        name: 'Lyon', location: loc,
        photos: [
          { folderPath: '/Photos/Lyon', key: 'k1' },
          { folderPath: '/Photos/Lyon', key: 'k2' },
          { folderPath: '/Photos/Lyon', key: 'k3' },
        ],
      });
    });
    const photoRows = (mockRunCreateGroupTransaction.mock.calls[0] as [unknown, { id: string }[]])[1];
    const ids = photoRows.map((r) => r.id);
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) {
      expect(id).toMatch(uuidRe);
      expect(['k1', 'k2', 'k3']).not.toContain(id);
    }
  });

  it("should pass each photo's pathDisplay through to the orchestrator's photoRows", async () => {
    useAppStore.setState({
      cfAuth: mockCfAuth,
      flaggedRecords: [
        makeFlatKeep('/Photos/Lyon', 'k1', 'a.jpg', '/Photos/Lyon/a.jpg'),
        makeFlatKeep('/Photos/Lyon', 'k2', 'b.jpg', '/Photos/Lyon/b.jpg'),
      ],
    });
    const loc = { lat: 45, lng: 4, placeId: 'p1', displayName: 'Lyon, France', name: 'Lyon, France' };
    await act(async () => {
      await useAppStore.getState().createGroup({
        name: 'Lyon', location: loc,
        photos: [
          { folderPath: '/Photos/Lyon', key: 'k1' },
          { folderPath: '/Photos/Lyon', key: 'k2' },
        ],
      });
    });
    const photoRows = (mockRunCreateGroupTransaction.mock.calls[0] as [unknown, { dropboxPath: string }[]])[1];
    expect(photoRows[0].dropboxPath).toBe('/Photos/Lyon/a.jpg');
    expect(photoRows[1].dropboxPath).toBe('/Photos/Lyon/b.jpg');
  });

  it("should bubble the orchestrator's error message verbatim", async () => {
    useAppStore.setState({
      cfAuth: mockCfAuth,
      flaggedRecords: [makeFlatKeep('/Photos/Lyon', 'k1', 'a.jpg')],
    });
    mockRunCreateGroupTransaction.mockRejectedValue(new Error('R2 503'));
    const loc = { lat: 45, lng: 4, placeId: 'p1', displayName: 'Lyon, France', name: 'Lyon, France' };
    await expect(
      act(async () => {
        await useAppStore.getState().createGroup({
          name: 'Lyon', location: loc, photos: [{ folderPath: '/Photos/Lyon', key: 'k1' }],
        });
      }),
    ).rejects.toThrow('R2 503');
  });

  it('should throw a descriptive error when a photo is not in the flaggedRecords snapshot', async () => {
    useAppStore.setState({
      cfAuth: mockCfAuth,
      flaggedRecords: [],
    });
    const loc = { lat: 45, lng: 4, placeId: 'p1', displayName: 'Lyon, France', name: 'Lyon, France' };
    await expect(
      act(async () => {
        await useAppStore.getState().createGroup({
          name: 'Lyon', location: loc,
          photos: [{ folderPath: '/Photos/Lyon', key: 'missing-key' }],
        });
      }),
    ).rejects.toThrow('Photo not found in flagged records:');
    expect(mockRunCreateGroupTransaction).not.toHaveBeenCalled();
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
// CF auth
// ---------------------------------------------------------------------------

describe('useAppStore — cfAuth', () => {
  const fixture = {
    accountId: 'acct', d1ApiToken: 'tok', d1DatabaseId: 'db',
    r2AccessKeyId: 'key', r2SecretAccessKey: 'secret', r2Bucket: 'bucket',
  };

  it('should initialise cfAuth to null', () => {
    expect(useAppStore.getState().cfAuth).toBeNull();
  });

  it.each([
    ['a CfAuth fixture', fixture],
    [null, null],
  ])('should set cfAuth to %s when getCfAuth resolves', async (_label, returnValue) => {
    mockGetCfAuth.mockResolvedValue(returnValue);
    await act(async () => { await useAppStore.getState().loadCfAuth(); });
    expect(useAppStore.getState().cfAuth).toEqual(returnValue);
  });

  it('should reset cfAuth to null after _resetStoreForTesting', async () => {
    useAppStore.setState({ cfAuth: fixture });
    _resetStoreForTesting();
    expect(useAppStore.getState().cfAuth).toBeNull();
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

  it('createThumbnailCache retry transitions error → loading → success and re-issues batch for only that path', async () => {
    const cache = createThumbnailCache();
    mockGetThumbnailBatch.mockResolvedValueOnce([
      { tag: 'failure', path_lower: '/photos/a.jpg', reason: 'http_500' },
    ]);
    cache.request('/Photos/a.jpg');
    await act(async () => { await Promise.resolve(); });
    await act(async () => {});
    expect(cache.peek('/photos/a.jpg')).toEqual({ tag: 'error' });

    mockGetThumbnailBatch.mockResolvedValueOnce([
      { tag: 'success', path_lower: '/photos/a.jpg', dataUrl: 'data:image/jpeg;base64,retry' },
    ]);
    const cb = vi.fn();
    cache.subscribe('/photos/a.jpg', cb);
    cache.retry('/photos/a.jpg');
    expect(cache.peek('/photos/a.jpg')).toEqual({ tag: 'loading' });

    await act(async () => { await Promise.resolve(); });
    await act(async () => {});
    expect(cache.peek('/photos/a.jpg')).toEqual({ tag: 'success', dataUrl: 'data:image/jpeg;base64,retry' });
    expect(cb).toHaveBeenCalled();
    expect(mockGetThumbnailBatch).toHaveBeenLastCalledWith(['/photos/a.jpg']);
  });

  it('createThumbnailCache retry is a no-op when state is not error', async () => {
    const cache = createThumbnailCache();
    cache.retry('/photos/a.jpg');
    await act(async () => { await Promise.resolve(); });
    expect(mockGetThumbnailBatch).not.toHaveBeenCalled();
  });

  it('createThumbnailCache retry second click while in-flight is a no-op', async () => {
    const cache = createThumbnailCache();
    mockGetThumbnailBatch.mockResolvedValueOnce([
      { tag: 'failure', path_lower: '/photos/a.jpg', reason: 'http_500' },
    ]);
    cache.request('/Photos/a.jpg');
    await act(async () => { await Promise.resolve(); });
    await act(async () => {});
    expect(cache.peek('/photos/a.jpg')).toEqual({ tag: 'error' });

    let resolveRetry!: (v: import('../dropbox/client').ThumbnailResult[]) => void;
    mockGetThumbnailBatch.mockReturnValueOnce(
      new Promise<import('../dropbox/client').ThumbnailResult[]>((res) => { resolveRetry = res; }),
    );

    cache.retry('/photos/a.jpg'); // first retry — in-flight
    cache.retry('/photos/a.jpg'); // second click — no-op

    // 1 call for initial flush + 1 for first retry only
    expect(mockGetThumbnailBatch).toHaveBeenCalledTimes(2);

    resolveRetry([{ tag: 'success', path_lower: '/photos/a.jpg', dataUrl: 'data:image/jpeg;base64,ok' }]);
    await act(async () => { await Promise.resolve(); });
    await act(async () => {});
    expect(cache.peek('/photos/a.jpg')).toEqual({ tag: 'success', dataUrl: 'data:image/jpeg;base64,ok' });
  });
});

// ---------------------------------------------------------------------------
// Cross-tab navigation
// ---------------------------------------------------------------------------

describe('useAppStore — cross-tab navigation', () => {
  it('should initialise selectedGroupId to null', () => {
    expect(useAppStore.getState().selectedGroupId).toBeNull();
  });

  it('should initialise groupNavSeq to 0', () => {
    expect(useAppStore.getState().groupNavSeq).toBe(0);
  });

  it('should update selectedGroupId via setSelectedGroupId', () => {
    useAppStore.getState().setSelectedGroupId('g1');
    expect(useAppStore.getState().selectedGroupId).toBe('g1');
  });

  it('should clear selectedGroupId when setSelectedGroupId is called with null', () => {
    useAppStore.getState().setSelectedGroupId('g1');
    useAppStore.getState().setSelectedGroupId(null);
    expect(useAppStore.getState().selectedGroupId).toBeNull();
  });

  it('should set selectedGroupId and increment groupNavSeq via viewGroupDetail', () => {
    useAppStore.getState().viewGroupDetail('g2');
    expect(useAppStore.getState().selectedGroupId).toBe('g2');
    expect(useAppStore.getState().groupNavSeq).toBe(1);
  });

  it('should increment groupNavSeq each time viewGroupDetail is called, even for the same group', () => {
    useAppStore.getState().viewGroupDetail('g1');
    useAppStore.getState().viewGroupDetail('g1');
    expect(useAppStore.getState().groupNavSeq).toBe(2);
    expect(useAppStore.getState().selectedGroupId).toBe('g1');
  });

  it('should reset selectedGroupId and groupNavSeq after _resetStoreForTesting', () => {
    useAppStore.getState().viewGroupDetail('g99');
    _resetStoreForTesting();
    expect(useAppStore.getState().selectedGroupId).toBeNull();
    expect(useAppStore.getState().groupNavSeq).toBe(0);
  });
});
