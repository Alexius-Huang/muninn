import { useState } from 'react';
import { GroupCard } from './GroupCard';
import { sortGroups, type GroupSort } from './groups';
import type { Group } from './groups';
import type { FlatRecord } from './useAllFlagged';
import type { ThumbnailCache } from './useThumbnailCache';

type Props = {
  groups: Group[];
  recordsByGroupId: Map<string, FlatRecord[]>;
  cache: ThumbnailCache;
  loading: boolean;
};

const SORT_LABELS: Record<GroupSort, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  count: 'Photo count',
  location: 'Location name',
};

const SORT_OPTIONS: GroupSort[] = ['newest', 'oldest', 'count', 'location'];

export function GroupsView({ groups, recordsByGroupId, cache, loading }: Props) {
  const [sort, setSort] = useState<GroupSort>('newest');

  const sorted = sortGroups(groups, sort);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 px-6 pt-4 pb-3 bg-nord-0 border-b border-nord-3 flex items-center gap-3">
        <span className="text-nord-4 text-sm">
          {loading ? 'Loading…' : `${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-nord-4 text-xs">Sort:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as GroupSort)}
            aria-label="Sort groups"
            className="text-sm bg-nord-1 text-nord-5 border border-nord-3 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-nord-8"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {SORT_LABELS[opt]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex-1 flex items-center justify-center h-full">
            <p className="text-nord-4 text-sm text-center px-8">
              No groups yet — flag photos as Keep, then use Flagged → Create Group.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-4 p-6">
            {sorted.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                records={recordsByGroupId.get(group.id) ?? []}
                cache={cache}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
