// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockReadCuration = vi.fn();
const mockWriteCuration = vi.fn();

vi.mock('./curation', () => ({
  readCuration: (...args: unknown[]) => mockReadCuration(...args),
  writeCuration: (...args: unknown[]) => mockWriteCuration(...args),
}));

import { useCurationState } from './useCurationState';

function makeFile(name: string, path: string) {
  return {
    '.tag': 'file' as const,
    name,
    path_display: path,
    path_lower: path.toLowerCase(),
    id: `id-${name}`,
    size: 1024,
    server_modified: '2026-01-01T00:00:00Z',
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  mockReadCuration.mockReset();
  mockWriteCuration.mockReset();
  mockReadCuration.mockResolvedValue(null);
  mockWriteCuration.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCurationState', () => {
  it('should expose an empty flags map when the folder has no file yet', async () => {
    mockReadCuration.mockResolvedValue(null);
    const { result } = renderHook(() => useCurationState('/Photos/Lyon'));
    await act(async () => {});
    expect(result.current.flags).toEqual({});
  });

  it('should load existing flags from disk on mount (new shape)', async () => {
    mockReadCuration.mockResolvedValue({
      folderPath: '/Photos/Lyon',
      records: {
        '/photos/lyon/a.jpg': { pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep' },
      },
    });
    const { result } = renderHook(() => useCurationState('/Photos/Lyon'));
    await act(async () => {});
    expect(result.current.flags['/photos/lyon/a.jpg']).toBe('keep');
  });

  it('should load and migrate a legacy flags file from disk', async () => {
    mockReadCuration.mockResolvedValue({
      folderPath: '/Photos/Lyon',
      records: {
        '/photos/lyon/a.jpg': { pathLower: '/photos/lyon/a.jpg', pathDisplay: '/photos/lyon/a.jpg', name: 'a.jpg', flag: 'keep' },
      },
    });
    const { result } = renderHook(() => useCurationState('/Photos/Lyon'));
    await act(async () => {});
    expect(result.current.flags['/photos/lyon/a.jpg']).toBe('keep');
  });

  it('should update local flags immediately on setFlag (keep)', async () => {
    const file = makeFile('b.jpg', '/Photos/Lyon/b.jpg');
    const { result } = renderHook(() => useCurationState('/Photos/Lyon'));
    await act(async () => {});
    act(() => {
      result.current.setFlag(file, 'discard');
    });
    expect(result.current.flags['/photos/lyon/b.jpg']).toBe('discard');
  });

  it('should remove the flag when setFlag is called with undefined', async () => {
    mockReadCuration.mockResolvedValue({
      folderPath: '/Photos/Lyon',
      records: {
        '/photos/lyon/a.jpg': { pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep' },
      },
    });
    const file = makeFile('a.jpg', '/Photos/Lyon/a.jpg');
    const { result } = renderHook(() => useCurationState('/Photos/Lyon'));
    await act(async () => {});
    act(() => {
      result.current.setFlag(file, undefined);
    });
    expect(result.current.flags['/photos/lyon/a.jpg']).toBeUndefined();
  });

  it('should debounce writes to 250 ms and coalesce rapid calls into one writeCuration', async () => {
    const fileA = makeFile('a.jpg', '/Photos/Lyon/a.jpg');
    const fileB = makeFile('b.jpg', '/Photos/Lyon/b.jpg');
    const { result } = renderHook(() => useCurationState('/Photos/Lyon'));
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
    expect(mockWriteCuration.mock.calls[0][0].records['/photos/lyon/a.jpg'].flag).toBe('discard');
    expect(mockWriteCuration.mock.calls[0][0].records['/photos/lyon/b.jpg'].flag).toBe('keep');
  });

  it('should flush any pending write synchronously when folderPath changes', async () => {
    const file = makeFile('a.jpg', '/Photos/Lyon/a.jpg');
    let folder = '/Photos/Lyon';
    const { result, rerender } = renderHook(() => useCurationState(folder));
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
    const { result, unmount } = renderHook(() => useCurationState('/Photos/Lyon'));
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
    const { result } = renderHook(() => useCurationState('/Photos/Lyon'));
    await act(async () => {});
    act(() => {
      result.current.setFlag(file, 'keep');
    });
    expect(mockWriteCuration).not.toHaveBeenCalled();
    act(() => {
      result.current.flush();
    });
    expect(mockWriteCuration).toHaveBeenCalledOnce();
    // Timer should be cancelled — no second write after 250ms
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(mockWriteCuration).toHaveBeenCalledOnce();
  });
});
