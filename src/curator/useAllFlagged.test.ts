// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { CurationFile } from './curation';

const mockListCuration = vi.fn();
const mockWriteCuration = vi.fn();

vi.mock('./curation', () => ({
  listCuration: (...args: unknown[]) => mockListCuration(...args),
  writeCuration: (...args: unknown[]) => mockWriteCuration(...args),
}));

import { useAllFlagged } from './useAllFlagged';

function makeFile(folderPath: string, entries: Array<{ pathLower: string; name: string; flag: 'keep' | 'discard' }>): CurationFile {
  const records: CurationFile['records'] = {};
  for (const e of entries) {
    records[e.pathLower] = {
      pathLower: e.pathLower,
      pathDisplay: e.pathLower,
      name: e.name,
      flag: e.flag,
    };
  }
  return { folderPath, records };
}

beforeEach(() => {
  vi.useFakeTimers();
  mockListCuration.mockReset();
  mockWriteCuration.mockReset();
  mockListCuration.mockResolvedValue([]);
  mockWriteCuration.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAllFlagged', () => {
  it('should load all curation files on mount and flatten records across folders', async () => {
    mockListCuration.mockResolvedValue([
      makeFile('/Photos/Lyon', [{ pathLower: '/photos/lyon/a.jpg', name: 'a.jpg', flag: 'keep' }]),
      makeFile('/Photos/Paris', [{ pathLower: '/photos/paris/b.jpg', name: 'b.jpg', flag: 'discard' }]),
    ]);
    const { result } = renderHook(() => useAllFlagged());
    await act(async () => {});
    expect(result.current.records).toHaveLength(2);
    expect(result.current.records[0].folderPath).toBe('/Photos/Lyon');
    expect(result.current.records[1].folderPath).toBe('/Photos/Paris');
  });

  it('should filter correctly when consumer filters by flag', async () => {
    mockListCuration.mockResolvedValue([
      makeFile('/Photos/Lyon', [
        { pathLower: '/photos/lyon/a.jpg', name: 'a.jpg', flag: 'keep' },
        { pathLower: '/photos/lyon/b.jpg', name: 'b.jpg', flag: 'discard' },
      ]),
    ]);
    const { result } = renderHook(() => useAllFlagged());
    await act(async () => {});
    const keeps = result.current.records.filter((r) => r.record.flag === 'keep');
    expect(keeps).toHaveLength(1);
    expect(keeps[0].record.name).toBe('a.jpg');
  });

  it('should update in-memory records synchronously on setFlag', async () => {
    mockListCuration.mockResolvedValue([
      makeFile('/Photos/Lyon', [{ pathLower: '/photos/lyon/a.jpg', name: 'a.jpg', flag: 'keep' }]),
    ]);
    const { result } = renderHook(() => useAllFlagged());
    await act(async () => {});
    act(() => {
      result.current.setFlag('/Photos/Lyon', '/photos/lyon/a.jpg', 'discard');
    });
    const rec = result.current.records.find((r) => r.record.pathLower === '/photos/lyon/a.jpg');
    expect(rec?.record.flag).toBe('discard');
  });

  it('should remove record on setFlag with undefined', async () => {
    mockListCuration.mockResolvedValue([
      makeFile('/Photos/Lyon', [{ pathLower: '/photos/lyon/a.jpg', name: 'a.jpg', flag: 'keep' }]),
    ]);
    const { result } = renderHook(() => useAllFlagged());
    await act(async () => {});
    act(() => {
      result.current.setFlag('/Photos/Lyon', '/photos/lyon/a.jpg', undefined);
    });
    const rec = result.current.records.find((r) => r.record.pathLower === '/photos/lyon/a.jpg');
    expect(rec).toBeUndefined();
  });

  it('should debounce: two rapid setFlag calls to same folder produce one write after 250ms', async () => {
    mockListCuration.mockResolvedValue([
      makeFile('/Photos/Lyon', [{ pathLower: '/photos/lyon/a.jpg', name: 'a.jpg', flag: 'keep' }]),
    ]);
    const { result } = renderHook(() => useAllFlagged());
    await act(async () => {});
    act(() => {
      result.current.setFlag('/Photos/Lyon', '/photos/lyon/a.jpg', 'discard');
      result.current.setFlag('/Photos/Lyon', '/photos/lyon/a.jpg', 'keep');
    });
    expect(mockWriteCuration).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(250); });
    expect(mockWriteCuration).toHaveBeenCalledOnce();
    expect(mockWriteCuration.mock.calls[0][0].records['/photos/lyon/a.jpg'].flag).toBe('keep');
  });

  it('should not trigger a write for folder B when only folder A changes', async () => {
    mockListCuration.mockResolvedValue([
      makeFile('/Photos/Lyon', [{ pathLower: '/photos/lyon/a.jpg', name: 'a.jpg', flag: 'keep' }]),
      makeFile('/Photos/Paris', [{ pathLower: '/photos/paris/b.jpg', name: 'b.jpg', flag: 'discard' }]),
    ]);
    const { result } = renderHook(() => useAllFlagged());
    await act(async () => {});
    act(() => {
      result.current.setFlag('/Photos/Lyon', '/photos/lyon/a.jpg', 'discard');
    });
    await act(async () => { vi.advanceTimersByTime(250); });
    expect(mockWriteCuration).toHaveBeenCalledOnce();
    expect(mockWriteCuration.mock.calls[0][0].folderPath).toBe('/Photos/Lyon');
  });

  it('flush() should write all pending folders immediately', async () => {
    mockListCuration.mockResolvedValue([
      makeFile('/Photos/Lyon', [{ pathLower: '/photos/lyon/a.jpg', name: 'a.jpg', flag: 'keep' }]),
      makeFile('/Photos/Paris', [{ pathLower: '/photos/paris/b.jpg', name: 'b.jpg', flag: 'discard' }]),
    ]);
    const { result } = renderHook(() => useAllFlagged());
    await act(async () => {});
    act(() => {
      result.current.setFlag('/Photos/Lyon', '/photos/lyon/a.jpg', 'discard');
      result.current.setFlag('/Photos/Paris', '/photos/paris/b.jpg', 'keep');
    });
    expect(mockWriteCuration).not.toHaveBeenCalled();
    act(() => { result.current.flush(); });
    expect(mockWriteCuration).toHaveBeenCalledTimes(2);
    // No further writes after debounce expires
    await act(async () => { vi.advanceTimersByTime(250); });
    expect(mockWriteCuration).toHaveBeenCalledTimes(2);
  });

  it('reload() should re-invoke listCuration and refresh records', async () => {
    mockListCuration.mockResolvedValue([
      makeFile('/Photos/Lyon', [{ pathLower: '/photos/lyon/a.jpg', name: 'a.jpg', flag: 'keep' }]),
    ]);
    const { result } = renderHook(() => useAllFlagged());
    await act(async () => {});
    expect(mockListCuration).toHaveBeenCalledTimes(1);

    mockListCuration.mockResolvedValue([
      makeFile('/Photos/Lyon', [
        { pathLower: '/photos/lyon/a.jpg', name: 'a.jpg', flag: 'keep' },
        { pathLower: '/photos/lyon/c.jpg', name: 'c.jpg', flag: 'discard' },
      ]),
    ]);
    await act(async () => { await result.current.reload(); });
    expect(mockListCuration).toHaveBeenCalledTimes(2);
    expect(result.current.records).toHaveLength(2);
  });

  it('should flush pending writes on unmount', async () => {
    mockListCuration.mockResolvedValue([
      makeFile('/Photos/Lyon', [{ pathLower: '/photos/lyon/a.jpg', name: 'a.jpg', flag: 'keep' }]),
    ]);
    const { result, unmount } = renderHook(() => useAllFlagged());
    await act(async () => {});
    act(() => {
      result.current.setFlag('/Photos/Lyon', '/photos/lyon/a.jpg', 'discard');
    });
    expect(mockWriteCuration).not.toHaveBeenCalled();
    unmount();
    expect(mockWriteCuration).toHaveBeenCalledOnce();
  });
});
