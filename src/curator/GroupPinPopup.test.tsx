// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupPinPopup } from './GroupPinPopup';
import type { Group } from './groups';
import type { FlatRecord, ThumbnailCache } from './store';

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'g1',
    name: 'Eiffel Tower',
    lat: 48.858,
    lng: 2.294,
    photoIds: [],
    ...overrides,
  };
}

function makeRecord(name: string): FlatRecord {
  return {
    folderPath: '/Photos',
    key: `id:${name}`,
    record: {
      pathLower: `/${name}.jpg`,
      pathDisplay: `/${name}.jpg`,
      name: `${name}.jpg`,
    },
  };
}

const LOADING_STATE = { tag: 'loading' as const };

function makeCache(): ThumbnailCache {
  return {
    peek: vi.fn(() => LOADING_STATE),
    subscribe: vi.fn(() => () => {}),
    request: vi.fn(),
    retry: vi.fn(),
  };
}

describe('GroupPinPopup', () => {
  it('should render the group name as a heading', () => {
    render(
      <GroupPinPopup
        group={makeGroup({ name: 'Paris Trip' })}
        records={[]}
        cache={makeCache()}
        onViewInGroups={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Paris Trip' })).toBeInTheDocument();
  });

  it.each([
    [0, '0 photos'],
    [1, '1 photo'],
    [2, '2 photos'],
    [5, '5 photos'],
  ])('should render "%s" for %i record(s)', (count, label) => {
    const records = Array.from({ length: count }, (_, i) => makeRecord(String(i)));
    render(
      <GroupPinPopup
        group={makeGroup()}
        records={records}
        cache={makeCache()}
        onViewInGroups={vi.fn()}
      />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each([
    [0, 0],
    [1, 1],
    [5, 5],
    [8, 5],
  ])('should render min(%i, 5) = %i thumbnail tile(s)', (recordCount, expectedTiles) => {
    const records = Array.from({ length: recordCount }, (_, i) => makeRecord(String(i)));
    render(
      <GroupPinPopup
        group={makeGroup()}
        records={records}
        cache={makeCache()}
        onViewInGroups={vi.fn()}
      />,
    );
    const tiles = screen.queryAllByTestId('mosaic-cell');
    expect(tiles).toHaveLength(expectedTiles);
  });

  it('should call onViewInGroups when the "View in Groups" button is clicked', async () => {
    const user = userEvent.setup();
    const onViewInGroups = vi.fn();
    render(
      <GroupPinPopup
        group={makeGroup()}
        records={[makeRecord('a')]}
        cache={makeCache()}
        onViewInGroups={onViewInGroups}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'View in Groups' }));
    expect(onViewInGroups).toHaveBeenCalledOnce();
  });
});
