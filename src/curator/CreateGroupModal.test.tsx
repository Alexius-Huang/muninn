// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NominatimLocation } from '@/components/NominatimSearch';

vi.mock('@/components/NominatimSearch', () => ({
  NominatimSearch: ({ onSelect }: { onSelect: (loc: NominatimLocation) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSelect({ name: 'Eiffel Tower', lat: 48.858, lng: 2.294, placeId: 'p1', displayName: 'Eiffel Tower, Paris, France' })
      }
    >
      Pick location
    </button>
  ),
}));

vi.mock('@/components/LocationMapPreview', () => ({
  LocationMapPreview: ({ lat, lng }: { lat: number; lng: number }) => (
    <div data-testid="location-map-preview" data-lat={lat} data-lng={lng} />
  ),
}));

import { CreateGroupModal } from './CreateGroupModal';

beforeAll(() => {
  // Radix portal renders into document.body; no extra setup required in jsdom
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const DEFAULT_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
  email: 'test@example.com',
  photoCount: 3,
  onSubmit: vi.fn().mockResolvedValue(undefined),
};

describe('CreateGroupModal', () => {
  it('should render name input and location search when open', () => {
    render(<CreateGroupModal {...DEFAULT_PROPS} />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick location' })).toBeInTheDocument();
  });

  it('should disable Create until both name and location are set', async () => {
    render(<CreateGroupModal {...DEFAULT_PROPS} />);
    const createBtn = screen.getByRole('button', { name: 'Create' });
    expect(createBtn).toBeDisabled();
  });

  it('should enable Create only after both name and location are provided', async () => {
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} />);
    const createBtn = screen.getByRole('button', { name: 'Create' });
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    expect(createBtn).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    expect(createBtn).not.toBeDisabled();
  });

  it('should call onSubmit with the entered name and selected location', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Eiffel Tower',
      location: { name: 'Eiffel Tower', lat: 48.858, lng: 2.294, placeId: 'p1', displayName: 'Eiffel Tower, Paris, France' },
    });
  });

  it('should close (call onOpenChange(false)) after a successful submit', async () => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('should remain open if onSubmit throws', async () => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn().mockRejectedValue(new Error('write failed'));
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('should not call onSubmit when Cancel is clicked', async () => {
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('should show the map preview after a location is picked and hide it after Change', async () => {
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} />);
    expect(screen.queryByTestId('location-map-preview')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    const preview = screen.getByTestId('location-map-preview');
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveAttribute('data-lat', '48.858');
    expect(preview).toHaveAttribute('data-lng', '2.294');
    await user.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.queryByTestId('location-map-preview')).not.toBeInTheDocument();
  });
});
