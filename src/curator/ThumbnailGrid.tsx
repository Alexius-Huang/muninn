import { createContext, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { DropboxEntry, DropboxFile } from '../dropbox/client';
import type { ThumbnailCache } from './useThumbnailCache';
import { ThumbnailCell } from './ThumbnailCell';
import type { CurationFlags } from './curation';

const CELL_SIZE = 160;
const LABEL_HEIGHT = 20;
const GAP = 8;

const CacheContext = createContext<ThumbnailCache | null>(null);

function useCacheContext(): ThumbnailCache {
  const ctx = useContext(CacheContext);
  if (!ctx) throw new Error('ThumbnailCell must be inside ThumbnailGrid');
  return ctx;
}

function ConnectedCell({
  file,
  flag,
  onSelect,
}: {
  file: DropboxFile;
  flag: CurationFlags[string] | undefined;
  onSelect: () => void;
}) {
  const cache = useCacheContext();

  const state = useSyncExternalStore(
    (cb) => cache.subscribe(file.path_lower, cb),
    () => cache.peek(file.path_lower),
  );

  useEffect(() => {
    cache.request(file.path_display);
  }, [file.path_display, cache]);

  return <ThumbnailCell file={file} state={state} flag={flag} onClick={onSelect} />;
}

type Props = {
  path: string;
  entries: DropboxEntry[];
  cache: ThumbnailCache;
  flags: CurationFlags;
  onSelect: (index: number) => void;
};

export function sortFiles(entries: DropboxEntry[]): DropboxFile[] {
  return (entries as DropboxEntry[])
    .filter((e): e is DropboxFile => e['.tag'] === 'file')
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

export function ThumbnailGrid({ path, entries, cache, flags, onSelect }: Props) {
  const files = sortFiles(entries);
  const displayPath = path === '' ? '/' : path;

  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const updateColumns = () => {
      const w = el.clientWidth;
      if (w > 0) {
        setColumns(Math.max(2, Math.floor((w - 32) / (CELL_SIZE + GAP))));
      }
    };
    updateColumns();
    const ro = new ResizeObserver(updateColumns);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rowCount = Math.ceil(files.length / columns);
  const gridWidth = columns * CELL_SIZE + (columns - 1) * GAP;

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CELL_SIZE + LABEL_HEIGHT + GAP,
    overscan: 4,
  });

  return (
    <CacheContext.Provider value={cache}>
      <div className="flex flex-col h-full">
        <div className="shrink-0 px-6 pt-4 pb-3 bg-nord-0 border-b border-nord-3">
          <h2 className="text-nord-6 font-semibold text-lg">
            {files.length} photos in {displayPath}
          </h2>
        </div>

        {files.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-nord-4 text-sm">No photos in this folder</p>
          </div>
        ) : (
          <div ref={parentRef} className="flex-1 min-h-0 overflow-y-auto">
            <div
              style={{
                height: virtualizer.getTotalSize() + 16,
                position: 'relative',
                width: gridWidth,
                margin: '0 auto',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const startIndex = virtualRow.index * columns;
                const rowFiles = files.slice(startIndex, startIndex + columns);
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: virtualRow.start + 16,
                      left: 0,
                      width: gridWidth,
                      display: 'flex',
                      gap: GAP,
                    }}
                  >
                    {rowFiles.map((file, colIdx) => (
                      <ConnectedCell
                        key={file.path_lower}
                        file={file}
                        flag={flags[file.path_lower]}
                        onSelect={() => onSelect(startIndex + colIdx)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </CacheContext.Provider>
  );
}
