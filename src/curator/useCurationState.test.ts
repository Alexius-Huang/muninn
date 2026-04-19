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
  it('should expose an empty map when the folder has no file yet', async () => {
    mockReadCuration.mockResolvedValue(null);
    const { result } = renderHook(() => useCurationState('/Photos/Lyon'));
    await act(async () => {});
    expect(result.current.flags).toEqual({});
  });

  it('should load existing flags from disk on mount', async () => {
    mockReadCuration.mockResolvedValue({
      folderPath: '/Photos/Lyon',
      flags: { '/photos/lyon/a.jpg': 'keep' },
    });
    const { result } = renderHook(() => useCurationState('/Photos/Lyon'));
    await act(async () => {});
    expect(result.current.flags).toEqual({ '/photos/lyon/a.jpg': 'keep' });
  });

  it('should update local state immediately on setFlag', async () => {
    const { result } = renderHook(() => useCurationState('/Photos/Lyon'));
    await act(async () => {});
    act(() => {
      result.current.setFlag('/photos/lyon/b.jpg', 'discard');
    });
    expect(result.current.flags['/photos/lyon/b.jpg']).toBe('discard');
  });

  it('should debounce writes to 250 ms and coalesce rapid calls into one writeCuration', async () => {
    const { result } = renderHook(() => useCurationState('/Photos/Lyon'));
    await act(async () => {});
    act(() => {
      result.current.setFlag('/photos/lyon/a.jpg', 'keep');
      result.current.setFlag('/photos/lyon/a.jpg', 'discard');
      result.current.setFlag('/photos/lyon/b.jpg', 'keep');
    });
    expect(mockWriteCuration).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(mockWriteCuration).toHaveBeenCalledOnce();
    expect(mockWriteCuration.mock.calls[0][0].flags['/photos/lyon/a.jpg']).toBe('discard');
    expect(mockWriteCuration.mock.calls[0][0].flags['/photos/lyon/b.jpg']).toBe('keep');
  });

  it('should flush any pending write synchronously when folderPath changes', async () => {
    let folder = '/Photos/Lyon';
    const { result, rerender } = renderHook(() => useCurationState(folder));
    await act(async () => {});
    act(() => {
      result.current.setFlag('/photos/lyon/a.jpg', 'keep');
    });
    expect(mockWriteCuration).not.toHaveBeenCalled();
    folder = '/Photos/Paris';
    await act(async () => {
      rerender();
    });
    expect(mockWriteCuration).toHaveBeenCalledOnce();
  });

  it('should flush any pending write synchronously on unmount', async () => {
    const { result, unmount } = renderHook(() => useCurationState('/Photos/Lyon'));
    await act(async () => {});
    act(() => {
      result.current.setFlag('/photos/lyon/a.jpg', 'keep');
    });
    expect(mockWriteCuration).not.toHaveBeenCalled();
    unmount();
    expect(mockWriteCuration).toHaveBeenCalledOnce();
  });
});
