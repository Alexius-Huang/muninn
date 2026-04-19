import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThumbnailCache } from './useThumbnailCache';

vi.mock('../dropbox/client', () => ({
  getThumbnailBatch: vi.fn(),
}));

import { getThumbnailBatch } from '../dropbox/client';
const mockGetThumbnailBatch = vi.mocked(getThumbnailBatch);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetThumbnailBatch.mockResolvedValue([]);
});

describe('useThumbnailCache', () => {
  it('should mark a newly requested path as loading synchronously', () => {
    const { result } = renderHook(() => useThumbnailCache());
    const state = result.current.request('/Photos/a.jpg');
    expect(state).toEqual({ tag: 'loading' });
  });

  it('should issue exactly one batch call when multiple cells request distinct paths in the same microtask', async () => {
    mockGetThumbnailBatch.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({ tag: 'success' as const, path_lower: `/img-${i}.jpg`, dataUrl: `data:image/jpeg;base64,x` })),
    );
    const { result } = renderHook(() => useThumbnailCache());
    await act(async () => {
      for (let i = 0; i < 10; i++) result.current.request(`/img-${i}.jpg`);
      await Promise.resolve(); // flush microtask
    });
    expect(mockGetThumbnailBatch).toHaveBeenCalledTimes(1);
    const [paths] = mockGetThumbnailBatch.mock.calls[0];
    expect(paths).toHaveLength(10);
  });

  it('should coalesce duplicate requests for the same path into a single batch entry', async () => {
    mockGetThumbnailBatch.mockResolvedValue([{ tag: 'success', path_lower: '/a.jpg', dataUrl: 'data:image/jpeg;base64,x' }]);
    const { result } = renderHook(() => useThumbnailCache());
    await act(async () => {
      result.current.request('/a.jpg');
      result.current.request('/a.jpg');
      result.current.request('/a.jpg');
      await Promise.resolve();
    });
    expect(mockGetThumbnailBatch).toHaveBeenCalledTimes(1);
    const [paths] = mockGetThumbnailBatch.mock.calls[0];
    expect(paths).toHaveLength(1);
    expect(paths[0]).toBe('/a.jpg');
  });

  it('should chunk into multiple parallel batches when >25 paths are pending', async () => {
    mockGetThumbnailBatch.mockImplementation((paths) =>
      Promise.resolve(paths.map((p) => ({ tag: 'success' as const, path_lower: p.toLowerCase(), dataUrl: 'data:image/jpeg;base64,x' }))),
    );
    const { result } = renderHook(() => useThumbnailCache());
    await act(async () => {
      for (let i = 0; i < 60; i++) result.current.request(`/img-${i}.jpg`);
      await Promise.resolve();
    });
    expect(mockGetThumbnailBatch).toHaveBeenCalledTimes(3);
    const callLengths = mockGetThumbnailBatch.mock.calls.map(([p]) => p.length);
    expect(callLengths.sort((a, b) => b - a)).toEqual([25, 25, 10]);
  });

  it('should transition state to success with a dataUrl when the batch resolves', async () => {
    mockGetThumbnailBatch.mockResolvedValue([{ tag: 'success', path_lower: '/a.jpg', dataUrl: 'data:image/jpeg;base64,xyz' }]);
    const { result } = renderHook(() => useThumbnailCache());
    await act(async () => {
      result.current.request('/a.jpg');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.peek('/a.jpg')).toEqual({ tag: 'success', dataUrl: 'data:image/jpeg;base64,xyz' });
  });

  it('should transition state to error for paths whose batch entry was a failure', async () => {
    mockGetThumbnailBatch.mockResolvedValue([{ tag: 'failure', path_lower: '/raw.cr2', reason: 'unsupported_extension' }]);
    const { result } = renderHook(() => useThumbnailCache());
    await act(async () => {
      result.current.request('/RAW.cr2');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.peek('/raw.cr2')).toEqual({ tag: 'error' });
  });

  it('should transition every path in a batch to error when the whole batch HTTP call rejects', async () => {
    mockGetThumbnailBatch.mockRejectedValue(new Error('Network down'));
    const { result } = renderHook(() => useThumbnailCache());
    await act(async () => {
      result.current.request('/a.jpg');
      result.current.request('/b.jpg');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.peek('/a.jpg')).toEqual({ tag: 'error' });
    expect(result.current.peek('/b.jpg')).toEqual({ tag: 'error' });
  });

  it('should return the cached state on subsequent requests (no new fetch)', async () => {
    mockGetThumbnailBatch.mockResolvedValue([{ tag: 'success', path_lower: '/a.jpg', dataUrl: 'data:image/jpeg;base64,x' }]);
    const { result } = renderHook(() => useThumbnailCache());
    await act(async () => {
      result.current.request('/a.jpg');
      await new Promise((r) => setTimeout(r, 0));
    });
    // second request — should hit cache
    result.current.request('/a.jpg');
    expect(mockGetThumbnailBatch).toHaveBeenCalledTimes(1);
  });
});
