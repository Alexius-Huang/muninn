// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupCard } from './GroupCard';
import type { Group } from './groups';
import type { FlatRecord } from './store';
import type { ThumbnailCache } from './store';

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'g1',
    name: 'Eiffel Tower',
    lat: 48.8584,
    lng: 2.2945,
    photoIds: [],
    locationName: 'Paris, France',
    ...overrides,
  };
}

function makeRecord(name: string, groupId = 'g1'): FlatRecord {
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

const LOADING_STATE = { tag: 'loading' as const };

function makeCache(): ThumbnailCache {
  return {
    peek: () => LOADING_STATE,
    subscribe: () => () => {},
    request: vi.fn(),
    retry: vi.fn(),
  };
}

describe('GroupCard', () => {
  it('should render group name, photo count, and location name', () => {
    const cache = makeCache();
    const records = [makeRecord('a'), makeRecord('b')];
    render(<GroupCard group={makeGroup()} records={records} cache={cache} />);
    expect(screen.getByText('Eiffel Tower')).toBeTruthy();
    expect(screen.getByText('2 photos')).toBeTruthy();
    expect(screen.getByText('Paris, France')).toBeTruthy();
  });

  it('should fall back to "lat, lng" when locationName is absent', () => {
    const cache = makeCache();
    render(
      <GroupCard
        group={makeGroup({ locationName: undefined })}
        records={[makeRecord('a')]}
        cache={cache}
      />,
    );
    expect(screen.getByText('48.8584, 2.2945')).toBeTruthy();
  });

  it('should show singular "photo" for count of 1', () => {
    const cache = makeCache();
    render(<GroupCard group={makeGroup()} records={[makeRecord('a')]} cache={cache} />);
    expect(screen.getByText('1 photo')).toBeTruthy();
  });

  it('should render 1 mosaic cell when group has 1 photo', () => {
    const cache = makeCache();
    render(<GroupCard group={makeGroup()} records={[makeRecord('a')]} cache={cache} />);
    expect(screen.getAllByTestId('mosaic-cell')).toHaveLength(1);
  });

  it('should render 2 mosaic cells when group has 2 photos', () => {
    const cache = makeCache();
    render(<GroupCard group={makeGroup()} records={[makeRecord('a'), makeRecord('b')]} cache={cache} />);
    expect(screen.getAllByTestId('mosaic-cell')).toHaveLength(2);
  });

  it('should render 3 mosaic cells when group has 3 photos', () => {
    const cache = makeCache();
    const records = [makeRecord('a'), makeRecord('b'), makeRecord('c')];
    render(<GroupCard group={makeGroup()} records={records} cache={cache} />);
    expect(screen.getAllByTestId('mosaic-cell')).toHaveLength(3);
  });

  it('should render 4 mosaic cells when group has 4+ photos', () => {
    const cache = makeCache();
    const records = [makeRecord('a'), makeRecord('b'), makeRecord('c'), makeRecord('d'), makeRecord('e')];
    render(<GroupCard group={makeGroup()} records={records} cache={cache} />);
    expect(screen.getAllByTestId('mosaic-cell')).toHaveLength(4);
  });

  it('should call onSelect with groupId when card is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const cache = makeCache();
    render(
      <GroupCard group={makeGroup()} records={[makeRecord('a')]} cache={cache} onSelect={onSelect} />,
    );
    await user.click(screen.getByRole('article'));
    expect(onSelect).toHaveBeenCalledWith('g1');
  });

  it('should render the trash button with correct aria-label when onDelete is provided', () => {
    const cache = makeCache();
    render(
      <GroupCard
        group={makeGroup()}
        records={[makeRecord('a')]}
        cache={cache}
        onDelete={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Delete group "Eiffel Tower"' }),
    ).toBeInTheDocument();
  });

  it('should call onDelete(group) and NOT call onSelect when trash button is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    const group = makeGroup();
    const cache = makeCache();
    render(
      <GroupCard
        group={group}
        records={[makeRecord('a')]}
        cache={cache}
        onSelect={onSelect}
        onDelete={onDelete}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Delete group "Eiffel Tower"' }));
    expect(onDelete).toHaveBeenCalledWith(group);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('should still call onSelect when clicking the card body (not the trash button)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const cache = makeCache();
    render(
      <GroupCard
        group={makeGroup()}
        records={[makeRecord('a')]}
        cache={cache}
        onSelect={onSelect}
        onDelete={vi.fn()}
      />,
    );
    // Click the mosaic area (which doesn't have a role — click the article)
    await user.click(screen.getByText('Eiffel Tower'));
    expect(onSelect).toHaveBeenCalledWith('g1');
  });
});
