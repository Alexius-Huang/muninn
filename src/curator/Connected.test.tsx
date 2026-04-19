// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Connected } from './Connected';

const mockDisconnect = vi.fn();
const mockSetFlag = vi.fn();

vi.mock('../auth/dropboxAuth', () => ({
  disconnect: (...args: unknown[]) => mockDisconnect(...args),
}));

vi.mock('../dropbox/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dropbox/client')>();
  return {
    ...actual,
    listFolderAll: vi.fn().mockResolvedValue([]),
    getThumbnailBatch: vi.fn().mockResolvedValue([]),
    getPreview: vi.fn().mockResolvedValue('data:image/jpeg;base64,preview'),
  };
});

vi.mock('./useCurationState', () => ({
  useCurationState: vi.fn(() => ({ flags: {}, setFlag: mockSetFlag })),
}));

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() { return 800; },
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 800, height: 1000, top: 0, left: 0, right: 800, bottom: 1000, x: 0, y: 0,
    toJSON: () => {},
  } as DOMRect);
});

const FAKE_ACCOUNT = {
  account_id: 'dbid:abc',
  name: { display_name: 'Alice' },
  email: 'alice@example.com',
};

function makeFile(name: string, path: string) {
  return {
    '.tag': 'file' as const,
    name,
    path_display: path,
    path_lower: path.toLowerCase(),
    id: `id-${name}`,
    size: 1024,
    server_modified: '2026-01-01T00:00:00Z',
  };
}

beforeEach(() => {
  mockDisconnect.mockReset();
  mockDisconnect.mockResolvedValue(undefined);
  mockSetFlag.mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('Connected', () => {
  it("should render the account's display name and email", () => {
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('should render the folder tree in the left sidebar on mount', async () => {
    const { listFolderAll } = await import('../dropbox/client');
    vi.mocked(listFolderAll).mockResolvedValue([]);
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    expect(document.querySelector('aside')).toBeInTheDocument();
  });

  it('should show the empty-state in the right pane when no folder is active', async () => {
    const { listFolderAll } = await import('../dropbox/client');
    vi.mocked(listFolderAll).mockResolvedValue([]);
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    expect(screen.getByText('Select a folder to see its photos')).toBeInTheDocument();
  });

  it('should render ThumbnailGrid after clicking Open on a root folder', async () => {
    const user = userEvent.setup();
    const { listFolderAll } = await import('../dropbox/client');
    vi.mocked(listFolderAll).mockResolvedValue([
      { '.tag': 'folder', name: 'Photos', path_display: '/Photos', path_lower: '/photos' },
    ]);
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Photos' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Open Photos' }));
    await waitFor(() => expect(screen.getByText(/0 photos in \/Photos/)).toBeInTheDocument());
  });

  it('should open the preview panel when a thumbnail is clicked', async () => {
    const user = userEvent.setup();
    const { listFolderAll } = await import('../dropbox/client');
    vi.mocked(listFolderAll).mockResolvedValue([
      { '.tag': 'folder', name: 'Lyon', path_display: '/Lyon', path_lower: '/lyon' },
      makeFile('photo.jpg', '/Lyon/photo.jpg'),
    ]);
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Lyon' })).toBeInTheDocument());
    vi.mocked(listFolderAll).mockResolvedValue([makeFile('photo.jpg', '/Lyon/photo.jpg')]);
    await user.click(screen.getByRole('button', { name: 'Open Lyon' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'photo.jpg' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'photo.jpg' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /close preview/i })).toBeInTheDocument());
  });

  it('should close the preview panel when the close button is clicked', async () => {
    const user = userEvent.setup();
    const { listFolderAll } = await import('../dropbox/client');
    vi.mocked(listFolderAll)
      .mockResolvedValueOnce([
        { '.tag': 'folder', name: 'Lyon', path_display: '/Lyon', path_lower: '/lyon' },
      ])
      .mockResolvedValue([makeFile('photo.jpg', '/Lyon/photo.jpg')]);
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Lyon' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Open Lyon' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'photo.jpg' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'photo.jpg' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /close preview/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /close preview/i }));
    expect(screen.queryByRole('button', { name: /close preview/i })).not.toBeInTheDocument();
  });

  it('should close the preview panel when a different folder is opened', async () => {
    const user = userEvent.setup();
    const { listFolderAll } = await import('../dropbox/client');
    vi.mocked(listFolderAll)
      .mockResolvedValueOnce([
        { '.tag': 'folder', name: 'Lyon', path_display: '/Lyon', path_lower: '/lyon' },
        { '.tag': 'folder', name: 'Paris', path_display: '/Paris', path_lower: '/paris' },
      ])
      .mockResolvedValue([makeFile('photo.jpg', '/Lyon/photo.jpg')]);
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Lyon' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Open Lyon' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'photo.jpg' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'photo.jpg' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /close preview/i })).toBeInTheDocument());
    vi.mocked(listFolderAll).mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: 'Open Paris' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /close preview/i })).not.toBeInTheDocument());
  });

  it('should call disconnect and onDisconnect when Disconnect is confirmed', async () => {
    const user = userEvent.setup();
    const onDisconnect = vi.fn();
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={onDisconnect} />);
    await user.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(mockDisconnect).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('should not disconnect when the user cancels the confirm dialog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    const onDisconnect = vi.fn();
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={onDisconnect} />);
    await user.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(mockDisconnect).not.toHaveBeenCalled();
    expect(onDisconnect).not.toHaveBeenCalled();
  });
});
