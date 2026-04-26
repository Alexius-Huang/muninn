import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));

import { readCuration, writeCuration, listCuration, migrateLegacyCurationFile, migrateToIdKeys, applyFlag, applyGroupId, transitionToGroup, clearGroupRefs } from './curation';
import type { CurationFile, CurationRecord } from './curation';
import type { DropboxFile } from '../dropbox/client';

beforeEach(() => mockInvoke.mockReset());

describe('migrateLegacyCurationFile', () => {
  it('should upgrade the legacy { flags } shape to { records }', () => {
    const legacy = {
      folderPath: '/Photos/Lyon',
      flags: { '/photos/lyon/a.jpg': 'keep' as const },
    };
    const result = migrateLegacyCurationFile(legacy);
    expect(result.folderPath).toBe('/Photos/Lyon');
    expect(result.records['/photos/lyon/a.jpg']).toEqual({
      pathLower: '/photos/lyon/a.jpg',
      pathDisplay: '/photos/lyon/a.jpg',
      name: 'a.jpg',
      flag: 'keep',
    });
    expect('flags' in result).toBe(false);
  });

  it('should pass through the new { records } shape unchanged', () => {
    const file: CurationFile = {
      folderPath: '/Photos/Lyon',
      records: {
        '/photos/lyon/b.jpg': {
          pathLower: '/photos/lyon/b.jpg',
          pathDisplay: '/Photos/Lyon/B.jpg',
          name: 'B.jpg',
          flag: 'discard',
        },
      },
    };
    const result = migrateLegacyCurationFile(file);
    expect(result).toEqual(file);
  });

  it('should throw on an invalid shape', () => {
    expect(() => migrateLegacyCurationFile(null)).toThrow();
    expect(() => migrateLegacyCurationFile({ folderPath: '/x' })).toThrow();
  });
});

describe('readCuration', () => {
  it('should return null when read_curation returns null', async () => {
    mockInvoke.mockResolvedValue(null);
    const result = await readCuration('/Photos/Lyon');
    expect(result).toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith('read_curation', { folderPath: '/Photos/Lyon' });
  });

  it('should parse and migrate a legacy JSON file on success', async () => {
    const legacy = { folderPath: '/Photos/Lyon', flags: { '/photos/lyon/a.jpg': 'keep' } };
    mockInvoke.mockResolvedValue(JSON.stringify(legacy));
    const result = await readCuration('/Photos/Lyon');
    expect(result?.records['/photos/lyon/a.jpg'].flag).toBe('keep');
  });

  it('should parse a new-shape JSON file on success', async () => {
    const file: CurationFile = {
      folderPath: '/Photos/Lyon',
      records: {
        '/photos/lyon/a.jpg': {
          pathLower: '/photos/lyon/a.jpg',
          pathDisplay: '/Photos/Lyon/a.jpg',
          name: 'a.jpg',
          flag: 'keep',
        },
      },
    };
    mockInvoke.mockResolvedValue(JSON.stringify(file));
    const result = await readCuration('/Photos/Lyon');
    expect(result).toEqual(file);
  });
});

describe('writeCuration', () => {
  it('should serialize records to JSON and invoke write_curation', async () => {
    mockInvoke.mockResolvedValue(undefined);
    const file: CurationFile = {
      folderPath: '/Photos/Lyon',
      records: {
        '/photos/lyon/b.jpg': {
          pathLower: '/photos/lyon/b.jpg',
          pathDisplay: '/Photos/Lyon/b.jpg',
          name: 'b.jpg',
          flag: 'discard',
        },
      },
    };
    await writeCuration(file);
    expect(mockInvoke).toHaveBeenCalledWith('write_curation', {
      folderPath: '/Photos/Lyon',
      contents: JSON.stringify(file, null, 2),
    });
  });
});

describe('listCuration', () => {
  it('should invoke list_curation and return parsed + migrated files', async () => {
    const file1: CurationFile = {
      folderPath: '/Photos/Lyon',
      records: {
        '/photos/lyon/a.jpg': { pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep' },
      },
    };
    const file2Legacy = { folderPath: '/Photos/Paris', flags: { '/photos/paris/b.jpg': 'discard' } };
    mockInvoke.mockResolvedValue([JSON.stringify(file1), JSON.stringify(file2Legacy)]);
    const result = await listCuration();
    expect(mockInvoke).toHaveBeenCalledWith('list_curation');
    expect(result).toHaveLength(2);
    expect(result[0].folderPath).toBe('/Photos/Lyon');
    expect(result[1].records['/photos/paris/b.jpg'].flag).toBe('discard');
  });

  it('should return an empty array when list_curation returns no files', async () => {
    mockInvoke.mockResolvedValue([]);
    const result = await listCuration();
    expect(result).toEqual([]);
  });
});

function makeDropboxFile(name: string, pathLower: string, options?: { timeTaken?: string; clientModified?: string }): DropboxFile {
  return {
    '.tag': 'file',
    name,
    path_display: pathLower,
    path_lower: pathLower,
    id: `id:${name}`,
    size: 1024,
    server_modified: '2026-01-01T00:00:00Z',
    client_modified: options?.clientModified ?? '2025-12-31T12:00:00Z',
    media_info: options?.timeTaken ? { metadata: { time_taken: options.timeTaken } } : undefined,
  };
}

describe('migrateToIdKeys', () => {
  it('should re-key path-keyed records to photoId using matching Dropbox files', () => {
    const file: CurationFile = {
      folderPath: '/Photos/Lyon',
      records: {
        '/photos/lyon/a.jpg': { pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep' },
      },
    };
    const dbFile = makeDropboxFile('a.jpg', '/photos/lyon/a.jpg');
    const result = migrateToIdKeys(file, [dbFile]);
    expect(result.changed).toBe(true);
    expect(result.droppedCount).toBe(0);
    expect(result.file.records['id:a.jpg']).toBeDefined();
    expect(result.file.records['id:a.jpg'].flag).toBe('keep');
    expect(result.file.records['id:a.jpg'].photoId).toBe('id:a.jpg');
    expect(result.file.records['/photos/lyon/a.jpg']).toBeUndefined();
  });

  it('should populate capturedAt from media_info.metadata.time_taken when present', () => {
    const file: CurationFile = {
      folderPath: '/Photos/Lyon',
      records: { '/photos/lyon/a.jpg': { pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep' } },
    };
    const dbFile = makeDropboxFile('a.jpg', '/photos/lyon/a.jpg', { timeTaken: '2026-03-15T10:00:00Z', clientModified: '2026-03-16T00:00:00Z' });
    const result = migrateToIdKeys(file, [dbFile]);
    expect(result.file.records['id:a.jpg'].capturedAt).toBe('2026-03-15T10:00:00Z');
  });

  it('should fall back to client_modified when time_taken is absent', () => {
    const file: CurationFile = {
      folderPath: '/Photos/Lyon',
      records: { '/photos/lyon/a.jpg': { pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep' } },
    };
    const dbFile = makeDropboxFile('a.jpg', '/photos/lyon/a.jpg', { clientModified: '2026-03-16T08:00:00Z' });
    const result = migrateToIdKeys(file, [dbFile]);
    expect(result.file.records['id:a.jpg'].capturedAt).toBe('2026-03-16T08:00:00Z');
  });

  it('should preserve capturedAt when already set', () => {
    const file: CurationFile = {
      folderPath: '/Photos/Lyon',
      records: { '/photos/lyon/a.jpg': { pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep', capturedAt: '2026-01-01T00:00:00Z' } },
    };
    const dbFile = makeDropboxFile('a.jpg', '/photos/lyon/a.jpg', { timeTaken: '2026-03-15T10:00:00Z' });
    const result = migrateToIdKeys(file, [dbFile]);
    expect(result.file.records['id:a.jpg'].capturedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('should drop records with no matching Dropbox file and report droppedCount', () => {
    const file: CurationFile = {
      folderPath: '/Photos/Lyon',
      records: {
        '/photos/lyon/a.jpg': { pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep' },
        '/photos/lyon/b.jpg': { pathLower: '/photos/lyon/b.jpg', pathDisplay: '/Photos/Lyon/b.jpg', name: 'b.jpg', flag: 'discard' },
      },
    };
    const dbFile = makeDropboxFile('a.jpg', '/photos/lyon/a.jpg');
    const result = migrateToIdKeys(file, [dbFile]);
    expect(result.changed).toBe(true);
    expect(result.droppedCount).toBe(1);
    expect(Object.keys(result.file.records)).toHaveLength(1);
    expect(result.file.records['id:a.jpg']).toBeDefined();
  });

  it('should be a no-op (changed=false) when all keys already begin with id:', () => {
    const file: CurationFile = {
      folderPath: '/Photos/Lyon',
      records: {
        'id:abc': { photoId: 'id:abc', pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep', capturedAt: '2026-01-01T00:00:00Z' },
      },
    };
    const result = migrateToIdKeys(file, []);
    expect(result.changed).toBe(false);
    expect(result.file).toBe(file);
    expect(result.droppedCount).toBe(0);
  });
});

function makeFile(id: string, path = '/photos/lyon/a.jpg'): DropboxFile {
  return {
    '.tag': 'file',
    name: 'a.jpg',
    path_display: path,
    path_lower: path,
    id,
    size: 1024,
    server_modified: '2026-01-01T00:00:00Z',
    client_modified: '2025-12-31T12:00:00Z',
    media_info: { metadata: { time_taken: '2025-12-30T10:00:00Z' } },
  };
}

describe('applyFlag', () => {
  it.each([
    ['keep' as const],
    ['discard' as const],
  ])('should add a new record with flag=%s', (flag) => {
    const file = makeFile('id:a');
    const result = applyFlag({}, file, flag);
    expect(result['id:a'].flag).toBe(flag);
    expect(result['id:a'].groupId).toBeUndefined();
  });

  it('should preserve capturedAt from the existing record when re-flagging', () => {
    const existing: CurationRecord = { pathLower: '/p', pathDisplay: '/P', name: 'a.jpg', flag: 'keep', capturedAt: '2024-01-01T00:00:00Z' };
    const file = makeFile('id:a');
    const result = applyFlag({ 'id:a': existing }, file, 'discard');
    expect(result['id:a'].capturedAt).toBe('2024-01-01T00:00:00Z');
  });

  it('should clear groupId when setting a flag (XOR invariant)', () => {
    const existing: CurationRecord = { pathLower: '/p', pathDisplay: '/P', name: 'a.jpg', groupId: 'g1' };
    const file = makeFile('id:a');
    const result = applyFlag({ 'id:a': existing }, file, 'keep');
    expect(result['id:a'].flag).toBe('keep');
    expect(result['id:a'].groupId).toBeUndefined();
  });

  it('should delete the record when clearing flag on a record without groupId', () => {
    const existing: CurationRecord = { pathLower: '/p', pathDisplay: '/P', name: 'a.jpg', flag: 'keep' };
    const file = makeFile('id:a');
    const result = applyFlag({ 'id:a': existing }, file, undefined);
    expect(result['id:a']).toBeUndefined();
  });

  it('should keep the record with groupId only when clearing flag on a record that has groupId', () => {
    const existing: CurationRecord = { pathLower: '/p', pathDisplay: '/P', name: 'a.jpg', flag: 'keep', groupId: 'g1' };
    const file = makeFile('id:a');
    const result = applyFlag({ 'id:a': existing }, file, undefined);
    expect(result['id:a'].groupId).toBe('g1');
    expect(result['id:a'].flag).toBeUndefined();
  });
});

describe('applyGroupId', () => {
  it('should add a new record with the given groupId', () => {
    const file = makeFile('id:a');
    const result = applyGroupId({}, file, 'g1');
    expect(result['id:a'].groupId).toBe('g1');
    expect(result['id:a'].flag).toBeUndefined();
  });

  it('should preserve capturedAt from the existing record', () => {
    const existing: CurationRecord = { pathLower: '/p', pathDisplay: '/P', name: 'a.jpg', flag: 'keep', capturedAt: '2024-06-01T00:00:00Z' };
    const file = makeFile('id:a');
    const result = applyGroupId({ 'id:a': existing }, file, 'g1');
    expect(result['id:a'].capturedAt).toBe('2024-06-01T00:00:00Z');
  });

  it('should clear flag when setting a groupId (XOR invariant)', () => {
    const existing: CurationRecord = { pathLower: '/p', pathDisplay: '/P', name: 'a.jpg', flag: 'keep' };
    const file = makeFile('id:a');
    const result = applyGroupId({ 'id:a': existing }, file, 'g1');
    expect(result['id:a'].groupId).toBe('g1');
    expect(result['id:a'].flag).toBeUndefined();
  });

  it('should delete the record when clearing groupId on a record without flag', () => {
    const existing: CurationRecord = { pathLower: '/p', pathDisplay: '/P', name: 'a.jpg', groupId: 'g1' };
    const file = makeFile('id:a');
    const result = applyGroupId({ 'id:a': existing }, file, undefined);
    expect(result['id:a']).toBeUndefined();
  });

  it('should keep the record with flag only when clearing groupId on a record that has flag', () => {
    const existing: CurationRecord = { pathLower: '/p', pathDisplay: '/P', name: 'a.jpg', flag: 'keep', groupId: 'g1' };
    const file = makeFile('id:a');
    const result = applyGroupId({ 'id:a': existing }, file, undefined);
    expect(result['id:a'].flag).toBe('keep');
    expect(result['id:a'].groupId).toBeUndefined();
  });
});

describe('transitionToGroup', () => {
  const base: CurationRecord = {
    photoId: 'id:a',
    pathLower: '/photos/lyon/a.jpg',
    pathDisplay: '/Photos/Lyon/a.jpg',
    name: 'a.jpg',
    flag: 'keep',
    capturedAt: '2024-06-01T00:00:00Z',
  };

  it('should set groupId and clear flag for an existing flagged record', () => {
    const result = transitionToGroup({ 'id:a': structuredClone(base) }, 'id:a', 'g1');
    expect(result['id:a'].groupId).toBe('g1');
    expect(result['id:a'].flag).toBeUndefined();
  });

  it('should preserve photoId, pathLower, pathDisplay, name, capturedAt', () => {
    const result = transitionToGroup({ 'id:a': structuredClone(base) }, 'id:a', 'g1');
    const r = result['id:a'];
    expect(r.photoId).toBe('id:a');
    expect(r.pathLower).toBe('/photos/lyon/a.jpg');
    expect(r.pathDisplay).toBe('/Photos/Lyon/a.jpg');
    expect(r.name).toBe('a.jpg');
    expect(r.capturedAt).toBe('2024-06-01T00:00:00Z');
  });

  it('should return the same reference when the key is not found', () => {
    const records = { 'id:a': structuredClone(base) };
    const result = transitionToGroup(records, 'id:missing', 'g1');
    expect(result).toBe(records);
  });

  it('should be idempotent when called twice with the same groupId', () => {
    const records = { 'id:a': structuredClone(base) };
    const once = transitionToGroup(records, 'id:a', 'g1');
    const twice = transitionToGroup(once, 'id:a', 'g1');
    expect(twice['id:a'].groupId).toBe('g1');
    expect(twice['id:a'].flag).toBeUndefined();
  });
});

describe('clearGroupRefs', () => {
  it('should drop groupId from records matching the target groupId', () => {
    const records: Record<string, CurationRecord> = {
      'id:a': { pathLower: '/p', pathDisplay: '/P', name: 'a.jpg', flag: 'keep', groupId: 'g1' },
    };
    const { records: next, changed } = clearGroupRefs(structuredClone(records), 'g1');
    expect(changed).toBe(true);
    expect(next['id:a'].groupId).toBeUndefined();
    expect(next['id:a'].flag).toBe('keep');
  });

  it('should delete records whose only field was the cleared groupId (no flag)', () => {
    const records: Record<string, CurationRecord> = {
      'id:b': { pathLower: '/p', pathDisplay: '/P', name: 'b.jpg', groupId: 'g1' },
    };
    const { records: next, changed } = clearGroupRefs(structuredClone(records), 'g1');
    expect(changed).toBe(true);
    expect(next['id:b']).toBeUndefined();
  });

  it('should leave non-matching records untouched', () => {
    const records: Record<string, CurationRecord> = {
      'id:a': { pathLower: '/p', pathDisplay: '/P', name: 'a.jpg', groupId: 'g2' },
      'id:b': { pathLower: '/p', pathDisplay: '/P', name: 'b.jpg', flag: 'keep' },
    };
    const { records: next, changed } = clearGroupRefs(structuredClone(records), 'g1');
    expect(changed).toBe(false);
    expect(next['id:a'].groupId).toBe('g2');
    expect(next['id:b'].flag).toBe('keep');
  });

  it('should return changed=false when no records matched', () => {
    const records: Record<string, CurationRecord> = {
      'id:a': { pathLower: '/p', pathDisplay: '/P', name: 'a.jpg', flag: 'keep' },
    };
    const { changed } = clearGroupRefs(structuredClone(records), 'g-none');
    expect(changed).toBe(false);
  });
});
