import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));

import { readCuration, writeCuration } from './curation';
import type { CurationFile } from './curation';

beforeEach(() => mockInvoke.mockReset());

describe('readCuration', () => {
  it('should return null when read_curation returns null', async () => {
    mockInvoke.mockResolvedValue(null);
    const result = await readCuration('/Photos/Lyon');
    expect(result).toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith('read_curation', { folderPath: '/Photos/Lyon' });
  });

  it('should parse JSON and return a CurationFile on success', async () => {
    const file: CurationFile = {
      folderPath: '/Photos/Lyon',
      flags: { '/photos/lyon/a.jpg': 'keep' },
    };
    mockInvoke.mockResolvedValue(JSON.stringify(file));
    const result = await readCuration('/Photos/Lyon');
    expect(result).toEqual(file);
  });
});

describe('writeCuration', () => {
  it('should serialize flags to JSON and invoke write_curation', async () => {
    mockInvoke.mockResolvedValue(undefined);
    const file: CurationFile = {
      folderPath: '/Photos/Lyon',
      flags: { '/photos/lyon/b.jpg': 'discard' },
    };
    await writeCuration(file);
    expect(mockInvoke).toHaveBeenCalledWith('write_curation', {
      folderPath: '/Photos/Lyon',
      contents: JSON.stringify(file, null, 2),
    });
  });
});
