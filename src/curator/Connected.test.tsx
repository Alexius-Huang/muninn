// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Connected } from './Connected';

const mockDeleteDropboxToken = vi.fn();

vi.mock('../auth/keychain', () => ({
  deleteDropboxToken: (...args: unknown[]) => mockDeleteDropboxToken(...args),
}));

vi.mock('../dropbox/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dropbox/client')>();
  return {
    ...actual,
    listFolderAll: vi.fn().mockResolvedValue([]),
    getThumbnailBatch: vi.fn().mockResolvedValue([]),
  };
});

const FAKE_ACCOUNT = {
  account_id: 'dbid:abc',
  name: { display_name: 'Alice' },
  email: 'alice@example.com',
};

beforeEach(() => {
  mockDeleteDropboxToken.mockReset();
  mockDeleteDropboxToken.mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('Connected', () => {
  it("should render the account's display name and email", () => {
    render(<Connected account={FAKE_ACCOUNT} token="tok" onDisconnect={vi.fn()} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('should render the folder tree in the left sidebar on mount', async () => {
    const { listFolderAll } = await import('../dropbox/client');
    vi.mocked(listFolderAll).mockResolvedValue([]);
    render(<Connected account={FAKE_ACCOUNT} token="tok" onDisconnect={vi.fn()} />);
    // Tree mounts and triggers a fetch; wait for loading to settle
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    // Sidebar is present (aside element)
    expect(document.querySelector('aside')).toBeInTheDocument();
  });

  it('should show the empty-state in the right pane when no folder is active', async () => {
    const { listFolderAll } = await import('../dropbox/client');
    vi.mocked(listFolderAll).mockResolvedValue([]);
    render(<Connected account={FAKE_ACCOUNT} token="tok" onDisconnect={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    expect(screen.getByText('Select a folder to see its photos')).toBeInTheDocument();
  });

  it('should render ThumbnailGrid after clicking Open on a root folder', async () => {
    const user = userEvent.setup();
    const { listFolderAll } = await import('../dropbox/client');
    vi.mocked(listFolderAll).mockResolvedValue([
      {
        '.tag': 'folder',
        name: 'Photos',
        path_display: '/Photos',
        path_lower: '/photos',
      },
    ]);
    render(<Connected account={FAKE_ACCOUNT} token="tok" onDisconnect={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Photos' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Open Photos' }));
    await waitFor(() => expect(screen.getByText(/0 photos in \/Photos/)).toBeInTheDocument());
  });

  it('should delete the token and call onDisconnect when Disconnect is confirmed', async () => {
    const user = userEvent.setup();
    const onDisconnect = vi.fn();
    render(<Connected account={FAKE_ACCOUNT} token="tok" onDisconnect={onDisconnect} />);
    await user.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(mockDeleteDropboxToken).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('should not delete anything when the user cancels the confirm dialog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    const onDisconnect = vi.fn();
    render(<Connected account={FAKE_ACCOUNT} token="tok" onDisconnect={onDisconnect} />);
    await user.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(mockDeleteDropboxToken).not.toHaveBeenCalled();
    expect(onDisconnect).not.toHaveBeenCalled();
  });
});
