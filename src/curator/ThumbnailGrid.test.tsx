import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThumbnailGrid } from './ThumbnailGrid';
import type { ThumbnailCache } from './useThumbnailCache';
import type { DropboxEntry } from '../dropbox/client';

vi.mock('../dropbox/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dropbox/client')>();
  return { ...actual, getThumbnailBatch: vi.fn().mockResolvedValue([]) };
});

import { getThumbnailBatch } from '../dropbox/client';
const mockGetThumbnailBatch = vi.mocked(getThumbnailBatch);

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

function makeMockCache(): ThumbnailCache {
  return {
    request: vi.fn().mockReturnValue({ tag: 'loading' }),
    subscribe: vi.fn().mockReturnValue(() => {}),
    peek: vi.fn().mockReturnValue({ tag: 'loading' }),
  };
}

function makeFile(name: string, path: string): DropboxEntry {
  return {
    '.tag': 'file',
    name,
    path_display: path,
    path_lower: path.toLowerCase(),
    id: `id:${name}`,
    size: 1024,
    server_modified: '2026-01-01T00:00:00Z',
    client_modified: '2025-12-31T12:00:00Z',
  };
}

function makeFolder(name: string, path: string): DropboxEntry {
  return { '.tag': 'folder', name, path_display: path, path_lower: path.toLowerCase() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetThumbnailBatch.mockResolvedValue([]);
});

describe('ThumbnailGrid', () => {
  it('should render the photo count and folder path in the header', async () => {
    const entries = [makeFile('a.jpg', '/Lyon/a.jpg'), makeFile('b.jpg', '/Lyon/b.jpg')];
    await act(async () => {
      render(
        <ThumbnailGrid
          path="/Lyon"
          entries={entries}
          cache={makeMockCache()}
          flags={{}}
          onSelect={vi.fn()}
        />,
      );
    });
    expect(screen.getByText(/2 photos in \/Lyon/)).toBeInTheDocument();
  });

  it('should render "No photos in this folder" with zero file entries', async () => {
    await act(async () => {
      render(
        <ThumbnailGrid path="/Empty" entries={[]} cache={makeMockCache()} flags={{}} onSelect={vi.fn()} />,
      );
    });
    expect(screen.getByText('No photos in this folder')).toBeInTheDocument();
  });

  it('should render "No photos in this folder" when entries are all folders', async () => {
    const entries = [makeFolder('Subfolder', '/Foo/Subfolder')];
    await act(async () => {
      render(
        <ThumbnailGrid path="/Foo" entries={entries} cache={makeMockCache()} flags={{}} onSelect={vi.fn()} />,
      );
    });
    expect(screen.getByText('No photos in this folder')).toBeInTheDocument();
  });

  it('should call onSelect with the sorted-list index when a cell is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    // b.jpg sorts before c.jpg; a.jpg is first alphabetically
    const entries = [makeFile('c.jpg', '/Lyon/c.jpg'), makeFile('a.jpg', '/Lyon/a.jpg'), makeFile('b.jpg', '/Lyon/b.jpg')];
    await act(async () => {
      render(
        <ThumbnailGrid
          path="/Lyon"
          entries={entries}
          cache={makeMockCache()}
          flags={{}}
          onSelect={onSelect}
        />,
      );
    });
    // sorted order: a.jpg(0), b.jpg(1), c.jpg(2)
    await user.click(screen.getByRole('button', { name: 'b.jpg' }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('should render badges matching the flags prop', async () => {
    const entries = [makeFile('a.jpg', '/Lyon/a.jpg'), makeFile('b.jpg', '/Lyon/b.jpg')];
    const flags = { 'id:a.jpg': 'keep' as const };
    await act(async () => {
      render(
        <ThumbnailGrid
          path="/Lyon"
          entries={entries}
          cache={makeMockCache()}
          flags={flags}
          onSelect={vi.fn()}
        />,
      );
    });
    expect(screen.getByTestId('flag-keep')).toBeInTheDocument();
    expect(screen.queryByTestId('flag-discard')).not.toBeInTheDocument();
  });
});
