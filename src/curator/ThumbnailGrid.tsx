import { createContext, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { DropboxEntry, DropboxFile } from '../dropbox/client';
import type { ThumbnailCache } from './useThumbnailCache';
import { ThumbnailCell } from './ThumbnailCell';
import type { CurationFlags } from './curation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/shadcn/dialog';
import { Button } from '@/components/shadcn/button';

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
  groupId,
  isActive,
  onSelect,
}: {
  file: DropboxFile;
  flag: CurationFlags[string] | undefined;
  groupId?: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  const cache = useCacheContext();
  const cellRef = useRef<HTMLButtonElement>(null);

  const state = useSyncExternalStore(
    (cb) => cache.subscribe(file.path_lower, cb),
    () => cache.peek(file.path_lower),
  );

  useEffect(() => {
    cache.request(file.path_display);
  }, [file.path_display, cache]);

  useEffect(() => {
    if (isActive) {
      cellRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }, [isActive]);

  return <ThumbnailCell ref={cellRef} file={file} state={state} flag={flag} groupId={groupId} isActive={isActive} onClick={onSelect} />;
}

type Props = {
  path: string;
  entries: DropboxEntry[];
  cache: ThumbnailCache;
  flags: CurationFlags;
  groupIds?: Record<string, string>;
  showGrouped?: boolean;
  onToggleShowGrouped?: () => void;
  activeIndex?: number | null;
  onSelect: (index: number) => void;
  onClearAll?: () => void;
  onColumnsChange?: (columns: number) => void;
};

export function sortFiles(entries: DropboxEntry[]): DropboxFile[] {
  return (entries as DropboxEntry[])
    .filter((e): e is DropboxFile => e['.tag'] === 'file')
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

export function ThumbnailGrid({ path, entries, cache, flags, groupIds, showGrouped, onToggleShowGrouped, activeIndex, onSelect, onClearAll, onColumnsChange }: Props) {
  const files = sortFiles(entries);
  const displayPath = path === '' ? '/' : path;
  const flagCount = Object.keys(flags).length;
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  const rowCount = Math.ceil(files.length / columns);
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
    <CacheContext.Provider value={cache}>
      <div className="flex flex-col h-full">
        <div className="shrink-0 px-6 pt-4 pb-3 bg-nord-0 border-b border-nord-3 flex items-center gap-2">
          <h2 className="text-nord-6 font-semibold text-lg mr-auto">
            {files.length} photos in {displayPath}
          </h2>
          {onToggleShowGrouped && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleShowGrouped}
              aria-pressed={showGrouped ?? true}
              className={(showGrouped ?? true) ? 'bg-nord-2 text-nord-6' : ''}
            >
              Show grouped
            </Button>
          )}
          {onClearAll && (
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={flagCount === 0}
              >
                Clear All
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Clear all flags?</DialogTitle>
                  <DialogDescription>
                    All keep/discard flags for this folder will be removed. No photos are deleted from Dropbox.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => { onClearAll(); setConfirmOpen(false); }}
                  >
                    Clear All
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {files.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-nord-4 text-sm">No photos in this folder</p>
          </div>
        ) : (
          <div ref={parentRef} className="flex-1 min-h-0 overflow-y-auto scroll-smooth">
            <div
              style={{
                height: virtualizer.getTotalSize() + 16,
                position: 'relative',
                width: gridWidth,
                marginLeft: 32,
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
                        flag={flags[file.id]}
                        groupId={groupIds?.[file.id]}
                        isActive={activeIndex === startIndex + colIdx}
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
