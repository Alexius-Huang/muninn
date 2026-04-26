// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Stub Tauri IPC so importActual on ./curation doesn't blow up at import time
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const mockReadCuration = vi.fn();
const mockWriteCuration = vi.fn();
const mockMigrateToIdKeys = vi.fn();

vi.mock('./curation', async () => {
  const actual = await vi.importActual<typeof import('./curation')>('./curation');
  return {
    ...actual,
    readCuration: (...args: unknown[]) => mockReadCuration(...args),
    writeCuration: (...args: unknown[]) => mockWriteCuration(...args),
    migrateToIdKeys: (...args: unknown[]) => mockMigrateToIdKeys(...args),
  };
});

import { useCurationState } from './useCurationState';

function makeFile(name: string, path: string, timeTaken?: string) {
  return {
    '.tag': 'file' as const,
    name,
    path_display: path,
    path_lower: path.toLowerCase(),
    id: `id:${name}`,
    size: 1024,
    server_modified: '2026-01-01T00:00:00Z',
    client_modified: '2025-12-31T12:00:00Z',
    media_info: timeTaken ? { metadata: { time_taken: timeTaken } } : undefined,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  mockReadCuration.mockReset();
  mockWriteCuration.mockReset();
  mockMigrateToIdKeys.mockReset();
  mockReadCuration.mockResolvedValue(null);
  mockWriteCuration.mockResolvedValue(undefined);
  mockMigrateToIdKeys.mockImplementation((file: { folderPath: string; records: Record<string, unknown> }) => ({
    file,
    changed: false,
    droppedCount: 0,
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCurationState', () => {
  it('should expose an empty flags map when the folder has no file yet', async () => {
    mockReadCuration.mockResolvedValue(null);
    const { result } = renderHook(() => useCurationState('/Photos/Lyon', []));
    await act(async () => {});
    expect(result.current.flags).toEqual({});
  });

  it('should load already id-keyed records from disk without running migration', async () => {
    mockReadCuration.mockResolvedValue({
      folderPath: '/Photos/Lyon',
      records: {
        'id:a.jpg': { photoId: 'id:a.jpg', pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep' },
      },
    });
    const { result } = renderHook(() => useCurationState('/Photos/Lyon', []));
    await act(async () => {});
    expect(result.current.flags['id:a.jpg']).toBe('keep');
  });

  it('should migrate legacy path-keyed records to id-keyed on first load and persist the result', async () => {
    const file = makeFile('a.jpg', '/Photos/Lyon/a.jpg');
    const migratedRecords = {
      'id:a.jpg': { photoId: 'id:a.jpg', pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep' as const, capturedAt: '2025-12-31T12:00:00Z' },
    };
    mockReadCuration.mockResolvedValue({
      folderPath: '/Photos/Lyon',
      records: { '/photos/lyon/a.jpg': { pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep' } },
    });
    mockMigrateToIdKeys.mockReturnValue({
      file: { folderPath: '/Photos/Lyon', records: migratedRecords },
      changed: true,
      droppedCount: 0,
    });
    const { result } = renderHook(() => useCurationState('/Photos/Lyon', [file]));
    await act(async () => {});
    expect(result.current.flags['id:a.jpg']).toBe('keep');
    expect(mockWriteCuration).toHaveBeenCalledOnce();
    expect(mockWriteCuration.mock.calls[0][0].records['id:a.jpg'].flag).toBe('keep');
  });

  it('should not rewrite curation when records are already id-keyed', async () => {
    mockReadCuration.mockResolvedValue({
      folderPath: '/Photos/Lyon',
      records: {
        'id:a.jpg': { photoId: 'id:a.jpg', pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep' },
      },
    });
    const file = makeFile('a.jpg', '/Photos/Lyon/a.jpg');
    const { result } = renderHook(() => useCurationState('/Photos/Lyon', [file]));
    await act(async () => {});
    expect(result.current.flags['id:a.jpg']).toBe('keep');
    expect(mockWriteCuration).not.toHaveBeenCalled();
  });

  it('should update local flags immediately on setFlag', async () => {
    const file = makeFile('b.jpg', '/Photos/Lyon/b.jpg');
    const { result } = renderHook(() => useCurationState('/Photos/Lyon', []));
    await act(async () => {});
    act(() => {
      result.current.setFlag(file, 'discard');
    });
    expect(result.current.flags['id:b.jpg']).toBe('discard');
  });

  it('should populate capturedAt from Dropbox media_info when setFlag runs', async () => {
    const file = makeFile('a.jpg', '/Photos/Lyon/a.jpg', '2026-03-15T10:00:00Z');
    const { result } = renderHook(() => useCurationState('/Photos/Lyon', []));
    await act(async () => {});
    act(() => { result.current.setFlag(file, 'keep'); });
    await act(async () => { vi.advanceTimersByTime(250); });
    expect(mockWriteCuration.mock.calls[0][0].records['id:a.jpg'].capturedAt).toBe('2026-03-15T10:00:00Z');
  });

  it('should preserve capturedAt when setFlag is called again on a record that already has one', async () => {
    mockReadCuration.mockResolvedValue({
      folderPath: '/Photos/Lyon',
      records: {
        'id:a.jpg': { photoId: 'id:a.jpg', pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep', capturedAt: '2024-01-01T00:00:00Z' },
      },
    });
    const file = makeFile('a.jpg', '/Photos/Lyon/a.jpg', '2026-03-15T10:00:00Z');
    const { result } = renderHook(() => useCurationState('/Photos/Lyon', []));
    await act(async () => {});
    act(() => { result.current.setFlag(file, 'discard'); });
    await act(async () => { vi.advanceTimersByTime(250); });
    expect(mockWriteCuration.mock.calls[0][0].records['id:a.jpg'].capturedAt).toBe('2024-01-01T00:00:00Z');
  });

  it('should remove the flag when setFlag is called with undefined', async () => {
    mockReadCuration.mockResolvedValue({
      folderPath: '/Photos/Lyon',
      records: {
        'id:a.jpg': { photoId: 'id:a.jpg', pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep' },
      },
    });
    const file = makeFile('a.jpg', '/Photos/Lyon/a.jpg');
    const { result } = renderHook(() => useCurationState('/Photos/Lyon', []));
    await act(async () => {});
    act(() => {
      result.current.setFlag(file, undefined);
    });
    expect(result.current.flags['id:a.jpg']).toBeUndefined();
  });

  it('should debounce writes to 250 ms and coalesce rapid calls into one writeCuration', async () => {
    const fileA = makeFile('a.jpg', '/Photos/Lyon/a.jpg');
    const fileB = makeFile('b.jpg', '/Photos/Lyon/b.jpg');
    const { result } = renderHook(() => useCurationState('/Photos/Lyon', []));
    await act(async () => {});
    act(() => {
      result.current.setFlag(fileA, 'keep');
      result.current.setFlag(fileA, 'discard');
      result.current.setFlag(fileB, 'keep');
    });
    expect(mockWriteCuration).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(mockWriteCuration).toHaveBeenCalledOnce();
    expect(mockWriteCuration.mock.calls[0][0].records['id:a.jpg'].flag).toBe('discard');
    expect(mockWriteCuration.mock.calls[0][0].records['id:b.jpg'].flag).toBe('keep');
  });

  it('should flush any pending write synchronously when folderPath changes', async () => {
    const file = makeFile('a.jpg', '/Photos/Lyon/a.jpg');
    let folder = '/Photos/Lyon';
    const { result, rerender } = renderHook(() => useCurationState(folder, []));
    await act(async () => {});
    act(() => {
      result.current.setFlag(file, 'keep');
    });
    expect(mockWriteCuration).not.toHaveBeenCalled();
    folder = '/Photos/Paris';
    await act(async () => {
      rerender();
    });
    expect(mockWriteCuration).toHaveBeenCalledOnce();
  });

  it('should flush any pending write synchronously on unmount', async () => {
    const file = makeFile('a.jpg', '/Photos/Lyon/a.jpg');
    const { result, unmount } = renderHook(() => useCurationState('/Photos/Lyon', []));
    await act(async () => {});
    act(() => {
      result.current.setFlag(file, 'keep');
    });
    expect(mockWriteCuration).not.toHaveBeenCalled();
    unmount();
    expect(mockWriteCuration).toHaveBeenCalledOnce();
  });

  it('should flush immediately when flush() is called and cancel the debounce timer', async () => {
    const file = makeFile('a.jpg', '/Photos/Lyon/a.jpg');
    const { result } = renderHook(() => useCurationState('/Photos/Lyon', []));
    await act(async () => {});
    act(() => {
      result.current.setFlag(file, 'keep');
    });
    expect(mockWriteCuration).not.toHaveBeenCalled();
    act(() => {
      result.current.flush();
    });
    expect(mockWriteCuration).toHaveBeenCalledOnce();
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(mockWriteCuration).toHaveBeenCalledOnce();
  });

  it('should expose a reload that re-reads disk records into memory', async () => {
    mockReadCuration.mockResolvedValue({
      folderPath: '/Photos/Lyon',
      records: {
        'id:a.jpg': { photoId: 'id:a.jpg', pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep' },
      },
    });
    const { result } = renderHook(() => useCurationState('/Photos/Lyon', []));
    await act(async () => {});
    expect(result.current.flags['id:a.jpg']).toBe('keep');

    mockReadCuration.mockResolvedValue({
      folderPath: '/Photos/Lyon',
      records: {
        'id:b.jpg': { photoId: 'id:b.jpg', pathLower: '/photos/lyon/b.jpg', pathDisplay: '/Photos/Lyon/b.jpg', name: 'b.jpg', flag: 'discard' },
      },
    });
    await act(async () => { await result.current.reload(); });
    expect(result.current.flags['id:a.jpg']).toBeUndefined();
    expect(result.current.flags['id:b.jpg']).toBe('discard');
  });

  it('should be a no-op when reload is called with no active folder', async () => {
    const { result } = renderHook(() => useCurationState(null, []));
    await act(async () => {});
    const callCountBefore = mockReadCuration.mock.calls.length;
    await act(async () => { await result.current.reload(); });
    expect(mockReadCuration.mock.calls.length).toBe(callCountBefore);
  });

  it('should flush pending writes before re-reading on reload', async () => {
    const callOrder: string[] = [];
    mockWriteCuration.mockImplementation(async () => { callOrder.push('write'); });
    mockReadCuration.mockImplementation(async () => { callOrder.push('read'); return null; });
    const file = makeFile('a.jpg', '/Photos/Lyon/a.jpg');
    const { result } = renderHook(() => useCurationState('/Photos/Lyon', []));
    await act(async () => {});
    callOrder.length = 0;
    act(() => { result.current.setFlag(file, 'keep'); });
    await act(async () => { await result.current.reload(); });
    const writeIdx = callOrder.indexOf('write');
    const readIdx = callOrder.lastIndexOf('read');
    expect(writeIdx).toBeGreaterThanOrEqual(0);
    expect(writeIdx).toBeLessThan(readIdx);
  });

  describe('groupIds derivation', () => {
    it('should return an empty map when no records have a groupId', async () => {
      mockReadCuration.mockResolvedValue(null);
      const { result } = renderHook(() => useCurationState('/Photos/Lyon', []));
      await act(async () => {});
      expect(result.current.groupIds).toEqual({});
    });

    it('should include records that have groupId set', async () => {
      // Given a curation file with one grouped record
      mockReadCuration.mockResolvedValue({
        folderPath: '/Photos/Lyon',
        records: {
          'id:a.jpg': { photoId: 'id:a.jpg', pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', groupId: 'g1' },
        },
      });
      const { result } = renderHook(() => useCurationState('/Photos/Lyon', []));
      // When records load
      await act(async () => {});
      // Then groupIds contains the mapping
      expect(result.current.groupIds['id:a.jpg']).toBe('g1');
    });

    it('should exclude records that only have flag set', async () => {
      // Given a flagged record (no groupId)
      mockReadCuration.mockResolvedValue({
        folderPath: '/Photos/Lyon',
        records: {
          'id:a.jpg': { photoId: 'id:a.jpg', pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep' },
        },
      });
      const { result } = renderHook(() => useCurationState('/Photos/Lyon', []));
      await act(async () => {});
      // Then groupIds is empty (flag-only records are excluded)
      expect(result.current.groupIds).toEqual({});
    });

    it('should update groupIds after setFlag transitions a grouped record back to a flag', async () => {
      // Given a record with groupId
      mockReadCuration.mockResolvedValue({
        folderPath: '/Photos/Lyon',
        records: {
          'id:a.jpg': { photoId: 'id:a.jpg', pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', groupId: 'g1' },
        },
      });
      const file = makeFile('a.jpg', '/Photos/Lyon/a.jpg');
      const { result } = renderHook(() => useCurationState('/Photos/Lyon', []));
      await act(async () => {});
      expect(result.current.groupIds['id:a.jpg']).toBe('g1');
      // When flag is applied (XOR: clears groupId)
      act(() => { result.current.setFlag(file, 'keep'); });
      // Then groupIds no longer contains the record
      expect(result.current.groupIds['id:a.jpg']).toBeUndefined();
    });
  });

  it('should clear groupId when setFlag is called on a record that previously had a groupId', async () => {
    mockReadCuration.mockResolvedValue({
      folderPath: '/Photos/Lyon',
      records: {
        'id:a.jpg': { photoId: 'id:a.jpg', pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', groupId: 'g1' },
      },
    });
    const file = makeFile('a.jpg', '/Photos/Lyon/a.jpg');
    const { result } = renderHook(() => useCurationState('/Photos/Lyon', []));
    await act(async () => {});
    act(() => { result.current.setFlag(file, 'keep'); });
    await act(async () => { vi.advanceTimersByTime(250); });
    const written = mockWriteCuration.mock.calls[0][0].records['id:a.jpg'];
    expect(written.flag).toBe('keep');
    expect(written.groupId).toBeUndefined();
  });
});
