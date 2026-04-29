import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThumbnailGrid } from './ThumbnailGrid';
import type { ThumbnailCache } from './store';
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
    retry: vi.fn(),
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

  it('should call scrollIntoView on the newly-active thumbnail when activeIndex changes', async () => {
    const scrollIntoViewSpy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const entries = [makeFile('a.jpg', '/Lyon/a.jpg'), makeFile('b.jpg', '/Lyon/b.jpg')];
    let rerender!: ReturnType<typeof render>['rerender'];

    await act(async () => {
      const result = render(
        <ThumbnailGrid
          path="/Lyon"
          entries={entries}
          cache={makeMockCache()}
          flags={{}}
          onSelect={vi.fn()}
          activeIndex={null}
        />,
      );
      rerender = result.rerender;
    });

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();

    await act(async () => {
      rerender(
        <ThumbnailGrid
          path="/Lyon"
          entries={entries}
          cache={makeMockCache()}
          flags={{}}
          onSelect={vi.fn()}
          activeIndex={1}
        />,
      );
    });

    expect(scrollIntoViewSpy).toHaveBeenCalled();
    scrollIntoViewSpy.mockRestore();
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

  it('should remove the flag indicator from a tile when its flag is cleared', async () => {
    const entries = [makeFile('a.jpg', '/Lyon/a.jpg')];
    let rerender!: ReturnType<typeof render>['rerender'];
    await act(async () => {
      const result = render(
        <ThumbnailGrid
          path="/Lyon"
          entries={entries}
          cache={makeMockCache()}
          flags={{ 'id:a.jpg': 'keep' }}
          onSelect={vi.fn()}
        />,
      );
      rerender = result.rerender;
    });
    expect(screen.getByTestId('flag-keep')).toBeInTheDocument();
    await act(async () => {
      rerender(
        <ThumbnailGrid
          path="/Lyon"
          entries={entries}
          cache={makeMockCache()}
          flags={{}}
          onSelect={vi.fn()}
        />,
      );
    });
    expect(screen.queryByTestId('flag-keep')).not.toBeInTheDocument();
  });

  describe('Show grouped toggle', () => {
    it('should not render the toggle when onToggleShowGrouped is omitted', async () => {
      // Given no toggle callback provided (backward-compatible default)
      const entries = [makeFile('a.jpg', '/Lyon/a.jpg')];
      await act(async () => {
        render(<ThumbnailGrid path="/Lyon" entries={entries} cache={makeMockCache()} flags={{}} onSelect={vi.fn()} />);
      });
      // Then the toggle button is absent
      expect(screen.queryByRole('button', { name: 'Show grouped' })).not.toBeInTheDocument();
    });

    it('should render the toggle with aria-pressed="true" when showGrouped is true', async () => {
      // Given a grid with the toggle enabled (default on)
      const entries = [makeFile('a.jpg', '/Lyon/a.jpg')];
      await act(async () => {
        render(
          <ThumbnailGrid
            path="/Lyon"
            entries={entries}
            cache={makeMockCache()}
            flags={{}}
            showGrouped={true}
            onToggleShowGrouped={vi.fn()}
            onSelect={vi.fn()}
          />,
        );
      });
      // Then the button reports pressed state
      const btn = screen.getByRole('button', { name: 'Show grouped' });
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveAttribute('aria-pressed', 'true');
    });

    it('should render the toggle with aria-pressed="false" when showGrouped is false', async () => {
      // Given the toggle is off
      const entries = [makeFile('a.jpg', '/Lyon/a.jpg')];
      await act(async () => {
        render(
          <ThumbnailGrid
            path="/Lyon"
            entries={entries}
            cache={makeMockCache()}
            flags={{}}
            showGrouped={false}
            onToggleShowGrouped={vi.fn()}
            onSelect={vi.fn()}
          />,
        );
      });
      const btn = screen.getByRole('button', { name: 'Show grouped' });
      expect(btn).toHaveAttribute('aria-pressed', 'false');
    });

    it('should call onToggleShowGrouped when the toggle is clicked', async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();
      const entries = [makeFile('a.jpg', '/Lyon/a.jpg')];
      await act(async () => {
        render(
          <ThumbnailGrid
            path="/Lyon"
            entries={entries}
            cache={makeMockCache()}
            flags={{}}
            showGrouped={true}
            onToggleShowGrouped={onToggle}
            onSelect={vi.fn()}
          />,
        );
      });
      await user.click(screen.getByRole('button', { name: 'Show grouped' }));
      expect(onToggle).toHaveBeenCalledOnce();
    });

    it('should render the grouped badge for files present in the groupIds map', async () => {
      // Given two files where one is grouped
      const entries = [makeFile('a.jpg', '/Lyon/a.jpg'), makeFile('b.jpg', '/Lyon/b.jpg')];
      const groupIds = { 'id:a.jpg': 'g1' };
      await act(async () => {
        render(
          <ThumbnailGrid
            path="/Lyon"
            entries={entries}
            cache={makeMockCache()}
            flags={{}}
            groupIds={groupIds}
            showGrouped={true}
            onToggleShowGrouped={vi.fn()}
            onSelect={vi.fn()}
          />,
        );
      });
      // Then exactly one grouped badge is shown
      expect(screen.getAllByTestId('grouped')).toHaveLength(1);
    });
  });
});
