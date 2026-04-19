// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FolderTree } from './FolderTree';
import type { DropboxEntry } from '../dropbox/client';
import { DropboxApiError } from '../dropbox/client';

vi.mock('../dropbox/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dropbox/client')>();
  return { ...actual, listFolderAll: vi.fn() };
});

import { listFolderAll } from '../dropbox/client';
const mockListFolderAll = vi.mocked(listFolderAll);

function makeFolder(name: string, path: string): DropboxEntry {
  return { '.tag': 'folder', name, path_display: path, path_lower: path.toLowerCase() };
}

function makeFile(name: string, path: string): DropboxEntry {
  return {
    '.tag': 'file',
    name,
    path_display: path,
    path_lower: path.toLowerCase(),
    id: `id-${name}`,
    size: 1024,
    server_modified: '2026-01-01T00:00:00Z',
  };
}

const onOpen = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FolderTree', () => {
  it('should fetch and render root folders on mount, sorted alphabetically', async () => {
    mockListFolderAll.mockResolvedValue([
      makeFolder('Photos', '/Photos'),
      makeFolder('Archive', '/Archive'),
      makeFolder('misc', '/misc'),
    ]);
    render(<FolderTree activePath={null} onOpen={onOpen} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    expect(mockListFolderAll).toHaveBeenCalledWith('');
    const buttons = screen.getAllByRole('button', { name: /Expand|Collapse/ });
    const names = buttons.map((b) => b.textContent?.replace('📁 ', '').replace(/[▶▼…]/g, '').trim());
    expect(names).toEqual(['Archive', 'misc', 'Photos']);
  });

  it('should filter files out of the tree (files never render as nodes)', async () => {
    mockListFolderAll.mockResolvedValueOnce([
      makeFolder('Photos', '/Photos'),
      makeFile('readme.txt', '/readme.txt'),
      makeFile('cover.jpg', '/cover.jpg'),
    ]);
    render(<FolderTree activePath={null} onOpen={onOpen} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    expect(screen.getByText(/Photos/)).toBeInTheDocument();
    expect(screen.queryByText('readme.txt')).not.toBeInTheDocument();
    expect(screen.queryByText('cover.jpg')).not.toBeInTheDocument();
  });

  it('should show a per-node loading indicator while children are fetching', async () => {
    let resolveRoot!: (entries: DropboxEntry[]) => void;
    mockListFolderAll.mockReturnValueOnce(new Promise<DropboxEntry[]>((r) => { resolveRoot = r; }));
    render(<FolderTree activePath={null} onOpen={onOpen} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    resolveRoot([]);
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  });

  it('should expand a folder on click and fetch its children on first expand only', async () => {
    const user = userEvent.setup();
    mockListFolderAll
      .mockResolvedValueOnce([makeFolder('Photos', '/Photos')])
      .mockResolvedValueOnce([makeFolder('Lyon', '/Photos/Lyon')]);
    render(<FolderTree activePath={null} onOpen={onOpen} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Expand Photos' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Expand Photos' }));
    await waitFor(() => expect(mockListFolderAll).toHaveBeenCalledWith('/Photos'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Expand Lyon' })).toBeInTheDocument());

    // Collapse then re-expand — should not refetch
    await user.click(screen.getByRole('button', { name: 'Collapse Photos' }));
    await user.click(screen.getByRole('button', { name: 'Expand Photos' }));
    expect(mockListFolderAll).toHaveBeenCalledTimes(2); // root + first expand of Photos
  });

  it('should collapse an expanded folder without refetching', async () => {
    const user = userEvent.setup();
    mockListFolderAll
      .mockResolvedValueOnce([makeFolder('Photos', '/Photos')])
      .mockResolvedValueOnce([makeFolder('Lyon', '/Photos/Lyon')]);
    render(<FolderTree activePath={null} onOpen={onOpen} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Expand Photos' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Expand Photos' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Expand Lyon' })).toBeInTheDocument());

    const callCountAfterExpand = mockListFolderAll.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Collapse Photos' }));
    expect(screen.queryByRole('button', { name: 'Expand Lyon' })).not.toBeInTheDocument();
    expect(mockListFolderAll).toHaveBeenCalledTimes(callCountAfterExpand);
  });

  it('should reveal an "Open" button on hover and call onOpen with cached entries when clicked', async () => {
    const user = userEvent.setup();
    const photosChildren = [makeFile('a.jpg', '/Photos/a.jpg')];
    mockListFolderAll
      .mockResolvedValueOnce([makeFolder('Photos', '/Photos')])
      .mockResolvedValueOnce(photosChildren);
    render(<FolderTree activePath={null} onOpen={onOpen} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Expand Photos' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Expand Photos' }));
    await waitFor(() => expect(mockListFolderAll).toHaveBeenCalledWith('/Photos'));

    await user.click(screen.getByRole('button', { name: 'Open Photos' }));
    expect(onOpen).toHaveBeenCalledWith('/Photos', photosChildren);
    expect(mockListFolderAll).toHaveBeenCalledTimes(2); // root + expand only
  });

  it('should fetch entries on "Open" for a not-yet-expanded folder and then call onOpen', async () => {
    const user = userEvent.setup();
    const photosEntries = [makeFile('a.jpg', '/Photos/a.jpg')];
    mockListFolderAll
      .mockResolvedValueOnce([makeFolder('Photos', '/Photos')])
      .mockResolvedValueOnce(photosEntries);

    render(<FolderTree activePath={null} onOpen={onOpen} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Photos' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Open Photos' }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('/Photos', photosEntries));
    expect(mockListFolderAll).toHaveBeenCalledWith('/Photos');
  });

  it('should highlight the row whose path equals activePath', async () => {
    mockListFolderAll.mockResolvedValue([
      makeFolder('Photos', '/Photos'),
      makeFolder('Videos', '/Videos'),
    ]);
    render(<FolderTree activePath="/Photos" onOpen={onOpen} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Expand Photos' })).toBeInTheDocument());

    const photosBtn = screen.getByRole('button', { name: 'Expand Photos' });
    const row = photosBtn.closest('div[class*="group"]');
    expect(row?.className).toMatch(/bg-nord-2/);

    const videosBtn = screen.getByRole('button', { name: 'Expand Videos' });
    const videosRow = videosBtn.closest('div[class*="group"]');
    expect(videosRow?.className).not.toMatch(/bg-nord-2.*text-nord-6|text-nord-6.*bg-nord-2/);
  });

  it('should show an inline alert when a child fetch rejects with DropboxApiError', async () => {
    const user = userEvent.setup();
    mockListFolderAll
      .mockResolvedValueOnce([makeFolder('Photos', '/Photos')])
      .mockRejectedValueOnce(new DropboxApiError('path/not_found/...', 409));
    render(<FolderTree activePath={null} onOpen={onOpen} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Expand Photos' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Expand Photos' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('path/not_found/...');
  });
});
