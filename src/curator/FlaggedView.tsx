import { useState } from 'react';
import { wrapIndex, jumpRow } from './navigate';
import { PreviewPanel } from './PreviewPanel';
import type { NavigateDirection } from './PreviewPanel';
import { FlaggedGrid } from './FlaggedGrid';
import { useAppStore } from './store';
import { CreateGroupModal } from './CreateGroupModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/shadcn/dialog';
import { Button } from '@/components/shadcn/button';
import type { Flag } from './curation';

type Filter = 'all' | 'keep' | 'discard';

type Props = {
  isActive: boolean;
  previewWidth: number;
  isResizing?: boolean;
  onPreviewResize: (e: React.MouseEvent) => void;
  email: string;
};

export function FlaggedView({ isActive, previewWidth, isResizing = false, onPreviewResize, email }: Props) {
  const records = useAppStore((s) => s.flaggedRecords);
  const loading = useAppStore((s) => s.flaggedLoading);
  const cache = useAppStore((s) => s.cache);
  const setFlaggedFlag = useAppStore((s) => s.setFlaggedFlag);
  const clearAllFlagged = useAppStore((s) => s.clearAllFlagged);
  const createGroup = useAppStore((s) => s.createGroup);

  const [filter, setFilter] = useState<Filter>('all');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [columns, setColumns] = useState(4);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);

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
    setFlaggedFlag(selectedFlat.folderPath, selectedFlat.key, value);
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
          <Button
            key={f}
            variant="ghost"
            size="sm"
            onClick={() => { setFilter(f); setSelectedIndex(null); }}
            aria-pressed={filter === f}
            className={filter === f ? 'bg-nord-2 text-nord-6' : ''}
          >
            {f === 'all' ? 'All' : f === 'keep' ? 'Keep' : 'Discard'}
          </Button>
        ))}
        {filter === 'keep' && filtered.length > 0 && (
          <Button size="sm" onClick={() => setCreateGroupOpen(true)}>
            Create Group
          </Button>
        )}
        <div className="ml-auto">
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={records.length === 0}
            >
              Clear All
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clear all flags?</DialogTitle>
                <DialogDescription>
                  All keep/discard flags across every folder will be removed. No photos are deleted from Dropbox.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => { clearAllFlagged(); setSelectedIndex(null); setConfirmOpen(false); }}
                >
                  Clear All
                </Button>
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

      <CreateGroupModal
        open={createGroupOpen}
        onOpenChange={(next) => {
          setCreateGroupOpen(next);
          if (!next) setSelectedIndex(null);
        }}
        email={email}
        photoCount={filtered.length}
        onSubmit={({ name, location }) =>
          createGroup({ name, location, photos: filtered.map(({ folderPath, key }) => ({ folderPath, key })) })
        }
      />
    </div>
  );
}
