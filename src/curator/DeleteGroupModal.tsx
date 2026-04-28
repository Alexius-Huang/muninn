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
import { Button } from '@/components/shadcn/button';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: Group | null;
  photoCount: number;
  onConfirm: (id: string) => Promise<void>;
};

export function DeleteGroupModal({ open, onOpenChange, group, photoCount, onConfirm }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    if (!next) setError(false);
    onOpenChange(next);
  }

  async function handleDelete() {
    if (!group || submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      await onConfirm(group.id);
      onOpenChange(false);
    } catch {
      setError(true);
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
        {error && (
          <p className="text-sm text-nord-11">Delete failed. Please try again.</p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={submitting}
          >
            {submitting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
