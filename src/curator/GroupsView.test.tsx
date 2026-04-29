// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupsView } from './GroupsView';
import { useAppStore, _resetStoreForTesting, createThumbnailCache } from './store';
import type { Group } from './groups';
import type { FlatRecord } from './store';

function makeGroup(overrides: Partial<Group> & { id: string; name: string }): Group {
  return {
    lat: 0,
    lng: 0,
    photoIds: [],
    ...overrides,
  };
}

function makeRecord(name: string, groupId: string): FlatRecord {
  return {
    folderPath: '/Photos/Lyon',
    key: `id:${name}`,
    record: {
      photoId: `id:${name}`,
      pathLower: `/${name}.jpg`,
      pathDisplay: `/${name}.jpg`,
      name: `${name}.jpg`,
      groupId,
    },
  };
}

const EXTRA_PROPS = {
  isActive: false as boolean,
  previewWidth: 480,
  onPreviewResize: () => {},
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
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  _resetStoreForTesting();
  useAppStore.setState({
    groups: [],
    recordsByGroupId: new Map(),
    cache: createThumbnailCache(),
    groupedLoading: false,
  });
});

describe('GroupsView', () => {
  it('should render empty-state copy when no groups exist', () => {
    render(<GroupsView {...EXTRA_PROPS} />);
    expect(screen.getByText(/No groups yet/)).toBeTruthy();
  });

  it('renders the correct group list when the store is seeded', () => {
    const groups = [
      makeGroup({ id: 'g1', name: 'Eiffel Tower' }),
      makeGroup({ id: 'g2', name: 'Colosseum' }),
    ];
    useAppStore.setState({ groups, recordsByGroupId: new Map() });
    render(<GroupsView {...EXTRA_PROPS} />);
    expect(screen.getByText('Eiffel Tower')).toBeTruthy();
    expect(screen.getByText('Colosseum')).toBeTruthy();
  });

  it('should render one card per group', () => {
    const groups = [
      makeGroup({ id: 'g1', name: 'Eiffel Tower' }),
      makeGroup({ id: 'g2', name: 'Colosseum' }),
    ];
    useAppStore.setState({ groups, recordsByGroupId: new Map() });
    render(<GroupsView {...EXTRA_PROPS} />);
    expect(screen.getByText('Eiffel Tower')).toBeTruthy();
    expect(screen.getByText('Colosseum')).toBeTruthy();
  });

  it('should show loading state when groupedLoading is true', () => {
    useAppStore.setState({ groupedLoading: true });
    render(<GroupsView {...EXTRA_PROPS} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('should reorder cards when sort dropdown changes', async () => {
    const user = userEvent.setup();
    const groups = [
      makeGroup({ id: 'g1', name: 'Alpha', photoIds: ['p1'], createdAt: '2026-01-01T00:00:00.000Z' }),
      makeGroup({ id: 'g2', name: 'Beta', photoIds: ['p1', 'p2', 'p3'], createdAt: '2026-03-01T00:00:00.000Z' }),
    ];
    const recordsByGroupId = new Map([
      ['g1', [makeRecord('a', 'g1')]],
      ['g2', [makeRecord('b', 'g2'), makeRecord('c', 'g2'), makeRecord('d', 'g2')]],
    ]);
    useAppStore.setState({ groups, recordsByGroupId });
    render(<GroupsView {...EXTRA_PROPS} />);

    // Default sort: newest first → Beta (2026-03) before Alpha (2026-01)
    const cards = screen.getAllByRole('article');
    expect(cards[0]).toHaveAttribute('aria-label', 'Beta');
    expect(cards[1]).toHaveAttribute('aria-label', 'Alpha');

    // Change to Photo count → Beta (3 photos) still first
    await user.selectOptions(screen.getByRole('combobox', { name: /sort groups/i }), 'count');
    const cardsByCount = screen.getAllByRole('article');
    expect(cardsByCount[0]).toHaveAttribute('aria-label', 'Beta');
    expect(cardsByCount[1]).toHaveAttribute('aria-label', 'Alpha');

    // Change to oldest first → Alpha (2026-01) before Beta (2026-03)
    await user.selectOptions(screen.getByRole('combobox', { name: /sort groups/i }), 'oldest');
    const cardsByOldest = screen.getAllByRole('article');
    expect(cardsByOldest[0]).toHaveAttribute('aria-label', 'Alpha');
    expect(cardsByOldest[1]).toHaveAttribute('aria-label', 'Beta');
  });

  it('should switch to the detail view when a group card is clicked', async () => {
    const user = userEvent.setup();
    const group = makeGroup({ id: 'g1', name: 'Eiffel Tower', locationName: 'Paris, France' });
    const recordsByGroupId = new Map([['g1', [makeRecord('a', 'g1')]]]);
    useAppStore.setState({ groups: [group], recordsByGroupId });
    render(<GroupsView {...EXTRA_PROPS} />);

    await user.click(screen.getByRole('article', { name: 'Eiffel Tower' }));

    expect(screen.getByRole('button', { name: /back to groups/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /sort groups/i })).toBeNull();
  });

  it('should return to the list view when the back button is clicked', async () => {
    const user = userEvent.setup();
    const group = makeGroup({ id: 'g1', name: 'Eiffel Tower', locationName: 'Paris, France' });
    const recordsByGroupId = new Map([['g1', [makeRecord('a', 'g1')]]]);
    useAppStore.setState({ groups: [group], recordsByGroupId });
    render(<GroupsView {...EXTRA_PROPS} />);

    await user.click(screen.getByRole('article', { name: 'Eiffel Tower' }));
    expect(screen.getByRole('button', { name: /back to groups/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /back to groups/i }));
    expect(screen.getByRole('combobox', { name: /sort groups/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back to groups/i })).toBeNull();
  });

  it('should open the DeleteGroupModal with the correct group when the card trash icon is clicked', async () => {
    const user = userEvent.setup();
    const group = makeGroup({ id: 'g1', name: 'Eiffel Tower', locationName: 'Paris, France' });
    const recordsByGroupId = new Map([['g1', [makeRecord('a', 'g1'), makeRecord('b', 'g1')]]]);
    useAppStore.setState({ groups: [group], recordsByGroupId });
    render(<GroupsView {...EXTRA_PROPS} />);
    await user.click(screen.getByRole('button', { name: 'Delete group "Eiffel Tower"' }));
    expect(screen.getByText('Delete "Eiffel Tower"?')).toBeInTheDocument();
    expect(screen.getByText('The 2 photos will return to unprocessed state.')).toBeInTheDocument();
  });

  it('should call the store deleteGroup action exactly once when the modal Delete is confirmed', async () => {
    const user = userEvent.setup();
    const group = makeGroup({ id: 'g1', name: 'Eiffel Tower', locationName: 'Paris, France' });
    const deleteSpy = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({ groups: [group], recordsByGroupId: new Map([['g1', [makeRecord('a', 'g1')]]]), deleteGroup: deleteSpy });

    render(<GroupsView {...EXTRA_PROPS} />);
    await user.click(screen.getByRole('button', { name: 'Delete group "Eiffel Tower"' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('g1'));
    expect(deleteSpy).toHaveBeenCalledOnce();
  });

  it('should close the modal and return to the list after deleting from detail view', async () => {
    const user = userEvent.setup();
    const group = makeGroup({ id: 'g1', name: 'Eiffel Tower', locationName: 'Paris, France' });
    useAppStore.setState({ groups: [group], recordsByGroupId: new Map([['g1', [makeRecord('a', 'g1')]]]), deleteGroup: vi.fn().mockResolvedValue(undefined) });

    render(<GroupsView {...EXTRA_PROPS} />);

    // Navigate into detail view
    await user.click(screen.getByRole('article', { name: 'Eiffel Tower' }));
    expect(screen.getByRole('button', { name: /back to groups/i })).toBeInTheDocument();

    // Click the in-header Delete button
    await user.click(screen.getByRole('button', { name: 'Delete group "Eiffel Tower"' }));
    expect(screen.getByText('Delete "Eiffel Tower"?')).toBeInTheDocument();

    // Confirm
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Delete "Eiffel Tower"?')).not.toBeInTheDocument());

    // Modal gone and detail view reset
    expect(screen.queryByRole('button', { name: /back to groups/i })).not.toBeInTheDocument();
  });
});
