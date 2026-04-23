import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));

import { readCuration, writeCuration, listCuration, migrateLegacyCurationFile } from './curation';
import type { CurationFile } from './curation';

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
