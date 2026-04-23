// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockReadCuration = vi.fn();
const mockWriteCuration = vi.fn();
const mockMigrateToIdKeys = vi.fn();

vi.mock('./curation', () => ({
  readCuration: (...args: unknown[]) => mockReadCuration(...args),
  writeCuration: (...args: unknown[]) => mockWriteCuration(...args),
  migrateToIdKeys: (...args: unknown[]) => mockMigrateToIdKeys(...args),
}));

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
});
