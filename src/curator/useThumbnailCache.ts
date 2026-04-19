import { useCallback, useRef } from 'react';
import { getThumbnailBatch } from '../dropbox/client';

export type ThumbnailState =
  | { tag: 'loading' }
  | { tag: 'success'; dataUrl: string }
  | { tag: 'error' };

const DEFAULT_LOADING: ThumbnailState = { tag: 'loading' };

type Subscriber = () => void;

export type ThumbnailCache = {
  request: (pathDisplay: string) => ThumbnailState;
  subscribe: (pathLower: string, cb: Subscriber) => () => void;
  peek: (pathLower: string) => ThumbnailState;
};

export function useThumbnailCache(): ThumbnailCache {
  const cacheRef = useRef<Map<string, ThumbnailState>>(new Map());
  const subsRef = useRef<Map<string, Set<Subscriber>>>(new Map());
  const pendingRef = useRef<Set<string>>(new Set());
  const scheduledRef = useRef(false);

  const notify = useCallback((pathLower: string) => {
    subsRef.current.get(pathLower)?.forEach((cb) => cb());
  }, []);

  const flush = useCallback(() => {
    scheduledRef.current = false;
    const all = [...pendingRef.current];
    pendingRef.current.clear();
    if (all.length === 0) return;

    for (let i = 0; i < all.length; i += 25) {
      const chunk = all.slice(i, i + 25);
      getThumbnailBatch(chunk).then(
        (results) => {
          for (const r of results) {
            if (r.tag === 'success') {
              cacheRef.current.set(r.path_lower, { tag: 'success', dataUrl: r.dataUrl });
              notify(r.path_lower);
            } else {
              cacheRef.current.set(r.path_lower, { tag: 'error' });
              notify(r.path_lower);
            }
          }
        },
        () => {
          for (const p of chunk) {
            const key = p.toLowerCase();
            cacheRef.current.set(key, { tag: 'error' });
            notify(key);
          }
        },
      );
    }
  }, [notify]);

  const request = useCallback(
    (pathDisplay: string): ThumbnailState => {
      const key = pathDisplay.toLowerCase();
      const existing = cacheRef.current.get(key);
      if (existing) return existing;

      const loading: ThumbnailState = { tag: 'loading' };
      cacheRef.current.set(key, loading);
      pendingRef.current.add(pathDisplay);

      if (!scheduledRef.current) {
        scheduledRef.current = true;
        queueMicrotask(flush);
      }

      return loading;
    },
    [flush],
  );

  const subscribe = useCallback((pathLower: string, cb: Subscriber): (() => void) => {
    if (!subsRef.current.has(pathLower)) {
      subsRef.current.set(pathLower, new Set());
    }
    subsRef.current.get(pathLower)!.add(cb);
    return () => {
      subsRef.current.get(pathLower)?.delete(cb);
    };
  }, []);

  const peek = useCallback(
    (pathLower: string): ThumbnailState =>
      cacheRef.current.get(pathLower) ?? DEFAULT_LOADING,
    [],
  );

  return { request, subscribe, peek };
}
