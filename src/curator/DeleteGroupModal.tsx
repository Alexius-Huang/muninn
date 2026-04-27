import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/shadcn/dialog';
import type { Group } from './groups';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: Group | null;
  photoCount: number;
  onConfirm: (id: string) => Promise<void>;
};

export function DeleteGroupModal({ open, onOpenChange, group, photoCount, onConfirm }: Props) {
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    onOpenChange(next);
  }

  async function handleDelete() {
    if (!group || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(group.id);
      onOpenChange(false);
    } catch {
      // keep modal open for retry
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Delete "${group?.name}"?`}</DialogTitle>
          <DialogDescription>
            The {photoCount} {photoCount === 1 ? 'photo' : 'photos'} will return to unprocessed state.
          </DialogDescription>
        </DialogHeader>
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
            onClick={handleDelete}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-nord-11 text-white hover:bg-red-600 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Deleting…' : 'Delete'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
