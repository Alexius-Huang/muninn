import { useEffect, useRef, useState } from 'react';
import { wrapIndex, jumpRow } from './navigate';
import { PreviewPanel } from './PreviewPanel';
import type { NavigateDirection } from './PreviewPanel';
import { FlaggedGrid } from './FlaggedGrid';
import { useAllFlagged } from './useAllFlagged';
import type { ThumbnailCache } from './useThumbnailCache';
import type { Flag } from './curation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/shadcn/dialog';

type Filter = 'all' | 'keep' | 'discard';

type Props = {
  isActive: boolean;
  cache: ThumbnailCache;
  previewWidth: number;
  isResizing?: boolean;
  onPreviewResize: (e: React.MouseEvent) => void;
  onBeforeActivate: () => Promise<void>;
};

export function FlaggedView({ isActive, cache, previewWidth, isResizing = false, onPreviewResize, onBeforeActivate }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [columns, setColumns] = useState(4);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { records, setFlag, clearAll, reload, flush, loading } = useAllFlagged();

  // On isActive false→true: flush Browse writes first, then reload
  const prevActiveRef = useRef(isActive);

  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      void (async () => {
        await onBeforeActivate();
        await reload();
      })();
    }
    prevActiveRef.current = isActive;
  }, [isActive, reload, onBeforeActivate]);

  // Flush our own pending writes when we become inactive
  useEffect(() => {
    if (!isActive) flush();
  }, [isActive, flush]);

  const filtered = filter === 'all' ? records : records.filter((r) => r.record.flag === filter);

  const selectedFlat = selectedIndex !== null ? filtered[selectedIndex] : null;

  function handleNavigate(direction: NavigateDirection) {
    if (selectedIndex === null || filtered.length === 0) return;
    switch (direction) {
      case 'prev': setSelectedIndex(wrapIndex(selectedIndex, -1, filtered.length)); break;
      case 'next': setSelectedIndex(wrapIndex(selectedIndex, 1, filtered.length)); break;
      case 'up':   setSelectedIndex(jumpRow(selectedIndex, -1, filtered.length, columns)); break;
      case 'down': setSelectedIndex(jumpRow(selectedIndex, 1, filtered.length, columns)); break;
    }
  }

  function handleFlag(value: Flag | undefined) {
    if (!selectedFlat) return;
    setFlag(selectedFlat.folderPath, selectedFlat.key, value);
    // If the record would leave the filtered view (unflag or wrong flag for current filter), close preview
    if (value === undefined || (filter !== 'all' && value !== filter)) {
      setSelectedIndex(null);
    }
  }

  const placeholderDataUrl = selectedFlat
    ? (() => {
        const s = cache.peek(selectedFlat.record.pathLower);
        return s.tag === 'success' ? s.dataUrl : undefined;
      })()
    : undefined;

  const selectedFile = selectedFlat
    ? {
        '.tag': 'file' as const,
        name: selectedFlat.record.name,
        path_display: selectedFlat.record.pathDisplay,
        path_lower: selectedFlat.record.pathLower,
        id: selectedFlat.record.photoId ?? selectedFlat.record.pathLower,
        size: 0,
        server_modified: '',
        client_modified: '',
      }
    : null;

  const hasAnyFlagged = records.length > 0;
  const isEmpty = filtered.length === 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* filter bar */}
      <div className="shrink-0 px-6 pt-4 pb-3 bg-nord-0 border-b border-nord-3 flex items-center gap-2">
        <span className="text-nord-4 text-sm mr-2">
          {loading ? 'Loading…' : `${records.length} flagged`}
        </span>
        {(['all', 'keep', 'discard'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setSelectedIndex(null); }}
            aria-pressed={filter === f}
            className={`px-3 py-1 rounded-lg text-sm capitalize transition-colors ${
              filter === f ? 'bg-nord-2 text-nord-6' : 'text-nord-4 hover:bg-nord-1'
            }`}
          >
            {f === 'all' ? 'All' : f === 'keep' ? 'Keep' : 'Discard'}
          </button>
        ))}
        <div className="ml-auto">
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={records.length === 0}
              className="px-3 py-1 rounded-lg bg-nord-3 text-nord-5 hover:bg-nord-2 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear All
            </button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clear all flags?</DialogTitle>
                <DialogDescription>
                  All keep/discard flags across every folder will be removed. No photos are deleted from Dropbox.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="px-4 py-2 rounded-lg bg-nord-3 text-nord-5 hover:bg-nord-2 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { clearAll(); setSelectedIndex(null); setConfirmOpen(false); }}
                  className="px-4 py-2 rounded-lg bg-nord-11 text-white hover:bg-red-600 transition-colors text-sm"
                >
                  Clear All
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 min-h-0 flex flex-col">
          {isEmpty ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-nord-4 text-sm">
                {hasAnyFlagged ? 'No photos match this filter' : 'No flagged photos yet'}
              </p>
            </div>
          ) : (
            <FlaggedGrid
              records={filtered}
              cache={cache}
              activeIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onColumnsChange={setColumns}
            />
          )}
        </div>

        {selectedFile !== null && isActive && (
          <>
            <div
              onMouseDown={onPreviewResize}
              className="w-1 shrink-0 cursor-col-resize bg-nord-3 hover:bg-nord-8 transition-colors"
            />
            <PreviewPanel
              key={selectedFile.path_lower}
              file={selectedFile}
              index={selectedIndex!}
              total={filtered.length}
              flag={selectedFlat!.record.flag}
              placeholderDataUrl={placeholderDataUrl}
              width={previewWidth}
              isResizing={isResizing}
              onClose={() => setSelectedIndex(null)}
              onNavigate={handleNavigate}
              onFlag={handleFlag}
            />
          </>
        )}
      </div>
    </div>
  );
}
