import { useState } from 'react';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { FlaggedGrid } from './FlaggedGrid';
import { PreviewPanel } from './PreviewPanel';
import type { GroupInfo, NavigateDirection } from './PreviewPanel';
import type { Group } from './groups';
import type { FlatRecord } from './useAllFlagged';
import type { ThumbnailCache } from './useThumbnailCache';
import { wrapIndex, jumpRow } from './navigate';
import { Button } from '@/components/shadcn/button';

type Props = {
  group: Group;
  records: FlatRecord[];
  cache: ThumbnailCache;
  isActive: boolean;
  previewWidth: number;
  isResizing?: boolean;
  onPreviewResize: (e: React.MouseEvent) => void;
  onBack: () => void;
  onDelete: (group: Group) => void;
};

export function GroupDetailView({
  group,
  records,
  cache,
  isActive,
  previewWidth,
  isResizing = false,
  onPreviewResize,
  onBack,
  onDelete,
}: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [columns, setColumns] = useState(4);

  const locationLabel =
    group.locationName ?? `${group.lat.toFixed(4)}, ${group.lng.toFixed(4)}`;
  const count = records.length;

  const selectedFlat = selectedIndex !== null ? records[selectedIndex] : null;

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

  const groupInfo: GroupInfo = {
    name: group.name,
    locationName: group.locationName,
  };

  function handleNavigate(direction: NavigateDirection) {
    if (selectedIndex === null || records.length === 0) return;
    switch (direction) {
      case 'prev': setSelectedIndex(wrapIndex(selectedIndex, -1, records.length)); break;
      case 'next': setSelectedIndex(wrapIndex(selectedIndex, 1, records.length)); break;
      case 'up':   setSelectedIndex(jumpRow(selectedIndex, -1, records.length, columns)); break;
      case 'down': setSelectedIndex(jumpRow(selectedIndex, 1, records.length, columns)); break;
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 px-4 pt-4 pb-3 bg-nord-0 border-b border-nord-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          aria-label="Back to groups"
          className="shrink-0 hover:bg-nord-3"
        >
          <ChevronLeft size={14} />
          Back
        </Button>
        <div className="min-w-0">
          <p className="text-nord-6 text-sm font-semibold truncate">{group.name}</p>
          <p className="text-nord-4 text-xs truncate">
            {count} {count === 1 ? 'photo' : 'photos'} · {locationLabel}
          </p>
        </div>
        <div className="ml-auto">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDelete(group)}
            aria-label={`Delete group "${group.name}"`}
            className="hover:text-nord-11 hover:bg-nord-3"
          >
            <Trash2 size={14} />
            Delete
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 min-h-0 flex flex-col">
          <FlaggedGrid
            records={records}
            cache={cache}
            activeIndex={selectedIndex}
            onSelect={setSelectedIndex}
            onColumnsChange={setColumns}
          />
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
              total={records.length}
              flag={undefined}
              groupInfo={groupInfo}
              placeholderDataUrl={placeholderDataUrl}
              width={previewWidth}
              isResizing={isResizing}
              onClose={() => setSelectedIndex(null)}
              onNavigate={handleNavigate}
              onFlag={() => {}}
            />
          </>
        )}
      </div>
    </div>
  );
}
