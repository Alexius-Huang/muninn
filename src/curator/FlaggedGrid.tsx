import { useLayoutEffect, useRef, useState, useSyncExternalStore, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ThumbnailCell } from './ThumbnailCell';
import type { ThumbnailCache } from './useThumbnailCache';
import type { FlatRecord } from './useAllFlagged';

const CELL_SIZE = 160;
const LABEL_HEIGHT = 20;
const GAP = 8;

type CellProps = {
  flat: FlatRecord;
  cache: ThumbnailCache;
  onSelect: () => void;
};

function GridCell({ flat, cache, onSelect }: CellProps) {
  const { record } = flat;

  const state = useSyncExternalStore(
    (cb) => cache.subscribe(record.pathLower, cb),
    () => cache.peek(record.pathLower),
  );

  useEffect(() => {
    cache.request(record.pathDisplay);
  }, [record.pathDisplay, cache]);

  // Synthesise a minimal DropboxFile shape for ThumbnailCell
  const file = {
    '.tag': 'file' as const,
    name: record.name,
    path_display: record.pathDisplay,
    path_lower: record.pathLower,
    id: record.pathLower,
    size: 0,
    server_modified: '',
  };

  return <ThumbnailCell file={file} state={state} flag={record.flag} onClick={onSelect} />;
}

type Props = {
  records: FlatRecord[];
  cache: ThumbnailCache;
  onSelect: (index: number) => void;
};

export function FlaggedGrid({ records, cache, onSelect }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setColumns(Math.max(2, Math.floor((w - 32) / (CELL_SIZE + GAP))));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rowCount = Math.ceil(records.length / columns);
  const gridWidth = columns * CELL_SIZE + (columns - 1) * GAP;

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CELL_SIZE + LABEL_HEIGHT + GAP,
    overscan: 4,
  });

  return (
    <div ref={parentRef} className="flex-1 min-h-0 overflow-y-auto">
      <div
        style={{
          height: virtualizer.getTotalSize() + 16,
          position: 'relative',
          width: gridWidth,
          margin: '0 auto',
        }}
      >
        {virtualizer.getVirtualItems().map((vRow) => {
          const startIndex = vRow.index * columns;
          const rowRecords = records.slice(startIndex, startIndex + columns);
          return (
            <div
              key={vRow.key}
              style={{
                position: 'absolute',
                top: vRow.start + 16,
                left: 0,
                width: gridWidth,
                display: 'flex',
                gap: GAP,
              }}
            >
              {rowRecords.map((flat, colIdx) => (
                <GridCell
                  key={flat.record.pathLower}
                  flat={flat}
                  cache={cache}
                  onSelect={() => onSelect(startIndex + colIdx)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
