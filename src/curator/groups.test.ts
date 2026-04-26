import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));

// groups.ts imports curation.ts which also imports @tauri-apps/api/core — mock covers both
import { createGroup, updateGroup, deleteGroup, getGroup, listGroups, readGroups, writeGroups, createGroupAndPersist, deleteGroupAndCascade, type Group } from './groups';

beforeEach(() => mockInvoke.mockReset());

describe('createGroup', () => {
  it('should generate a unique id and default photoIds to []', () => {
    const g1 = createGroup({ name: 'Eiffel Tower', lat: 48.858, lng: 2.294 });
    const g2 = createGroup({ name: 'Colosseum', lat: 41.89, lng: 12.492 });
    expect(g1.id).toBeTruthy();
    expect(g2.id).toBeTruthy();
    expect(g1.id).not.toBe(g2.id);
    expect(g1.photoIds).toEqual([]);
  });

  it('should accept an explicit photoIds list and preserve order', () => {
    const ids = ['id:a', 'id:b', 'id:c'];
    const g = createGroup({ name: 'Lyon', lat: 45.75, lng: 4.83, photoIds: ids });
    expect(g.photoIds).toEqual(ids);
  });

  it.each([
    ['with placeId', 'place123', 'place123'],
    ['without placeId', undefined, undefined],
  ] as const)('should handle placeId %s', (_label, input, expected) => {
    const g = createGroup({ name: 'X', lat: 0, lng: 0, placeId: input });
    expect(g.placeId).toBe(expected);
  });
});

describe('updateGroup', () => {
  const base: Group[] = [
    { id: 'g1', name: 'Place A', lat: 1, lng: 2, photoIds: [] },
    { id: 'g2', name: 'Place B', lat: 3, lng: 4, photoIds: ['id:x'] },
  ];

  it('should merge patch into the matching group and leave others untouched', () => {
    const result = updateGroup(structuredClone(base), 'g1', { name: 'Place A Updated', lat: 99 });
    expect(result.find((g) => g.id === 'g1')?.name).toBe('Place A Updated');
    expect(result.find((g) => g.id === 'g1')?.lat).toBe(99);
    expect(result.find((g) => g.id === 'g2')?.name).toBe('Place B');
  });

  it('should return a new array and not mutate the original', () => {
    const result = updateGroup(base, 'g1', { name: 'Changed' });
    expect(result).not.toBe(base);
    expect(base[0].name).toBe('Place A');
  });

  it('should be a no-op when the id is not found', () => {
    const result = updateGroup(structuredClone(base), 'g-none', { name: 'X' });
    expect(result).toEqual(base);
  });
});

describe('deleteGroup', () => {
  const base: Group[] = [
    { id: 'g1', name: 'A', lat: 0, lng: 0, photoIds: [] },
    { id: 'g2', name: 'B', lat: 0, lng: 0, photoIds: [] },
  ];

  it('should remove the matching group', () => {
    const result = deleteGroup(base, 'g1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('g2');
  });

  it('should be a no-op when the id is not found', () => {
    const result = deleteGroup(base, 'g-none');
    expect(result).toHaveLength(2);
  });
});

describe('getGroup', () => {
  const groups: Group[] = [
    { id: 'g1', name: 'A', lat: 0, lng: 0, photoIds: [] },
  ];

  it('should return the matching group', () => {
    expect(getGroup(groups, 'g1')?.name).toBe('A');
  });

  it('should return undefined when the id is not found', () => {
    expect(getGroup(groups, 'g-none')).toBeUndefined();
  });
});

describe('listGroups', () => {
  it('should return the input array as-is', () => {
    const groups: Group[] = [{ id: 'g1', name: 'A', lat: 0, lng: 0, photoIds: [] }];
    expect(listGroups(groups)).toBe(groups);
  });
});

describe('readGroups', () => {
  it('should return [] when read_groups returns null', async () => {
    mockInvoke.mockResolvedValue(null);
    const result = await readGroups();
    expect(result).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledWith('read_groups');
  });

  it('should parse and return the persisted Group[] when read_groups returns JSON', async () => {
    const groups: Group[] = [{ id: 'g1', name: 'Lyon', lat: 45.75, lng: 4.83, photoIds: ['id:a'] }];
    mockInvoke.mockResolvedValue(JSON.stringify(groups));
    const result = await readGroups();
    expect(result).toEqual(groups);
  });
});

describe('writeGroups', () => {
  it('should serialize groups to JSON and invoke write_groups', async () => {
    mockInvoke.mockResolvedValue(undefined);
    const groups: Group[] = [{ id: 'g1', name: 'Lyon', lat: 45.75, lng: 4.83, photoIds: [] }];
    await writeGroups(groups);
    expect(mockInvoke).toHaveBeenCalledWith('write_groups', {
      contents: JSON.stringify(groups, null, 2),
    });
  });
});

describe('createGroupAndPersist', () => {
  it('should generate a Group with the given photoIds and persist it', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'read_groups') return Promise.resolve(JSON.stringify([]));
      if (cmd === 'write_groups') return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
    const group = await createGroupAndPersist({ name: 'Eiffel Tower', lat: 48.858, lng: 2.294, placeId: 'p1', photoIds: ['id:a', 'id:b'] });
    expect(group.name).toBe('Eiffel Tower');
    expect(group.photoIds).toEqual(['id:a', 'id:b']);
    expect(group.placeId).toBe('p1');
    const writeCall = mockInvoke.mock.calls.find((c) => c[0] === 'write_groups');
    const written = JSON.parse(writeCall![1].contents) as Group[];
    expect(written).toHaveLength(1);
    expect(written[0].id).toBe(group.id);
  });

  it('should append to existing groups, not replace', async () => {
    const existing: Group[] = [{ id: 'g-existing', name: 'Old Place', lat: 0, lng: 0, photoIds: [] }];
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'read_groups') return Promise.resolve(JSON.stringify(existing));
      if (cmd === 'write_groups') return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
    await createGroupAndPersist({ name: 'New Place', lat: 1, lng: 2, photoIds: ['id:x'] });
    const writeCall = mockInvoke.mock.calls.find((c) => c[0] === 'write_groups');
    const written = JSON.parse(writeCall![1].contents) as Group[];
    expect(written).toHaveLength(2);
    expect(written[0].id).toBe('g-existing');
    expect(written[1].name).toBe('New Place');
  });

  it('should return the new Group with a freshly-generated id', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'read_groups') return Promise.resolve(JSON.stringify([]));
      if (cmd === 'write_groups') return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
    const g1 = await createGroupAndPersist({ name: 'A', lat: 0, lng: 0, photoIds: [] });
    const g2 = await createGroupAndPersist({ name: 'B', lat: 0, lng: 0, photoIds: [] });
    expect(g1.id).toBeTruthy();
    expect(g2.id).toBeTruthy();
    expect(g1.id).not.toBe(g2.id);
  });
});

describe('deleteGroupAndCascade', () => {
  it('should write the groups list with the target removed', async () => {
    const groups: Group[] = [
      { id: 'g1', name: 'A', lat: 0, lng: 0, photoIds: ['id:x'] },
      { id: 'g2', name: 'B', lat: 0, lng: 0, photoIds: [] },
    ];
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'read_groups') return Promise.resolve(JSON.stringify(groups));
      if (cmd === 'write_groups') return Promise.resolve(undefined);
      if (cmd === 'list_curation') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
    await deleteGroupAndCascade('g1');
    const writeCall = mockInvoke.mock.calls.find((c) => c[0] === 'write_groups');
    const written = JSON.parse(writeCall![1].contents) as Group[];
    expect(written).toHaveLength(1);
    expect(written[0].id).toBe('g2');
  });

  it('should clear groupId from member records across multiple curation files', async () => {
    const groups: Group[] = [{ id: 'g1', name: 'A', lat: 0, lng: 0, photoIds: ['id:x', 'id:y'] }];
    const file1 = {
      folderPath: '/Photos/Lyon',
      records: { 'id:x': { photoId: 'id:x', pathLower: '/p', pathDisplay: '/P', name: 'x.jpg', groupId: 'g1' } },
    };
    const file2 = {
      folderPath: '/Photos/Paris',
      records: { 'id:y': { photoId: 'id:y', pathLower: '/p', pathDisplay: '/P', name: 'y.jpg', groupId: 'g1' } },
    };
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'read_groups') return Promise.resolve(JSON.stringify(groups));
      if (cmd === 'write_groups') return Promise.resolve(undefined);
      if (cmd === 'list_curation') return Promise.resolve([JSON.stringify(file1), JSON.stringify(file2)]);
      if (cmd === 'write_curation') return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
    await deleteGroupAndCascade('g1');
    const writeCurationCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'write_curation');
    expect(writeCurationCalls).toHaveLength(2);
    const written1 = JSON.parse(writeCurationCalls.find((c) => c[1].folderPath === '/Photos/Lyon')![1].contents);
    expect(written1.records['id:x']).toBeUndefined();
    const written2 = JSON.parse(writeCurationCalls.find((c) => c[1].folderPath === '/Photos/Paris')![1].contents);
    expect(written2.records['id:y']).toBeUndefined();
  });

  it('should not write curation files that had no matching groupId', async () => {
    const groups: Group[] = [{ id: 'g1', name: 'A', lat: 0, lng: 0, photoIds: [] }];
    const file = {
      folderPath: '/Photos/Lyon',
      records: { 'id:z': { photoId: 'id:z', pathLower: '/p', pathDisplay: '/P', name: 'z.jpg', flag: 'keep' } },
    };
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'read_groups') return Promise.resolve(JSON.stringify(groups));
      if (cmd === 'write_groups') return Promise.resolve(undefined);
      if (cmd === 'list_curation') return Promise.resolve([JSON.stringify(file)]);
      return Promise.resolve(undefined);
    });
    await deleteGroupAndCascade('g1');
    const writeCurationCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'write_curation');
    expect(writeCurationCalls).toHaveLength(0);
  });

  it('should remove the record entirely when clearing groupId leaves no flag', async () => {
    const groups: Group[] = [{ id: 'g1', name: 'A', lat: 0, lng: 0, photoIds: ['id:x'] }];
    const file = {
      folderPath: '/Photos/Lyon',
      records: { 'id:x': { photoId: 'id:x', pathLower: '/p', pathDisplay: '/P', name: 'x.jpg', groupId: 'g1' } },
    };
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'read_groups') return Promise.resolve(JSON.stringify(groups));
      if (cmd === 'write_groups') return Promise.resolve(undefined);
      if (cmd === 'list_curation') return Promise.resolve([JSON.stringify(file)]);
      if (cmd === 'write_curation') return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
    await deleteGroupAndCascade('g1');
    const writeCurationCall = mockInvoke.mock.calls.find((c) => c[0] === 'write_curation');
    const written = JSON.parse(writeCurationCall![1].contents);
    expect(written.records['id:x']).toBeUndefined();
  });
});
