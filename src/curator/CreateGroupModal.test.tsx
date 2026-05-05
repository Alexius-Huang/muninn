// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NominatimLocation } from '@/components/NominatimSearch';
import type { ThumbnailCache } from './store';

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
  LocationMapPreview: ({ lat, lng }: { lat: number | null; lng: number | null }) =>
    lat !== null && lng !== null ? (
      <div data-testid="location-map-preview" data-lat={lat} data-lng={lng} />
    ) : (
      <div data-testid="location-map-placeholder">Select a location to preview on map</div>
    ),
}));

import { CreateGroupModal } from './CreateGroupModal';

const LOADING_STATE = { tag: 'loading' as const };
const mockCache: ThumbnailCache = {
  request: vi.fn(() => LOADING_STATE),
  subscribe: vi.fn(() => () => {}),
  peek: vi.fn(() => LOADING_STATE),
  retry: vi.fn(),
};

const PHOTOS = [
  { pathLower: '/photos/a.jpg', pathDisplay: '/Photos/a.jpg', name: 'a.jpg' },
  { pathLower: '/photos/b.jpg', pathDisplay: '/Photos/b.jpg', name: 'b.jpg' },
  { pathLower: '/photos/c.jpg', pathDisplay: '/Photos/c.jpg', name: 'c.jpg' },
];

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
  photos: PHOTOS,
  cache: mockCache,
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
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Eiffel Tower',
      location: { name: 'Eiffel Tower', lat: 48.858, lng: 2.294, placeId: 'p1', displayName: 'Eiffel Tower, Paris, France' },
    }));
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

  it('should display the error message when onSubmit rejects', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('R2 boom'));
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('R2 boom')).toBeInTheDocument());
  });

  it('should keep the modal open when onSubmit rejects', async () => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn().mockRejectedValue(new Error('R2 boom'));
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('should clear the error on a successful retry', async () => {
    const onSubmit = vi.fn()
      .mockRejectedValueOnce(new Error('R2 boom'))
      .mockResolvedValueOnce(undefined);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('R2 boom')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Creating…' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('should show placeholder initially, map preview after location is picked, and placeholder again after Change', async () => {
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('location-map-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('location-map-preview')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    const preview = screen.getByTestId('location-map-preview');
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveAttribute('data-lat', '48.858');
    expect(preview).toHaveAttribute('data-lng', '2.294');
    expect(screen.queryByTestId('location-map-placeholder')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.queryByTestId('location-map-preview')).not.toBeInTheDocument();
    expect(screen.getByTestId('location-map-placeholder')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Progress view tests
  // -------------------------------------------------------------------------

  it('should show progress view (photo grid) after submit starts', async () => {
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn().mockReturnValue(new Promise<void>((res) => { resolveSubmit = res; }));
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const cells = screen.getAllByTestId('progress-cell');
    expect(cells).toHaveLength(PHOTOS.length);
    cells.forEach((cell) => expect(cell).toHaveAttribute('data-status', 'pending'));
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();

    await act(async () => { resolveSubmit(); });
  });

  it('should update cell status as onPhotoProgress fires', async () => {
    let capturedProgress!: (pathLower: string, status: 'uploading' | 'done' | 'failed') => void;
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn().mockImplementation(
      ({ onPhotoProgress }: { onPhotoProgress: (pathLower: string, status: 'uploading' | 'done' | 'failed') => void }) => {
        capturedProgress = onPhotoProgress;
        return new Promise<void>((res) => { resolveSubmit = res; });
      },
    );
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    act(() => { capturedProgress('/photos/a.jpg', 'uploading'); });
    expect(screen.getByLabelText('a.jpg — uploading')).toBeInTheDocument();

    act(() => { capturedProgress('/photos/a.jpg', 'done'); });
    expect(screen.getByLabelText('a.jpg — done')).toBeInTheDocument();

    await act(async () => { resolveSubmit(); });
  });

  it('should auto-close and not show error when all uploads succeed', async () => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should keep modal open with failed cells when onSubmit rejects', async () => {
    let capturedProgress!: (pathLower: string, status: 'uploading' | 'done' | 'failed') => void;
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn().mockImplementation(
      ({ onPhotoProgress }: { onPhotoProgress: (pathLower: string, status: 'uploading' | 'done' | 'failed') => void }) => {
        capturedProgress = onPhotoProgress;
        capturedProgress('/photos/a.jpg', 'failed');
        return Promise.reject(new Error('Upload failed'));
      },
    );
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByLabelText('a.jpg — failed')).toBeInTheDocument();
  });

  it('should hide Cancel and disable Create while in progress phase', async () => {
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn().mockReturnValue(new Promise<void>((res) => { resolveSubmit = res; }));
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();

    await act(async () => { resolveSubmit(); });
  });

  it('should reset progress state when modal is re-opened', async () => {
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn().mockReturnValue(new Promise<void>((res) => { resolveSubmit = res; }));
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <CreateGroupModal {...DEFAULT_PROPS} open={true} onOpenChange={onOpenChange} onSubmit={onSubmit} />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getAllByTestId('progress-cell')).toHaveLength(PHOTOS.length);

    rerender(<CreateGroupModal {...DEFAULT_PROPS} open={false} onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    rerender(<CreateGroupModal {...DEFAULT_PROPS} open={true} onOpenChange={onOpenChange} onSubmit={onSubmit} />);

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByTestId('progress-cell')).not.toBeInTheDocument();

    await act(async () => { resolveSubmit(); });
  });
});
