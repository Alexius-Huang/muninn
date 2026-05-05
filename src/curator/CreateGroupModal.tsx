import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
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
import { Button } from '@/components/shadcn/button';
import type { ThumbnailCache } from './store';

export type PhotoForProgress = { pathLower: string; pathDisplay: string; name: string };
type PhotoStatus = 'pending' | 'uploading' | 'done' | 'failed';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  photos: PhotoForProgress[];
  cache: ThumbnailCache;
  onSubmit: (args: {
    name: string;
    location: NominatimLocation;
    onPhotoProgress: (pathLower: string, status: 'uploading' | 'done' | 'failed') => void;
  }) => Promise<void>;
};

function PhotoProgressCell({ photo, status, cache }: { photo: PhotoForProgress; status: PhotoStatus; cache: ThumbnailCache }) {
  const thumbState = useSyncExternalStore(
    (cb) => cache.subscribe(photo.pathLower, cb),
    () => cache.peek(photo.pathLower),
  );

  return (
    <div
      data-testid="progress-cell"
      data-status={status}
      className="relative overflow-hidden bg-nord-2 aspect-square rounded"
      aria-label={`${photo.name} — ${status}`}
    >
      {thumbState.tag === 'success' && (
        <img
          src={thumbState.dataUrl}
          alt={photo.name}
          className="object-cover w-full h-full"
        />
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-nord-0/60">
        {status === 'pending' && (
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-nord-3 border-t-transparent" />
        )}
        {status === 'uploading' && (
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-nord-8 border-t-transparent" />
        )}
        {status === 'done' && (
          <svg className="h-5 w-5 text-nord-14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" />
          </svg>
        )}
        {status === 'failed' && (
          <svg className="h-5 w-5 text-nord-11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </div>
    </div>
  );
}

export function CreateGroupModal({ open, onOpenChange, email, photos, cache, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<NominatimLocation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'pending' | 'loading' | 'error'>('idle');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Map<string, PhotoStatus>>(new Map());

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName('');
      setSelectedLocation(null);
      setLocationStatus('idle');
      setLocationError(null);
      setSubmitError(null);
      setProgress(new Map());
    }
  }, [open]);

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
    setSubmitError(null);

    const initialProgress = new Map<string, PhotoStatus>(
      photos.map((p) => [p.pathLower, 'pending']),
    );
    setProgress(initialProgress);

    const onPhotoProgress = (pathLower: string, status: 'uploading' | 'done' | 'failed') => {
      setProgress((prev) => new Map(prev).set(pathLower, status));
    };

    try {
      await onSubmit({ name: name.trim(), location: selectedLocation, onPhotoProgress });
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const inProgressPhase = progress.size > 0;
  const canCreate = name.trim().length > 0 && selectedLocation !== null && !submitting;

  const doneCount = [...progress.values()].filter((s) => s === 'done').length;
  const uploadingCount = [...progress.values()].filter((s) => s === 'uploading').length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="min-w-[720px] max-w-[820px]">
        <DialogHeader>
          <DialogTitle>Create group</DialogTitle>
          <DialogDescription>
            {photos.length} keep {photos.length === 1 ? 'photo' : 'photos'} will be grouped together.
          </DialogDescription>
        </DialogHeader>

        {!inProgressPhase ? (
          <div className="flex flex-col gap-3 min-w-0 overflow-visible">
            <div className="flex flex-col gap-1">
              <label htmlFor="group-name" className="text-sm text-nord-4">
                Name
              </label>
              <input
                id="group-name"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setSubmitError(null); }}
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setSelectedLocation(null); setLocationStatus('idle'); setLocationError(null); setSubmitError(null); }}
                    className="ml-2 shrink-0 text-xs text-nord-8 hover:text-nord-6"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <NominatimSearch
                  onSelect={(loc) => { setSelectedLocation(loc); setSubmitError(null); }}
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
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-nord-4">
              {submitting
                ? `Uploading ${doneCount + uploadingCount} of ${photos.length}…`
                : `Uploaded ${doneCount} of ${photos.length}`}
            </p>
            <div className="max-h-[50vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-4 gap-2">
                {photos.map((photo) => (
                  <PhotoProgressCell
                    key={photo.pathLower}
                    photo={photo}
                    status={progress.get(photo.pathLower) ?? 'pending'}
                    cache={cache}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {submitError && (
          <p role="alert" className="text-red-400 text-sm">{submitError}</p>
        )}

        <DialogFooter>
          {(!inProgressPhase || !submitting) && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
          )}
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={inProgressPhase ? submitting : !canCreate}
          >
            {inProgressPhase ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
