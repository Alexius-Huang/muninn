import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThumbnailGrid } from './ThumbnailGrid';
import type { DropboxEntry } from '../dropbox/client';

vi.mock('../dropbox/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dropbox/client')>();
  return { ...actual, getThumbnailBatch: vi.fn().mockResolvedValue([]) };
});

import { getThumbnailBatch } from '../dropbox/client';
const mockGetThumbnailBatch = vi.mocked(getThumbnailBatch);

// Give jsdom elements non-zero width so ResizeObserver fires a useful column count
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() { return 800; },
  });
});

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
      render(<ThumbnailGrid path="/Lyon" entries={entries} token="tok" onChange={() => {}} />);
    });
    expect(screen.getByText(/2 photos in \/Lyon/)).toBeInTheDocument();
  });

  it('should render "No photos in this folder" with zero file entries', async () => {
    await act(async () => {
      render(<ThumbnailGrid path="/Empty" entries={[]} token="tok" onChange={() => {}} />);
    });
    expect(screen.getByText('No photos in this folder')).toBeInTheDocument();
  });

  it('should render "No photos in this folder" when entries are all folders', async () => {
    const entries = [makeFolder('Subfolder', '/Foo/Subfolder')];
    await act(async () => {
      render(<ThumbnailGrid path="/Foo" entries={entries} token="tok" onChange={() => {}} />);
    });
    expect(screen.getByText('No photos in this folder')).toBeInTheDocument();
  });

  it('should call onChange when the "Change folder" button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    await act(async () => {
      render(<ThumbnailGrid path="/Lyon" entries={[makeFile('a.jpg', '/Lyon/a.jpg')]} token="tok" onChange={onChange} />);
    });
    await user.click(screen.getByRole('button', { name: 'Change folder' }));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('should not call getThumbnailBatch when the entry list has zero files', async () => {
    await act(async () => {
      render(<ThumbnailGrid path="/Empty" entries={[]} token="tok" onChange={() => {}} />);
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(mockGetThumbnailBatch).not.toHaveBeenCalled();
  });

  it('should call getThumbnailBatch with at most 25 paths per call', async () => {
    const entries = Array.from({ length: 30 }, (_, i) => makeFile(`img-${i}.jpg`, `/Lyon/img-${i}.jpg`));
    mockGetThumbnailBatch.mockImplementation((paths) =>
      Promise.resolve(paths.map((p) => ({ tag: 'success' as const, path_lower: p.toLowerCase(), dataUrl: 'data:image/jpeg;base64,x' }))),
    );
    await act(async () => {
      render(<ThumbnailGrid path="/Lyon" entries={entries} token="tok" onChange={() => {}} />);
      await new Promise((r) => setTimeout(r, 20));
    });
    for (const call of mockGetThumbnailBatch.mock.calls) {
      expect(call[0].length).toBeLessThanOrEqual(25);
    }
  });
});
