import { useState } from 'react';
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
    } catch {
      // keep modal open for retry
    } finally {
      setSubmitting(false);
    }
  }

  const canCreate = name.trim().length > 0 && selectedLocation !== null && !submitting;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create group</DialogTitle>
          <DialogDescription>
            {photoCount} keep {photoCount === 1 ? 'photo' : 'photos'} will be grouped together.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 min-w-0 overflow-hidden">
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
            <span className="text-sm text-nord-4">Location</span>
            {selectedLocation ? (
              <div className="flex items-center justify-between rounded border border-nord-3 bg-nord-0 px-3 py-2">
                <span className="text-sm text-nord-6 truncate">{selectedLocation.displayName}</span>
                <button
                  type="button"
                  onClick={() => setSelectedLocation(null)}
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
              />
            )}
          </div>
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
