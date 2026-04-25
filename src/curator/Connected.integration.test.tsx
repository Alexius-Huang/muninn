// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Connected } from './Connected';

const mockDisconnect = vi.fn();
const mockReadCuration = vi.fn();
const mockWriteCuration = vi.fn();
const mockListCuration = vi.fn();

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

vi.mock('./curation', () => ({
  readCuration: (...args: unknown[]) => mockReadCuration(...args),
  writeCuration: (...args: unknown[]) => mockWriteCuration(...args),
  listCuration: (...args: unknown[]) => mockListCuration(...args),
  migrateToIdKeys: vi.fn(() => ({ changed: false, file: { folderPath: '', records: {} }, droppedCount: 0 })),
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
  mockReadCuration.mockReset();
  mockReadCuration.mockResolvedValue(null);
  mockWriteCuration.mockReset();
  mockWriteCuration.mockResolvedValue(undefined);
  mockListCuration.mockReset();
  mockListCuration.mockResolvedValue([]);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('Connected > tab-switch staleness regression (MUN-33)', () => {
  it('should clear the Browse flag indicator after the Flagged tab removes the flag from disk', async () => {
    const user = userEvent.setup();
    const { listFolderAll } = await import('../dropbox/client');

    const file = makeFile('a.jpg', '/Lyon/a.jpg');
    vi.mocked(listFolderAll)
      .mockResolvedValueOnce([
        { '.tag': 'folder', name: 'Lyon', path_display: '/Lyon', path_lower: '/lyon' },
      ])
      .mockResolvedValue([file]);

    // a.jpg is flagged keep on disk when Browse loads
    mockReadCuration.mockResolvedValue({
      folderPath: '/Lyon',
      records: {
        [file.id]: {
          photoId: file.id,
          pathLower: file.path_lower,
          pathDisplay: file.path_display,
          name: file.name,
          flag: 'keep',
        },
      },
    });

    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);

    // Open the Lyon folder — the tile should show the flag-keep indicator
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Lyon' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Open Lyon' }));
    await waitFor(() => expect(screen.getByTestId('flag-keep')).toBeInTheDocument());

    // Simulate the Flagged tab having cleared the flag on disk
    mockReadCuration.mockResolvedValue({ folderPath: '/Lyon', records: {} });

    // Switch to Flagged then back to Browse — reload picks up the cleared disk state
    await user.click(screen.getByRole('tab', { name: 'Flagged' }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Flagged' })).toHaveAttribute('aria-selected', 'true'),
    );
    await user.click(screen.getByRole('tab', { name: 'Browse' }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Browse' })).toHaveAttribute('aria-selected', 'true'),
    );

    // Before MUN-33 fix: flag-keep would still be visible due to stale in-memory state
    await waitFor(() => expect(screen.queryByTestId('flag-keep')).not.toBeInTheDocument());
  });
});
