import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));

import { readCuration, writeCuration, listCuration, migrateLegacyCurationFile, migrateToIdKeys } from './curation';
import type { CurationFile } from './curation';
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
