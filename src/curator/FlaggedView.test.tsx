// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlaggedView } from './FlaggedView';
import type { ThumbnailCache } from './useThumbnailCache';

const mockListCuration = vi.fn();
const mockWriteCuration = vi.fn();

vi.mock('./curation', () => ({
  listCuration: (...args: unknown[]) => mockListCuration(...args),
  writeCuration: (...args: unknown[]) => mockWriteCuration(...args),
}));

vi.mock('../dropbox/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dropbox/client')>();
  return {
    ...actual,
    getPreview: vi.fn().mockResolvedValue('data:image/jpeg;base64,preview'),
  };
});

const LOADING_STATE = { tag: 'loading' as const };
const mockCache: ThumbnailCache = {
  request: vi.fn(() => LOADING_STATE),
  subscribe: vi.fn(() => () => {}),
  peek: vi.fn(() => LOADING_STATE),
};

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

beforeEach(() => {
  mockListCuration.mockReset();
  mockWriteCuration.mockReset();
  mockListCuration.mockResolvedValue([]);
  mockWriteCuration.mockResolvedValue(undefined);
});

const DEFAULT_PROPS = {
  isActive: true,
  cache: mockCache,
  previewWidth: 480,
  onPreviewResize: vi.fn(),
  onBeforeActivate: vi.fn(),
};

function makeFileEntry(folderPath: string, name: string, flag: 'keep' | 'discard') {
  const pathLower = `${folderPath.toLowerCase()}/${name.toLowerCase()}`;
  return {
    folderPath,
    records: {
      [pathLower]: {
        pathLower,
        pathDisplay: `${folderPath}/${name}`,
        name,
        flag,
      },
    },
  };
}

describe('FlaggedView', () => {
  it('should show "No flagged photos yet" when there are no curation records', async () => {
    mockListCuration.mockResolvedValue([]);
    render(<FlaggedView {...DEFAULT_PROPS} />);
    await waitFor(() =>
      expect(screen.getByText('No flagged photos yet')).toBeInTheDocument(),
    );
  });

  it('should render thumbnails for records across multiple folders', async () => {
    mockListCuration.mockResolvedValue([
      makeFileEntry('/Photos/Lyon', 'a.jpg', 'keep'),
      makeFileEntry('/Photos/Paris', 'b.jpg', 'discard'),
    ]);
    render(<FlaggedView {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'a.jpg' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'b.jpg' })).toBeInTheDocument();
  });

  it('should hide discard records when Keep filter is selected', async () => {
    const user = userEvent.setup();
    mockListCuration.mockResolvedValue([
      makeFileEntry('/Photos/Lyon', 'keep.jpg', 'keep'),
      makeFileEntry('/Photos/Lyon', 'discard.jpg', 'discard'),
    ]);
    render(<FlaggedView {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'keep.jpg' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.getByRole('button', { name: 'keep.jpg' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'discard.jpg' })).not.toBeInTheDocument();
  });

  it('should hide keep records when Discard filter is selected', async () => {
    const user = userEvent.setup();
    mockListCuration.mockResolvedValue([
      makeFileEntry('/Photos/Lyon', 'keep.jpg', 'keep'),
      makeFileEntry('/Photos/Lyon', 'discard.jpg', 'discard'),
    ]);
    render(<FlaggedView {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'discard.jpg' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByRole('button', { name: 'discard.jpg' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'keep.jpg' })).not.toBeInTheDocument();
  });

  it('should show "No photos match this filter" when filter excludes all records', async () => {
    const user = userEvent.setup();
    mockListCuration.mockResolvedValue([makeFileEntry('/Photos/Lyon', 'a.jpg', 'keep')]);
    render(<FlaggedView {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'a.jpg' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByText('No photos match this filter')).toBeInTheDocument();
  });

  it('should show All photos when All filter is selected after narrowing', async () => {
    const user = userEvent.setup();
    mockListCuration.mockResolvedValue([
      makeFileEntry('/Photos/Lyon', 'keep.jpg', 'keep'),
      makeFileEntry('/Photos/Lyon', 'discard.jpg', 'discard'),
    ]);
    render(<FlaggedView {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'keep.jpg' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: 'keep.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'discard.jpg' })).toBeInTheDocument();
  });

  it('should open PreviewPanel when a thumbnail is clicked', async () => {
    const user = userEvent.setup();
    mockListCuration.mockResolvedValue([makeFileEntry('/Photos/Lyon', 'a.jpg', 'keep')]);
    render(<FlaggedView {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'a.jpg' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'a.jpg' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /close preview/i })).toBeInTheDocument());
  });

  it('should close the preview when Escape is pressed', async () => {
    const user = userEvent.setup();
    mockListCuration.mockResolvedValue([makeFileEntry('/Photos/Lyon', 'a.jpg', 'keep')]);
    render(<FlaggedView {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'a.jpg' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'a.jpg' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /close preview/i })).toBeInTheDocument());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: /close preview/i })).not.toBeInTheDocument();
  });

  it('should call onBeforeActivate then reload when isActive transitions from false to true', async () => {
    const onBeforeActivate = vi.fn();
    mockListCuration.mockResolvedValue([]);
    const { rerender } = render(
      <FlaggedView {...DEFAULT_PROPS} isActive={false} onBeforeActivate={onBeforeActivate} />,
    );
    await waitFor(() => expect(mockListCuration).toHaveBeenCalledTimes(1));
    rerender(
      <FlaggedView {...DEFAULT_PROPS} isActive={true} onBeforeActivate={onBeforeActivate} />,
    );
    await waitFor(() => expect(mockListCuration).toHaveBeenCalledTimes(2));
    expect(onBeforeActivate).toHaveBeenCalledOnce();
  });

  it('should not call reload until onBeforeActivate resolves', async () => {
    let resolveBefore!: () => void;
    const onBeforeActivate = vi.fn(
      () => new Promise<void>((r) => { resolveBefore = r; }),
    );
    mockListCuration.mockResolvedValue([]);
    const { rerender } = render(
      <FlaggedView {...DEFAULT_PROPS} isActive={false} onBeforeActivate={onBeforeActivate} />,
    );
    await waitFor(() => expect(mockListCuration).toHaveBeenCalledTimes(1));

    rerender(<FlaggedView {...DEFAULT_PROPS} isActive={true} onBeforeActivate={onBeforeActivate} />);
    // onBeforeActivate is pending — reload must not have fired yet
    await Promise.resolve();
    expect(mockListCuration).toHaveBeenCalledTimes(1);

    resolveBefore();
    await waitFor(() => expect(mockListCuration).toHaveBeenCalledTimes(2));
  });
});
