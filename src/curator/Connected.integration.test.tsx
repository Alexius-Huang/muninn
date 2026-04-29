// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Connected } from './Connected';
import { _resetStoreForTesting } from './store';

const mockDisconnect = vi.fn();
const mockReadCuration = vi.fn();
const mockWriteCuration = vi.fn();
const mockListCuration = vi.fn();
const mockReadGroups = vi.fn();
const mockDeleteGroupAndCascade = vi.fn();

vi.mock('./store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./store')>();
  return actual;
});

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

vi.mock('./groups', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./groups')>();
  return {
    ...actual,
    readGroups: (...args: unknown[]) => mockReadGroups(...args),
    deleteGroupAndCascade: (...args: unknown[]) => mockDeleteGroupAndCascade(...args),
  };
});

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
  _resetStoreForTesting();
  mockDisconnect.mockReset();
  mockDisconnect.mockResolvedValue(undefined);
  mockReadCuration.mockReset();
  mockReadCuration.mockResolvedValue(null);
  mockWriteCuration.mockReset();
  mockWriteCuration.mockResolvedValue(undefined);
  mockListCuration.mockReset();
  mockListCuration.mockResolvedValue([]);
  mockReadGroups.mockReset();
  mockReadGroups.mockResolvedValue([]);
  mockDeleteGroupAndCascade.mockReset();
  mockDeleteGroupAndCascade.mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('Connected > delete group cascade (MUN-37)', () => {
  it('should invoke deleteGroupAndCascade, re-fetch groups, and remove the group from the list', async () => {
    const user = userEvent.setup();

    const group = {
      id: 'g1',
      name: 'Eiffel Tower',
      lat: 48.858,
      lng: 2.294,
      placeId: 'p1',
      locationName: 'Paris, France',
      photoIds: ['id-a'],
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    // First call: group exists; second call (after delete): empty list
    mockReadGroups
      .mockResolvedValueOnce([group])
      .mockResolvedValue([]);
    mockListCuration.mockResolvedValue([]);

    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);

    // Navigate to the Groups tab
    await user.click(screen.getByRole('tab', { name: 'Groups' }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Groups' })).toHaveAttribute('aria-selected', 'true'),
    );

    // Wait for the group card to appear
    await waitFor(() => expect(screen.getByRole('article', { name: 'Eiffel Tower' })).toBeInTheDocument());

    // Click the trash icon on the card
    await user.click(screen.getByRole('button', { name: 'Delete group "Eiffel Tower"' }));

    // Confirmation modal should be visible
    expect(screen.getByText('Delete "Eiffel Tower"?')).toBeInTheDocument();

    // Confirm the deletion
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    // deleteGroupAndCascade was called with the correct id
    await waitFor(() => expect(mockDeleteGroupAndCascade).toHaveBeenCalledWith('g1'));

    // Groups list re-fetched (once on mount, once after delete)
    await waitFor(() => expect(mockReadGroups).toHaveBeenCalledTimes(2));

    // The deleted group no longer appears
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Eiffel Tower' })).not.toBeInTheDocument(),
    );
  });
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
