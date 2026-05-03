import type { Group } from './groups';
import type { FlatRecord, ThumbnailCache } from './store';
import { ThumbnailTile } from './ThumbnailTile';
import { Button } from '@/components/shadcn/button';

const MAX_THUMBNAILS = 5;

type Props = {
  group: Group;
  records: FlatRecord[];
  cache: ThumbnailCache;
  onViewInGroups: () => void;
};

export function GroupPinPopup({ group, records, cache, onViewInGroups }: Props) {
  const count = records.length;
  const thumbnails = records.slice(0, MAX_THUMBNAILS);

  return (
    <div className="flex flex-col gap-2 p-3 w-100">
      <h3 className="text-nord-6 font-semibold text-sm truncate">{group.name}</h3>
      <p className="text-nord-4 text-xs m-0!">{count} {count === 1 ? 'photo' : 'photos'}</p>
      {thumbnails.length > 0 && (
        <div className="flex gap-1 h-16">
          {thumbnails.map((r) => (
            <div key={r.key} className="flex-1 min-w-0">
              <ThumbnailTile record={r} cache={cache} />
            </div>
          ))}
        </div>
      )}
      <Button size="sm" variant="secondary" onClick={onViewInGroups} className="w-full">
        View in Groups
      </Button>
    </div>
  );
}
