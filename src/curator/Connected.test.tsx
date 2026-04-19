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
  return { ...actual, listFolderAll: vi.fn().mockResolvedValue([]) };
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

  it('should render the FolderPicker on mount', async () => {
    render(<Connected account={FAKE_ACCOUNT} token="tok" onDisconnect={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Select this folder' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Dropbox' })).toBeInTheDocument();
  });

  it('should switch to FileList after a folder is committed via the picker', async () => {
    const user = userEvent.setup();
    render(<Connected account={FAKE_ACCOUNT} token="tok" onDisconnect={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Select this folder' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Select this folder' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Change folder' })).toBeInTheDocument());
  });

  it('should return to the picker when "Change folder" is clicked from FileList', async () => {
    const user = userEvent.setup();
    render(<Connected account={FAKE_ACCOUNT} token="tok" onDisconnect={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Select this folder' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Select this folder' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Change folder' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Change folder' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Select this folder' })).toBeInTheDocument());
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
