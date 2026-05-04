// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { insertGroupAndPhotos, deleteGroupRowsFromD1, type PhotoRow } from './groupWrites';
import type { D1Client } from './d1Client';
import type { Group } from '../curator/groups';

const GROUP_INSERT_SQL =
  'INSERT INTO groups (id, name, lat, lng, place_id, location_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
const PHOTO_INSERT_SQL =
  'INSERT INTO photos (id, group_id, name, captured_at, r2_key, created_at) VALUES (?, ?, ?, ?, ?, ?)';
const GROUP_DELETE_SQL = 'DELETE FROM groups WHERE id = ?';

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'group-1',
    name: 'Lyon Trip',
    lat: 45.75,
    lng: 4.83,
    placeId: 'place-abc',
    locationName: 'Lyon, France',
    photoIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePhoto(overrides: Partial<PhotoRow> = {}): PhotoRow {
  return {
    id: 'photo-1',
    groupId: 'group-1',
    name: 'IMG_001.jpg',
    capturedAt: '2026-01-01T12:00:00.000Z',
    r2Key: 'photos/photo-1',
    ...overrides,
  };
}

function makeD1(queryImpl?: ReturnType<typeof vi.fn>): D1Client {
  return { query: queryImpl ?? vi.fn().mockResolvedValue([]) };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('insertGroupAndPhotos', () => {
  it('should issue one group INSERT with the canonical SQL and ordered params', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const d1 = makeD1(query);
    const group = makeGroup();

    await insertGroupAndPhotos(d1, group, []);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toBe(GROUP_INSERT_SQL);
    expect(params).toEqual([
      'group-1',
      'Lyon Trip',
      45.75,
      4.83,
      'place-abc',
      'Lyon, France',
      '2026-01-01T00:00:00.000Z',
    ]);
  });

  it.each([
    ['placeId', { placeId: undefined }, 4],
    ['locationName', { locationName: undefined }, 5],
  ] as const)('should pass null for undefined %s', async (_label, overrides, paramIndex) => {
    const query = vi.fn().mockResolvedValue([]);
    const d1 = makeD1(query);
    const group = makeGroup(overrides as Partial<Group>);

    await insertGroupAndPhotos(d1, group, []);

    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[paramIndex]).toBeNull();
  });

  it('should issue one photo INSERT per row with the canonical SQL and ordered params', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const d1 = makeD1(query);
    const group = makeGroup();
    const photos = [
      makePhoto({ id: 'p1', r2Key: 'photos/p1' }),
      makePhoto({ id: 'p2', r2Key: 'photos/p2' }),
      makePhoto({ id: 'p3', r2Key: 'photos/p3' }),
    ];

    await insertGroupAndPhotos(d1, group, photos);

    // 1 group + 3 photos
    expect(query).toHaveBeenCalledTimes(4);
    const photoCalls = query.mock.calls.slice(1) as [string, unknown[]][];
    expect(photoCalls.every(([sql]) => sql === PHOTO_INSERT_SQL)).toBe(true);
    const photoIds = photoCalls.map(([, params]) => (params as unknown[])[0]);
    expect(photoIds).toEqual(expect.arrayContaining(['p1', 'p2', 'p3']));
  });

  it('should default capturedAt to null when undefined', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const d1 = makeD1(query);
    const group = makeGroup();
    const photo = makePhoto({ capturedAt: undefined });

    await insertGroupAndPhotos(d1, group, [photo]);

    const [, photoParams] = query.mock.calls[1] as [string, unknown[]];
    expect(photoParams[3]).toBeNull();
  });

  it('should fan photo inserts in parallel after the group insert resolves', async () => {
    const deferreds: Array<{ resolve: () => void }> = [];
    const query = vi.fn(
      () => new Promise<unknown[]>((resolve) => deferreds.push({ resolve: () => resolve([]) })),
    );
    const d1 = makeD1(query);
    const group = makeGroup();
    const photos = [
      makePhoto({ id: 'p1' }),
      makePhoto({ id: 'p2' }),
      makePhoto({ id: 'p3' }),
    ];

    const pending = insertGroupAndPhotos(d1, group, photos);

    // flush microtasks — group INSERT should be the only call so far
    await Promise.resolve();
    await Promise.resolve();
    expect(query).toHaveBeenCalledTimes(1);

    // resolve group INSERT
    deferreds[0].resolve();
    await Promise.resolve();
    await Promise.resolve();

    // all 3 photo INSERTs should be in flight now
    expect(query).toHaveBeenCalledTimes(4);

    // resolve remaining so the promise settles
    deferreds[1].resolve();
    deferreds[2].resolve();
    deferreds[3].resolve();
    await pending;
  });

  it('should propagate D1 errors from the group insert', async () => {
    const err = new Error('D1 group insert failed');
    const query = vi.fn().mockRejectedValue(err);
    const d1 = makeD1(query);

    await expect(insertGroupAndPhotos(d1, makeGroup(), [makePhoto()])).rejects.toThrow(err);
  });

  it('should propagate D1 errors from a photo insert', async () => {
    const err = new Error('D1 photo insert failed');
    const query = vi.fn()
      .mockResolvedValueOnce([])
      .mockRejectedValue(err);
    const d1 = makeD1(query);

    await expect(insertGroupAndPhotos(d1, makeGroup(), [makePhoto()])).rejects.toThrow(err);
  });
});

describe('deleteGroupRowsFromD1', () => {
  it('should issue DELETE FROM groups with the groupId param', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const d1 = makeD1(query);

    await deleteGroupRowsFromD1(d1, 'group-1');

    expect(query).toHaveBeenCalledWith(GROUP_DELETE_SQL, ['group-1']);
  });

  it('should propagate D1 errors', async () => {
    const err = new Error('D1 delete failed');
    const query = vi.fn().mockRejectedValue(err);
    const d1 = makeD1(query);

    await expect(deleteGroupRowsFromD1(d1, 'group-1')).rejects.toThrow(err);
  });
});
