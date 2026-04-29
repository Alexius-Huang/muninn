// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockGetPreview = vi.fn();

vi.mock('../dropbox/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dropbox/client')>();
  return { ...actual, getPreview: (...args: unknown[]) => mockGetPreview(...args) };
});

import { GroupDetailView } from './GroupDetailView';
import { useAppStore, _resetStoreForTesting } from './store';
import type { Group } from './groups';
import type { FlatRecord } from './store';

const LOADING_STATE = { tag: 'loading' as const };

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'g1',
    name: 'Eiffel Tower',
    lat: 48.8584,
    lng: 2.2945,
    locationName: 'Paris, France',
    photoIds: [],
    ...overrides,
  };
}

function makeRecord(name: string): FlatRecord {
  return {
    folderPath: '/Photos/Lyon',
    key: `/photos/lyon/${name.toLowerCase()}`,
    record: {
      pathLower: `/photos/lyon/${name.toLowerCase()}`,
      pathDisplay: `/Photos/Lyon/${name}`,
      name,
      groupId: 'g1',
    },
  };
}

function renderDetail(overrides: {
  group?: Group;
  records?: FlatRecord[];
  isActive?: boolean;
  onBack?: () => void;
  onDelete?: (group: Group) => void;
} = {}) {
  return render(
    <GroupDetailView
      group={overrides.group ?? makeGroup()}
      records={overrides.records ?? [makeRecord('a.jpg'), makeRecord('b.jpg')]}
      isActive={overrides.isActive ?? true}
      previewWidth={480}
      onPreviewResize={vi.fn()}
      onBack={overrides.onBack ?? vi.fn()}
      onDelete={overrides.onDelete ?? vi.fn()}
    />,
  );
}

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
  mockGetPreview.mockReset();
  mockGetPreview.mockResolvedValue('data:image/jpeg;base64,hires');
  _resetStoreForTesting();
  useAppStore.setState({
    cache: {
      peek: () => LOADING_STATE,
      subscribe: () => () => {},
      request: vi.fn(),
      retry: vi.fn(),
    },
  });
});

describe('GroupDetailView', () => {
  it('should render the group name, photo count, and location name in the header', () => {
    renderDetail();
    expect(screen.getByText('Eiffel Tower')).toBeTruthy();
    expect(screen.getByText('2 photos · Paris, France')).toBeTruthy();
  });

  it('should fall back to "lat, lng" formatted to 4 decimals when locationName is absent', () => {
    renderDetail({ group: makeGroup({ locationName: undefined }) });
    expect(screen.getByText('2 photos · 48.8584, 2.2945')).toBeTruthy();
  });

  it('should render one grid cell per record', () => {
    renderDetail({ records: [makeRecord('a.jpg'), makeRecord('b.jpg'), makeRecord('c.jpg')] });
    expect(screen.getByRole('button', { name: 'a.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'b.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'c.jpg' })).toBeInTheDocument();
  });

  it('should call onBack when the back button is clicked', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderDetail({ isActive: false, onBack });
    await user.click(screen.getByRole('button', { name: /back to groups/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('should open PreviewPanel when a photo cell is clicked', async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'a.jpg' }));
    expect(screen.getByRole('button', { name: /close preview/i })).toBeInTheDocument();
  });

  it('should show the group info footer and hide K/D buttons in the preview', async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'a.jpg' }));
    expect(screen.getAllByText('Eiffel Tower')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /keep/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /discard/i })).toBeNull();
  });

  it('should NOT render a Remove-from-group button in the preview', async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'a.jpg' }));
    expect(screen.queryByRole('button', { name: /remove from group/i })).toBeNull();
  });

  it('should close the preview when Escape is pressed', async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'a.jpg' }));
    expect(screen.getByRole('button', { name: /close preview/i })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: /close preview/i })).toBeNull();
  });

  it('should render the Delete button in the header with correct aria-label', () => {
    renderDetail();
    expect(
      screen.getByRole('button', { name: 'Delete group "Eiffel Tower"' }),
    ).toBeInTheDocument();
  });

  it('should call onDelete(group) when the Delete button is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const group = makeGroup();
    renderDetail({ group, onDelete });
    await user.click(screen.getByRole('button', { name: 'Delete group "Eiffel Tower"' }));
    expect(onDelete).toHaveBeenCalledWith(group);
  });

  it.each([
    ['{ArrowRight}', '2 / 3'],
    ['{ArrowLeft}',  '3 / 3'],
  ] as [string, string][])(
    'should navigate to the correct photo when %s is pressed in the preview',
    async (key, expectedLabel) => {
      const user = userEvent.setup();
      renderDetail({ records: [makeRecord('a.jpg'), makeRecord('b.jpg'), makeRecord('c.jpg')] });
      await user.click(screen.getByRole('button', { name: 'a.jpg' }));
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
      await user.keyboard(key);
      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    },
  );
});
