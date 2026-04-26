// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlaggedView } from './FlaggedView';
import type { ThumbnailCache } from './useThumbnailCache';
import type { FlatRecord } from './useAllFlagged';

vi.mock('../dropbox/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dropbox/client')>();
  return {
    ...actual,
    getPreview: vi.fn().mockResolvedValue('data:image/jpeg;base64,preview'),
  };
});

vi.mock('./CreateGroupModal', () => ({
  CreateGroupModal: ({ open, onSubmit }: { open: boolean; onSubmit: (args: { name: string; location: unknown }) => Promise<void> }) =>
    open ? (
      <div data-testid="create-group-modal">
        <button onClick={() => onSubmit({ name: 'Test Group', location: { name: 'Paris', lat: 48, lng: 2, placeId: 'p1', displayName: 'Paris, France' } })}>
          Submit modal
        </button>
      </div>
    ) : null,
}));

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

function makeFlat(folderPath: string, name: string, flag: 'keep' | 'discard'): FlatRecord {
  const pathLower = `${folderPath.toLowerCase()}/${name.toLowerCase()}`;
  return {
    folderPath,
    key: pathLower,
    record: {
      pathLower,
      pathDisplay: `${folderPath}/${name}`,
      name,
      flag,
    },
  };
}

const DEFAULT_PROPS = {
  records: [] as FlatRecord[],
  setFlag: vi.fn(),
  clearAll: vi.fn(),
  loading: false,
  isActive: true,
  cache: mockCache,
  previewWidth: 480,
  onPreviewResize: vi.fn(),
  email: 'test@example.com',
  onCreateGroup: vi.fn().mockResolvedValue(undefined),
};

describe('FlaggedView', () => {
  it('should show "No flagged photos yet" when there are no records', () => {
    render(<FlaggedView {...DEFAULT_PROPS} />);
    expect(screen.getByText('No flagged photos yet')).toBeInTheDocument();
  });

  it('should render thumbnails for records across multiple folders', () => {
    const records = [
      makeFlat('/Photos/Lyon', 'a.jpg', 'keep'),
      makeFlat('/Photos/Paris', 'b.jpg', 'discard'),
    ];
    render(<FlaggedView {...DEFAULT_PROPS} records={records} />);
    expect(screen.getByRole('button', { name: 'a.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'b.jpg' })).toBeInTheDocument();
  });

  it('should hide discard records when Keep filter is selected', async () => {
    const user = userEvent.setup();
    const records = [
      makeFlat('/Photos/Lyon', 'keep.jpg', 'keep'),
      makeFlat('/Photos/Lyon', 'discard.jpg', 'discard'),
    ];
    render(<FlaggedView {...DEFAULT_PROPS} records={records} />);
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.getByRole('button', { name: 'keep.jpg' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'discard.jpg' })).not.toBeInTheDocument();
  });

  it('should hide keep records when Discard filter is selected', async () => {
    const user = userEvent.setup();
    const records = [
      makeFlat('/Photos/Lyon', 'keep.jpg', 'keep'),
      makeFlat('/Photos/Lyon', 'discard.jpg', 'discard'),
    ];
    render(<FlaggedView {...DEFAULT_PROPS} records={records} />);
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByRole('button', { name: 'discard.jpg' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'keep.jpg' })).not.toBeInTheDocument();
  });

  it('should show "No photos match this filter" when filter excludes all records', async () => {
    const user = userEvent.setup();
    const records = [makeFlat('/Photos/Lyon', 'a.jpg', 'keep')];
    render(<FlaggedView {...DEFAULT_PROPS} records={records} />);
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByText('No photos match this filter')).toBeInTheDocument();
  });

  it('should show All photos when All filter is selected after narrowing', async () => {
    const user = userEvent.setup();
    const records = [
      makeFlat('/Photos/Lyon', 'keep.jpg', 'keep'),
      makeFlat('/Photos/Lyon', 'discard.jpg', 'discard'),
    ];
    render(<FlaggedView {...DEFAULT_PROPS} records={records} />);
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: 'keep.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'discard.jpg' })).toBeInTheDocument();
  });

  it('should open PreviewPanel when a thumbnail is clicked', async () => {
    const user = userEvent.setup();
    const records = [makeFlat('/Photos/Lyon', 'a.jpg', 'keep')];
    render(<FlaggedView {...DEFAULT_PROPS} records={records} />);
    await user.click(screen.getByRole('button', { name: 'a.jpg' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /close preview/i })).toBeInTheDocument());
  });

  it('should close the preview when Escape is pressed', async () => {
    const user = userEvent.setup();
    const records = [makeFlat('/Photos/Lyon', 'a.jpg', 'keep')];
    render(<FlaggedView {...DEFAULT_PROPS} records={records} />);
    await user.click(screen.getByRole('button', { name: 'a.jpg' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /close preview/i })).toBeInTheDocument());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: /close preview/i })).not.toBeInTheDocument();
  });

  describe('Create Group button', () => {
    it('should not render Create Group button on the All filter', async () => {
      const records = [makeFlat('/Photos/Lyon', 'keep.jpg', 'keep')];
      render(<FlaggedView {...DEFAULT_PROPS} records={records} />);
      expect(screen.queryByRole('button', { name: 'Create Group' })).not.toBeInTheDocument();
    });

    it('should not render Create Group button on the Keep filter when there are zero keep records', async () => {
      const user = userEvent.setup();
      const records = [makeFlat('/Photos/Lyon', 'discard.jpg', 'discard')];
      render(<FlaggedView {...DEFAULT_PROPS} records={records} />);
      await user.click(screen.getByRole('button', { name: 'Keep' }));
      expect(screen.queryByRole('button', { name: 'Create Group' })).not.toBeInTheDocument();
    });

    it('should render Create Group button on the Keep filter when ≥1 keep record exists', async () => {
      const user = userEvent.setup();
      const records = [makeFlat('/Photos/Lyon', 'keep.jpg', 'keep')];
      render(<FlaggedView {...DEFAULT_PROPS} records={records} />);
      await user.click(screen.getByRole('button', { name: 'Keep' }));
      expect(screen.getByRole('button', { name: 'Create Group' })).toBeInTheDocument();
    });

    it('should open the modal when Create Group is clicked', async () => {
      const user = userEvent.setup();
      const records = [makeFlat('/Photos/Lyon', 'keep.jpg', 'keep')];
      render(<FlaggedView {...DEFAULT_PROPS} records={records} />);
      await user.click(screen.getByRole('button', { name: 'Keep' }));
      await user.click(screen.getByRole('button', { name: 'Create Group' }));
      expect(screen.getByTestId('create-group-modal')).toBeInTheDocument();
    });

    it('should call onCreateGroup with the visible keep photos when the modal submits', async () => {
      const onCreateGroup = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      const records = [
        makeFlat('/Photos/Lyon', 'keep.jpg', 'keep'),
        makeFlat('/Photos/Paris', 'keep2.jpg', 'keep'),
      ];
      render(<FlaggedView {...DEFAULT_PROPS} records={records} onCreateGroup={onCreateGroup} />);
      await user.click(screen.getByRole('button', { name: 'Keep' }));
      await user.click(screen.getByRole('button', { name: 'Create Group' }));
      await user.click(screen.getByRole('button', { name: 'Submit modal' }));
      expect(onCreateGroup).toHaveBeenCalledOnce();
      const call = onCreateGroup.mock.calls[0][0];
      expect(call.name).toBe('Test Group');
      expect(call.photos).toHaveLength(2);
      expect(call.photos.map((p: { key: string }) => p.key)).toContain('/photos/lyon/keep.jpg');
      expect(call.photos.map((p: { key: string }) => p.key)).toContain('/photos/paris/keep2.jpg');
    });
  });
});
