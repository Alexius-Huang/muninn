// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupsView } from './GroupsView';
import type { Group } from './groups';
import type { FlatRecord } from './useAllFlagged';
import type { ThumbnailCache } from './useThumbnailCache';

const LOADING_STATE = { tag: 'loading' as const };

function makeCache(): ThumbnailCache {
  return {
    peek: () => LOADING_STATE,
    subscribe: () => () => {},
    request: vi.fn(),
  };
}

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

describe('GroupsView', () => {
  it('should render empty-state copy when no groups exist', () => {
    render(
      <GroupsView
        groups={[]}
        recordsByGroupId={new Map()}
        cache={makeCache()}
        loading={false}
      />,
    );
    expect(screen.getByText(/No groups yet/)).toBeTruthy();
  });

  it('should render one card per group', () => {
    const groups = [
      makeGroup({ id: 'g1', name: 'Eiffel Tower' }),
      makeGroup({ id: 'g2', name: 'Colosseum' }),
    ];
    render(
      <GroupsView
        groups={groups}
        recordsByGroupId={new Map()}
        cache={makeCache()}
        loading={false}
      />,
    );
    expect(screen.getByText('Eiffel Tower')).toBeTruthy();
    expect(screen.getByText('Colosseum')).toBeTruthy();
  });

  it('should show loading state when loading is true', () => {
    render(
      <GroupsView
        groups={[]}
        recordsByGroupId={new Map()}
        cache={makeCache()}
        loading={true}
      />,
    );
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
    render(
      <GroupsView
        groups={groups}
        recordsByGroupId={recordsByGroupId}
        cache={makeCache()}
        loading={false}
      />,
    );

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
});
