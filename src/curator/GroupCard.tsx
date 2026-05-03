import { Trash2 } from 'lucide-react';
import type { Group } from './groups';
import type { FlatRecord, ThumbnailCache } from './store';
import { ThumbnailTile } from './ThumbnailTile';

const MosaicCell = ThumbnailTile;

type Props = {
  group: Group;
  records: FlatRecord[];
  cache: ThumbnailCache;
  onSelect?: (groupId: string) => void;
  onDelete?: (group: Group) => void;
};

export function GroupCard({ group, records, cache, onSelect, onDelete }: Props) {
  const mosaicRecords = records.slice(0, 4);
  const count = records.length;
  const locationLabel = group.locationName ?? `${group.lat.toFixed(4)}, ${group.lng.toFixed(4)}`;

  const mosaic = (() => {
    const n = mosaicRecords.length;
    if (n === 0) {
      return <div className="w-full h-full bg-nord-2" />;
    }
    if (n === 1) {
      return (
        <div className="w-full h-full">
          <MosaicCell record={mosaicRecords[0]} cache={cache} />
        </div>
      );
    }
    if (n === 2) {
      return (
        <div className="w-full h-full flex gap-px">
          <div className="flex-1 min-w-0">
            <MosaicCell record={mosaicRecords[0]} cache={cache} />
          </div>
          <div className="flex-1 min-w-0">
            <MosaicCell record={mosaicRecords[1]} cache={cache} />
          </div>
        </div>
      );
    }
    if (n === 3) {
      return (
        <div className="w-full h-full flex flex-col gap-px">
          <div className="flex-1 min-h-0">
            <MosaicCell record={mosaicRecords[0]} cache={cache} />
          </div>
          <div className="flex-1 min-h-0 flex gap-px">
            <div className="flex-1 min-w-0">
              <MosaicCell record={mosaicRecords[1]} cache={cache} />
            </div>
            <div className="flex-1 min-w-0">
              <MosaicCell record={mosaicRecords[2]} cache={cache} />
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-px">
        {mosaicRecords.map((r) => (
          <MosaicCell key={r.key} record={r} cache={cache} />
        ))}
      </div>
    );
  })();

  return (
    <div
      role="article"
      aria-label={group.name}
      onClick={() => onSelect?.(group.id)}
      className="group relative w-48 shrink-0 flex flex-col rounded-lg overflow-hidden bg-nord-1 border border-nord-3 cursor-pointer transition-colors hover:border-nord-8 hover:bg-nord-2"
    >
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete group "${group.name}"`}
          onClick={(e) => { e.stopPropagation(); onDelete(group); }}
          className="absolute top-1.5 right-1.5 z-10 p-1 rounded bg-nord-0/70 text-nord-4 hover:text-nord-11 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        >
          <Trash2 size={14} />
        </button>
      )}
      <div className="w-full h-40 shrink-0">
        {mosaic}
      </div>
      <div className="px-3 py-2 flex flex-col gap-0.5">
        <p className="text-nord-6 text-sm font-semibold truncate">{group.name}</p>
        <p className="text-nord-4 text-xs">{count} {count === 1 ? 'photo' : 'photos'}</p>
        <p className="text-nord-4 text-xs truncate">{locationLabel}</p>
      </div>
    </div>
  );
}
