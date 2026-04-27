// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Connected } from './Connected';

const mockDisconnect = vi.fn();
const mockSetFlag = vi.fn();
const mockFlushBrowse = vi.fn();
const mockReloadBrowse = vi.fn();
const mockFlushFlagged = vi.fn();
const mockReloadFlagged = vi.fn();
const mockListCuration = vi.fn();
const mockWriteCuration = vi.fn();
let mockFlaggedRecords: unknown[] = [];

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
  useCurationState: vi.fn(() => ({ flags: {}, groupIds: {}, setFlag: mockSetFlag, removeFromGroup: vi.fn(), flush: mockFlushBrowse, reload: mockReloadBrowse })),
}));

vi.mock('./useAllFlagged', () => ({
  useAllFlagged: vi.fn(() => ({ records: mockFlaggedRecords, setFlag: vi.fn(), clearAll: vi.fn(), flush: mockFlushFlagged, reload: mockReloadFlagged, loading: false })),
}));

vi.mock('./curation', () => ({
  listCuration: (...args: unknown[]) => mockListCuration(...args),
  writeCuration: (...args: unknown[]) => mockWriteCuration(...args),
}));

vi.mock('./groups', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./groups')>();
  return {
    ...actual,
    readGroups: vi.fn().mockResolvedValue([]),
    createGroupAndPersist: vi.fn().mockResolvedValue({ id: 'g1', name: 'Test', lat: 0, lng: 0, photoIds: [] }),
  };
});

vi.mock('./useGroupedRecords', () => ({
  useGroupedRecords: vi.fn(() => ({
    recordsByGroupId: new Map(),
    reload: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
    loading: false,
  })),
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
    client_modified: '2026-01-01T00:00:00Z',
  };
}

beforeEach(() => {
  mockDisconnect.mockReset();
  mockDisconnect.mockResolvedValue(undefined);
  mockSetFlag.mockReset();
  mockFlushBrowse.mockReset();
  mockFlushBrowse.mockResolvedValue(undefined);
  mockReloadBrowse.mockReset();
  mockReloadBrowse.mockResolvedValue(undefined);
  mockFlushFlagged.mockReset();
  mockFlushFlagged.mockResolvedValue(undefined);
  mockReloadFlagged.mockReset();
  mockReloadFlagged.mockResolvedValue(undefined);
  mockListCuration.mockReset();
  mockWriteCuration.mockReset();
  mockListCuration.mockResolvedValue([]);
  mockWriteCuration.mockResolvedValue(undefined);
  mockFlaggedRecords = [];
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
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    await user.click(screen.getByRole('button', { name: 'Yes' }));
    expect(mockDisconnect).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('should not disconnect when the user clicks Cancel in the confirm UI', async () => {
    const user = userEvent.setup();
    const onDisconnect = vi.fn();
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={onDisconnect} />);
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockDisconnect).not.toHaveBeenCalled();
    expect(onDisconnect).not.toHaveBeenCalled();
  });
});

describe('Connected > top tab bar', () => {
  it('should render Browse, Flagged, and Groups tabs in the header', () => {
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Browse' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Flagged' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Groups' })).toBeInTheDocument();
  });

  it('should default to the Browse tab on mount', () => {
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Browse' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Flagged' })).toHaveAttribute('aria-selected', 'false');
  });

  it('should show the flagged empty state when the Flagged tab is clicked', async () => {
    const user = userEvent.setup();
    mockListCuration.mockResolvedValue([]);
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: 'Flagged' }));
    await waitFor(() => expect(screen.getByText('No flagged photos yet')).toBeInTheDocument());
    expect(document.querySelector('aside')?.parentElement).toHaveAttribute('data-state', 'inactive');
  });

  it('should restore the browse view when the Browse tab is clicked after switching to Flagged', async () => {
    const user = userEvent.setup();
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: 'Flagged' }));
    await user.click(screen.getByRole('tab', { name: 'Browse' }));
    expect(document.querySelector('aside')?.parentElement).toHaveAttribute('data-state', 'active');
  });

  it('should mark the Flagged tab active (aria-selected=true) after it is clicked', async () => {
    const user = userEvent.setup();
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: 'Flagged' }));
    expect(screen.getByRole('tab', { name: 'Flagged' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Browse' })).toHaveAttribute('aria-selected', 'false');
  });

  it('should preserve the active folder when toggling tabs', async () => {
    const user = userEvent.setup();
    const { listFolderAll } = await import('../dropbox/client');
    vi.mocked(listFolderAll).mockResolvedValue([
      { '.tag': 'folder', name: 'Lyon', path_display: '/Lyon', path_lower: '/lyon' },
    ]);
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Lyon' })).toBeInTheDocument());
    vi.mocked(listFolderAll).mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: 'Open Lyon' }));
    await waitFor(() => expect(screen.getByText(/0 photos in \/Lyon/)).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: 'Flagged' }));
    await user.click(screen.getByRole('tab', { name: 'Browse' }));
    expect(screen.getByText(/0 photos in \/Lyon/)).toBeInTheDocument();
  });

  it('should call flush on Browse state when switching to Flagged', async () => {
    const user = userEvent.setup();
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: 'Flagged' }));
    expect(mockFlushBrowse).toHaveBeenCalled();
  });

  it('should flush Flagged then reload Browse when switching from Flagged to Browse', async () => {
    const user = userEvent.setup();
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: 'Flagged' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Flagged' })).toHaveAttribute('aria-selected', 'true'));
    mockReloadBrowse.mockClear();
    await user.click(screen.getByRole('tab', { name: 'Browse' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Browse' })).toHaveAttribute('aria-selected', 'true'));
    expect(mockReloadBrowse).toHaveBeenCalledOnce();
  });

  it('should show a flagged photo in Flagged tab after it was flagged in Browse', async () => {
    const user = userEvent.setup();
    mockFlaggedRecords = [{
      folderPath: '/Photos/Lyon',
      key: '/photos/lyon/a.jpg',
      record: { pathLower: '/photos/lyon/a.jpg', pathDisplay: '/Photos/Lyon/a.jpg', name: 'a.jpg', flag: 'keep' },
    }];
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: 'Flagged' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'a.jpg' })).toBeInTheDocument());
  });

  it('should not render the Browse PreviewPanel when on the Flagged tab', async () => {
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
    // Switch to Flagged — Browse PreviewPanel should be gone
    await user.click(screen.getByRole('tab', { name: 'Flagged' }));
    expect(screen.queryByRole('button', { name: /close preview/i })).not.toBeInTheDocument();
  });

  it.each([
    { key: '{ArrowRight}', expectActive: 'Flagged', expectInactive: 'Browse' },
    { key: '{ArrowLeft}', expectActive: 'Groups', expectInactive: 'Browse' },
  ])('should move tab selection with $key arrow key', async ({ key, expectActive, expectInactive }) => {
    const user = userEvent.setup();
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    const browseTab = screen.getByRole('tab', { name: 'Browse' });
    browseTab.focus();
    await user.keyboard(key);
    expect(screen.getByRole('tab', { name: expectActive })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: expectInactive })).toHaveAttribute('aria-selected', 'false');
  });
});
