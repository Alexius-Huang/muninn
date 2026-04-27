// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteGroupModal } from './DeleteGroupModal';
import type { Group } from './groups';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'g1',
    name: 'Eiffel Tower',
    lat: 48.8584,
    lng: 2.2945,
    photoIds: [],
    ...overrides,
  };
}

const DEFAULT_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
  group: makeGroup(),
  photoCount: 3,
  onConfirm: vi.fn().mockResolvedValue(undefined),
};

describe('DeleteGroupModal', () => {
  it.each([
    [3, /3 photos/],
    [1, /1 photo[^s]/],
  ] as [number, RegExp][])(
    'should render correct title and description for photoCount=%i',
    (photoCount, descriptionPattern) => {
      render(<DeleteGroupModal {...DEFAULT_PROPS} photoCount={photoCount} />);
      expect(screen.getByRole('heading', { name: /Delete.*Eiffel Tower/i })).toBeInTheDocument();
      expect(screen.getByText(descriptionPattern)).toBeInTheDocument();
    },
  );

  it('should call onConfirm(group.id) and onOpenChange(false) on success', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DeleteGroupModal
        {...DEFAULT_PROPS}
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('g1'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('should call onOpenChange(false) and NOT call onConfirm when Cancel is clicked', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DeleteGroupModal
        {...DEFAULT_PROPS}
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('should keep the modal open when onConfirm rejects', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('cascade failed'));
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DeleteGroupModal
        {...DEFAULT_PROPS}
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('should disable both buttons while submitting', async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn(
      () => new Promise<void>((r) => { resolve = r; }),
    );
    const user = userEvent.setup();
    render(<DeleteGroupModal {...DEFAULT_PROPS} onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('button', { name: /Deleting/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    resolve();
  });
});
