import { useCallback, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/shadcn/dialog';
import { NominatimSearch } from '@/components/NominatimSearch';
import type { NominatimLocation } from '@/components/NominatimSearch';
import { LocationMapPreview } from '@/components/LocationMapPreview';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  photoCount: number;
  onSubmit: (args: { name: string; location: NominatimLocation }) => Promise<void>;
};

export function CreateGroupModal({ open, onOpenChange, email, photoCount, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<NominatimLocation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'pending' | 'loading' | 'error'>('idle');
  const [locationError, setLocationError] = useState<string | null>(null);

  const handleLocationStatusChange = useCallback(
    (s: 'idle' | 'pending' | 'loading' | 'error', errMsg?: string) => {
      setLocationStatus(s);
      setLocationError(errMsg ?? null);
    },
    [],
  );

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (!name.trim() || !selectedLocation || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), location: selectedLocation });
      onOpenChange(false);
      setName('');
      setSelectedLocation(null);
      setLocationStatus('idle');
      setLocationError(null);
    } catch {
      // keep modal open for retry
    } finally {
      setSubmitting(false);
    }
  }

  const canCreate = name.trim().length > 0 && selectedLocation !== null && !submitting;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="min-w-[720px] max-w-[820px]">
        <DialogHeader>
          <DialogTitle>Create group</DialogTitle>
          <DialogDescription>
            {photoCount} keep {photoCount === 1 ? 'photo' : 'photos'} will be grouped together.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 min-w-0 overflow-visible">
          <div className="flex flex-col gap-1">
            <label htmlFor="group-name" className="text-sm text-nord-4">
              Name
            </label>
            <input
              id="group-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Eiffel Tower"
              className="w-full rounded border border-nord-3 bg-nord-0 px-3 py-2 text-sm text-nord-6 placeholder-nord-3 focus:outline-none focus:ring-1 focus:ring-nord-8"
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-nord-4">Location</span>
              {selectedLocation ? (
                <svg className="h-3.5 w-3.5 text-nord-14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" />
                </svg>
              ) : (locationStatus === 'pending' || locationStatus === 'loading') ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border border-nord-4 border-t-transparent" />
                  <span className="text-xs text-nord-4">Fetching…</span>
                </>
              ) : locationStatus === 'error' ? (
                <span className="text-xs text-nord-11">{locationError ?? 'Search failed'}</span>
              ) : null}
            </div>
            {selectedLocation ? (
              <div className="flex items-center justify-between rounded border border-nord-3 bg-nord-0 px-3 py-2">
                <span className="text-sm text-nord-6 truncate">{selectedLocation.displayName}</span>
                <button
                  type="button"
                  onClick={() => { setSelectedLocation(null); setLocationStatus('idle'); setLocationError(null); }}
                  className="ml-2 shrink-0 text-xs text-nord-8 hover:text-nord-6"
                >
                  Change
                </button>
              </div>
            ) : (
              <NominatimSearch
                onSelect={setSelectedLocation}
                email={email}
                placeholder="Search for a place…"
                onStatusChange={handleLocationStatusChange}
              />
            )}
          </div>

          <LocationMapPreview
            key={selectedLocation?.placeId ?? 'empty'}
            lat={selectedLocation?.lat ?? null}
            lng={selectedLocation?.lng ?? null}
          />
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-nord-3 text-nord-5 hover:bg-nord-2 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canCreate}
            className="px-4 py-2 rounded-lg bg-nord-8 text-white hover:bg-nord-9 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
