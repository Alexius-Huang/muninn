import { useEffect, useSyncExternalStore } from 'react';
import type { FlatRecord, ThumbnailCache } from './store';

type Props = {
  record: FlatRecord;
  cache: ThumbnailCache;
};

export function ThumbnailTile({ record, cache }: Props) {
  const state = useSyncExternalStore(
    (cb) => cache.subscribe(record.record.pathLower, cb),
    () => cache.peek(record.record.pathLower),
  );

  useEffect(() => {
    cache.request(record.record.pathDisplay);
  }, [record.record.pathDisplay, cache]);

  return (
    <div
      data-testid="mosaic-cell"
      className="relative overflow-hidden bg-nord-2 w-full h-full"
    >
      {state.tag === 'success' && (
        <img
          src={state.dataUrl}
          alt={record.record.name}
          className="object-cover w-full h-full"
        />
      )}
    </div>
  );
}
