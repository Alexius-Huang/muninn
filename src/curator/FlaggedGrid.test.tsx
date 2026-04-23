// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlaggedGrid } from './FlaggedGrid';
import type { FlatRecord } from './useAllFlagged';
import type { ThumbnailCache } from './useThumbnailCache';

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

function makeFlat(name: string, flag: 'keep' | 'discard'): FlatRecord {
  const pathLower = `/photos/lyon/${name.toLowerCase()}`;
  return {
    folderPath: '/Photos/Lyon',
    record: {
      pathLower,
      pathDisplay: `/Photos/Lyon/${name}`,
      name,
      flag,
    },
  };
}

describe('FlaggedGrid', () => {
  it('should render one cell per record', () => {
    const records = [makeFlat('a.jpg', 'keep'), makeFlat('b.jpg', 'discard')];
    render(<FlaggedGrid records={records} cache={mockCache} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'a.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'b.jpg' })).toBeInTheDocument();
  });

  it('should show keep glow for keep records', () => {
    const records = [makeFlat('a.jpg', 'keep')];
    render(<FlaggedGrid records={records} cache={mockCache} onSelect={vi.fn()} />);
    expect(screen.getByTestId('flag-keep')).toBeInTheDocument();
  });

  it('should show discard glow for discard records', () => {
    const records = [makeFlat('a.jpg', 'discard')];
    render(<FlaggedGrid records={records} cache={mockCache} onSelect={vi.fn()} />);
    expect(screen.getByTestId('flag-discard')).toBeInTheDocument();
  });

  it('should invoke onSelect with the flat index when a cell is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const records = [makeFlat('a.jpg', 'keep'), makeFlat('b.jpg', 'discard')];
    render(<FlaggedGrid records={records} cache={mockCache} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: 'a.jpg' }));
    expect(onSelect).toHaveBeenCalledWith(0);
  });
});
