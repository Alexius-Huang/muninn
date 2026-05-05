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
import type { PhotoRowWithSource } from '@/cloud/createGroupOrchestrator';

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

const NO_FAILURES = { succeeded: ['p1', 'p2', 'p3'], failedPhotos: [] as PhotoRowWithSource[] };

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
  onSubmit: vi.fn().mockResolvedValue(NO_FAILURES),
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
    const onSubmit = vi.fn().mockResolvedValue(NO_FAILURES);
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
    const onSubmit = vi.fn().mockResolvedValue(NO_FAILURES);
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
      .mockResolvedValueOnce(NO_FAILURES);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('R2 boom')).toBeInTheDocument());
    // After a thrown error, progress is reset so the form reappears with Create enabled
    await user.click(screen.getByRole('button', { name: 'Create' }));
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
    let resolveSubmit!: (val: typeof NO_FAILURES) => void;
    const onSubmit = vi.fn().mockReturnValue(new Promise<typeof NO_FAILURES>((res) => { resolveSubmit = res; }));
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const cells = screen.getAllByTestId('progress-cell');
    expect(cells).toHaveLength(PHOTOS.length);
    cells.forEach((cell) => expect(cell).toHaveAttribute('data-status', 'pending'));
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();

    await act(async () => { resolveSubmit(NO_FAILURES); });
  });

  it('should update cell status as onPhotoProgress fires', async () => {
    let capturedProgress!: (pathLower: string, status: 'uploading' | 'done' | 'failed') => void;
    let resolveSubmit!: (val: typeof NO_FAILURES) => void;
    const onSubmit = vi.fn().mockImplementation(
      ({ onPhotoProgress }: { onPhotoProgress: (pathLower: string, status: 'uploading' | 'done' | 'failed') => void }) => {
        capturedProgress = onPhotoProgress;
        return new Promise<typeof NO_FAILURES>((res) => { resolveSubmit = res; });
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

    await act(async () => { resolveSubmit(NO_FAILURES); });
  });

  it('should auto-close and not show error when all uploads succeed', async () => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(NO_FAILURES);
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should keep modal open and return to form view when onSubmit rejects', async () => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn().mockImplementation(
      ({ onPhotoProgress }: { onPhotoProgress: (pathLower: string, status: 'uploading' | 'done' | 'failed') => void }) => {
        onPhotoProgress('/photos/a.jpg', 'failed');
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
    // progress is reset in catch so the form view returns (cells are gone, name input is back)
    expect(screen.queryByTestId('progress-cell')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('should hide Cancel and disable Create while in progress phase', async () => {
    let resolveSubmit!: (val: typeof NO_FAILURES) => void;
    const onSubmit = vi.fn().mockReturnValue(new Promise<typeof NO_FAILURES>((res) => { resolveSubmit = res; }));
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();

    await act(async () => { resolveSubmit(NO_FAILURES); });
  });

  it('should reset progress state when modal is re-opened', async () => {
    let resolveSubmit!: (val: typeof NO_FAILURES) => void;
    const onSubmit = vi.fn().mockReturnValue(new Promise<typeof NO_FAILURES>((res) => { resolveSubmit = res; }));
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

    await act(async () => { resolveSubmit(NO_FAILURES); });
  });

  // -------------------------------------------------------------------------
  // Retry tests
  // -------------------------------------------------------------------------

  it('should show Retry button when photos fail', async () => {
    const failedPhoto: PhotoRowWithSource = {
      id: 'p1', groupId: 'g1', name: 'a.jpg', r2Key: 'photos/p1', dropboxPath: '/Photos/a.jpg',
    };
    const onSubmit = vi.fn().mockResolvedValue({ succeeded: [], failedPhotos: [failedPhoto] });
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry failed' })).toBeInTheDocument());
  });

  it('should retry only failed photos', async () => {
    const failedPhoto: PhotoRowWithSource = {
      id: 'p2', groupId: 'g1', name: 'b.jpg', r2Key: 'photos/p2', dropboxPath: '/Photos/b.jpg',
    };
    const onSubmit = vi.fn().mockResolvedValue({ succeeded: ['p1', 'p3'], failedPhotos: [failedPhoto] });
    const onRetry = vi.fn().mockResolvedValue({ succeeded: [], failedPhotos: [failedPhoto] });
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onSubmit={onSubmit} onRetry={onRetry} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => screen.getByRole('button', { name: 'Retry failed' }));
    await user.click(screen.getByRole('button', { name: 'Retry failed' }));
    await waitFor(() => expect(onRetry).toHaveBeenCalledOnce());
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ failedPhotos: [failedPhoto] }));
  });

  it('should insert D1 row for each retry that succeeds', async () => {
    const failedPhoto: PhotoRowWithSource = {
      id: 'p1', groupId: 'g1', name: 'a.jpg', r2Key: 'photos/p1', dropboxPath: '/photos/a.jpg',
    };
    const onSubmit = vi.fn().mockResolvedValue({ succeeded: [], failedPhotos: [failedPhoto] });
    const onRetry = vi.fn().mockImplementation(
      ({ onPhotoProgress }: { onPhotoProgress: (p: string, s: 'uploading' | 'done' | 'failed') => void; failedPhotos: PhotoRowWithSource[] }) => {
        onPhotoProgress('/photos/a.jpg', 'done');
        return Promise.resolve({ succeeded: [failedPhoto.id], failedPhotos: [] });
      },
    );
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onSubmit={onSubmit} onRetry={onRetry} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => screen.getByRole('button', { name: 'Retry failed' }));
    await user.click(screen.getByRole('button', { name: 'Retry failed' }));
    await waitFor(() => expect(onRetry).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('a.jpg — done')).toBeInTheDocument();
  });

  it('should close modal and show toast when retry completes all photos', async () => {
    const failedPhoto: PhotoRowWithSource = {
      id: 'p1', groupId: 'g1', name: 'a.jpg', r2Key: 'photos/p1', dropboxPath: '/Photos/a.jpg',
    };
    const onSubmit = vi.fn().mockResolvedValue({ succeeded: [], failedPhotos: [failedPhoto] });
    const onRetry = vi.fn().mockResolvedValue({ succeeded: [failedPhoto.id], failedPhotos: [] });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onSubmit={onSubmit} onRetry={onRetry} onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => screen.getByRole('button', { name: 'Retry failed' }));
    await user.click(screen.getByRole('button', { name: 'Retry failed' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('should keep remaining failures visible when retry partially succeeds', async () => {
    const photo1: PhotoRowWithSource = {
      id: 'p1', groupId: 'g1', name: 'a.jpg', r2Key: 'photos/p1', dropboxPath: '/Photos/a.jpg',
    };
    const photo2: PhotoRowWithSource = {
      id: 'p2', groupId: 'g1', name: 'b.jpg', r2Key: 'photos/p2', dropboxPath: '/Photos/b.jpg',
    };
    const onSubmit = vi.fn().mockImplementation(
      ({ onPhotoProgress }: { onPhotoProgress: (p: string, s: 'uploading' | 'done' | 'failed') => void }) => {
        onPhotoProgress('/photos/a.jpg', 'failed');
        onPhotoProgress('/photos/b.jpg', 'failed');
        return Promise.resolve({ succeeded: [], failedPhotos: [photo1, photo2] });
      },
    );
    const onRetry = vi.fn().mockImplementation(
      ({ onPhotoProgress }: { onPhotoProgress: (p: string, s: 'uploading' | 'done' | 'failed') => void }) => {
        onPhotoProgress('/photos/a.jpg', 'done');
        return Promise.resolve({ succeeded: [photo1.id], failedPhotos: [photo2] });
      },
    );
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<CreateGroupModal {...DEFAULT_PROPS} onSubmit={onSubmit} onRetry={onRetry} onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText('Name'), 'Eiffel Tower');
    await user.click(screen.getByRole('button', { name: 'Pick location' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => screen.getByRole('button', { name: 'Retry failed' }));
    await user.click(screen.getByRole('button', { name: 'Retry failed' }));
    await waitFor(() => expect(screen.getByLabelText('a.jpg — done')).toBeInTheDocument());
    expect(screen.getByLabelText('b.jpg — failed')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Retry failed' })).toBeInTheDocument();
  });
});
