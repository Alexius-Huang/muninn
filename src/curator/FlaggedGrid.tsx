import { useLayoutEffect, useRef, useState, useSyncExternalStore, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ThumbnailCell } from './ThumbnailCell';
import type { ThumbnailCache } from './store';
import type { FlatRecord } from './store';

const CELL_SIZE = 160;
const LABEL_HEIGHT = 20;
const GAP = 8;

type CellProps = {
  flat: FlatRecord;
  cache: ThumbnailCache;
  isActive: boolean;
  onSelect: () => void;
};

function GridCell({ flat, cache, isActive, onSelect }: CellProps) {
  const { record } = flat;
  const cellRef = useRef<HTMLButtonElement>(null);

  const state = useSyncExternalStore(
    (cb) => cache.subscribe(record.pathLower, cb),
    () => cache.peek(record.pathLower),
  );

  useEffect(() => {
    cache.request(record.pathDisplay);
  }, [record.pathDisplay, cache]);

  useEffect(() => {
    if (isActive) {
      cellRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }, [isActive]);

  const file = {
    '.tag': 'file' as const,
    name: record.name,
    path_display: record.pathDisplay,
    path_lower: record.pathLower,
    id: record.photoId ?? record.pathLower,
    size: 0,
    server_modified: '',
    client_modified: '',
  };

  return <ThumbnailCell ref={cellRef} file={file} state={state} flag={record.flag} isActive={isActive} onClick={onSelect} onRetry={() => cache.retry(record.pathLower)} />;
}

type Props = {
  records: FlatRecord[];
  cache: ThumbnailCache;
  activeIndex?: number | null;
  onSelect: (index: number) => void;
  onColumnsChange?: (columns: number) => void;
};

export function FlaggedGrid({ records, cache, activeIndex, onSelect, onColumnsChange }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      if (w > 0) {
        const next = Math.max(2, Math.floor((w - 32) / (CELL_SIZE + GAP)));
        setColumns(next);
        onColumnsChange?.(next);
      }
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onColumnsChange]);

  const rowCount = Math.ceil(records.length / columns);
  const gridWidth = columns * CELL_SIZE + (columns - 1) * GAP;

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CELL_SIZE + LABEL_HEIGHT + GAP,
    overscan: 4,
  });

  useEffect(() => {
    if (activeIndex == null || columns === 0) return;
    const rowIndex = Math.floor(activeIndex / columns);
    virtualizer.scrollToIndex(rowIndex, { align: 'auto' });
  }, [activeIndex, columns, virtualizer]);

  return (
    <div ref={parentRef} className="flex-1 min-h-0 overflow-y-auto scroll-smooth">
      <div
        style={{
          height: virtualizer.getTotalSize() + 16,
          position: 'relative',
          width: gridWidth,
          marginLeft: 32,
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
                  isActive={activeIndex === startIndex + colIdx}
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
