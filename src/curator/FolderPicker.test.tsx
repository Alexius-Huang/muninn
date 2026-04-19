// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FolderPicker } from './FolderPicker';
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

const onSelect = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FolderPicker', () => {
  it('should call listFolderAll with "" on first render and display folders sorted alphabetically', async () => {
    mockListFolderAll.mockResolvedValue([
      makeFolder('photos', '/photos'),
      makeFolder('Archive', '/Archive'),
      makeFolder('misc', '/misc'),
    ]);
    render(<FolderPicker token="tok" onSelect={onSelect} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    expect(mockListFolderAll).toHaveBeenCalledWith('', 'tok');
    const items = screen.getAllByRole('button', { name: /📁/ });
    expect(items[0]).toHaveTextContent('Archive');
    expect(items[1]).toHaveTextContent('misc');
    expect(items[2]).toHaveTextContent('photos');
  });

  it('should hide files from the picker view', async () => {
    mockListFolderAll.mockResolvedValue([
      makeFolder('Albums', '/Albums'),
      makeFile('img1.jpg', '/img1.jpg'),
      makeFile('img2.jpg', '/img2.jpg'),
      makeFile('img3.jpg', '/img3.jpg'),
    ]);
    render(<FolderPicker token="tok" onSelect={onSelect} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    expect(screen.getByText(/Albums/)).toBeInTheDocument();
    expect(screen.queryByText('img1.jpg')).not.toBeInTheDocument();
    expect(screen.queryByText('img2.jpg')).not.toBeInTheDocument();
  });

  it('should drill into a subfolder when clicked and call listFolderAll with that path', async () => {
    const user = userEvent.setup();
    mockListFolderAll
      .mockResolvedValueOnce([makeFolder('Photos', '/Photos')])
      .mockResolvedValueOnce([makeFolder('Lyon', '/Photos/Lyon')]);
    render(<FolderPicker token="tok" onSelect={onSelect} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /📁 Photos/ }));
    await waitFor(() => expect(mockListFolderAll).toHaveBeenCalledWith('/Photos', 'tok'));
  });

  it('should show breadcrumbs reflecting the current path and jump back when a segment is clicked', async () => {
    const user = userEvent.setup();
    mockListFolderAll
      .mockResolvedValueOnce([makeFolder('Photos', '/Photos')])
      .mockResolvedValueOnce([makeFolder('Lyon', '/Photos/Lyon')])
      .mockResolvedValueOnce([makeFolder('Photos', '/Photos')]);
    render(<FolderPicker token="tok" onSelect={onSelect} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    // drill in
    await user.click(screen.getByRole('button', { name: /📁 Photos/ }));
    await waitFor(() => expect(screen.getByText('Photos', { selector: 'button' })).toBeInTheDocument());
    // breadcrumb should show Dropbox / Photos
    expect(screen.getByRole('button', { name: 'Dropbox' })).toBeInTheDocument();
    // jump back via Dropbox breadcrumb
    await user.click(screen.getByRole('button', { name: 'Dropbox' }));
    await waitFor(() => expect(mockListFolderAll).toHaveBeenCalledWith('', 'tok'));
  });

  it('should call onSelect with currentPath and entries when "Select this folder" is clicked', async () => {
    const user = userEvent.setup();
    const entries = [makeFolder('Lyon', '/Photos/Lyon')];
    mockListFolderAll.mockResolvedValue(entries);
    render(<FolderPicker token="tok" onSelect={onSelect} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Select this folder' }));
    expect(onSelect).toHaveBeenCalledWith('', entries);
  });

  it('should show an inline error when listFolderAll rejects with DropboxApiError', async () => {
    mockListFolderAll.mockRejectedValue(new DropboxApiError('path/not_found/...', 409));
    render(<FolderPicker token="tok" onSelect={onSelect} />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('path/not_found/...');
  });

  it('should disable "Select this folder" while loading', async () => {
    let resolve!: (entries: DropboxEntry[]) => void;
    mockListFolderAll.mockReturnValue(new Promise<DropboxEntry[]>((r) => { resolve = r; }));
    render(<FolderPicker token="tok" onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: 'Select this folder' })).toBeDisabled();
    resolve([]);
  });

  it('should show "No subfolders" when the current folder has zero subfolders', async () => {
    mockListFolderAll.mockResolvedValue([
      makeFile('img.jpg', '/img.jpg'),
    ]);
    render(<FolderPicker token="tok" onSelect={onSelect} />);
    await waitFor(() => expect(screen.getByText('No subfolders')).toBeInTheDocument());
  });
});
