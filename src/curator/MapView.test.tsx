// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const mockFitBounds = vi.fn();
const mockInvalidateSize = vi.fn();
const mockAddLayer = vi.fn();
const mockRemoveLayer = vi.fn();

vi.mock('leaflet.markercluster', () => ({}));

const { mockCreateGroupPinMarker, mockPinCleanup } = vi.hoisted(() => {
  const mockPinCleanup = vi.fn();
  const mockPinMarker = {
    setIcon: vi.fn(),
    bindTooltip: vi.fn().mockReturnThis(),
  };
  const mockCreateGroupPinMarker = vi.fn(() => ({ marker: mockPinMarker, cleanup: mockPinCleanup }));
  return { mockCreateGroupPinMarker, mockPinCleanup, mockPinMarker };
});

vi.mock('./GroupPin', () => ({ createGroupPinMarker: mockCreateGroupPinMarker }));

vi.mock('react-leaflet', () => ({
  MapContainer: ({
    center,
    zoom,
    attributionControl,
    children,
  }: {
    center: [number, number];
    zoom: number;
    attributionControl?: boolean;
    children: React.ReactNode;
  }) => (
    <div
      data-testid="map-container"
      data-center={JSON.stringify(center)}
      data-zoom={String(zoom)}
      data-attribution-control={String(attributionControl)}
    >
      {children}
    </div>
  ),
  TileLayer: ({ url, attribution }: { url: string; attribution: string }) => (
    <div data-testid="tile-layer" data-url={url} data-attribution={attribution} />
  ),
  useMap: () => ({
    fitBounds: mockFitBounds,
    invalidateSize: mockInvalidateSize,
    addLayer: mockAddLayer,
    removeLayer: mockRemoveLayer,
  }),
}));

import L from 'leaflet';
import { MapView } from './MapView';
import { useAppStore, _resetStoreForTesting } from './store';
import type { Group } from './groups';
import type { FlatRecord } from './store';

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: crypto.randomUUID(),
    name: 'Test Group',
    lat: 48.858,
    lng: 2.294,
    photoIds: [],
    ...overrides,
  };
}

let mockCluster: { addLayer: ReturnType<typeof vi.fn> };

beforeEach(() => {
  mockFitBounds.mockReset();
  mockInvalidateSize.mockReset();
  mockAddLayer.mockReset();
  mockRemoveLayer.mockReset();
  mockCluster = { addLayer: vi.fn() };
  (L as unknown as Record<string, unknown>).markerClusterGroup = vi.fn(() => mockCluster);
  mockCreateGroupPinMarker.mockClear();
  mockPinCleanup.mockClear();
  _resetStoreForTesting();
});

describe('MapView', () => {
  it('should render the dark CartoCDN tile layer', () => {
    render(<MapView />);
    const tileLayer = screen.getByTestId('tile-layer');
    expect(tileLayer.dataset.url).toContain('cartocdn.com/dark_all');
  });

  it('should disable the attribution control on the map container', () => {
    render(<MapView />);
    const container = screen.getByTestId('map-container');
    expect(container.dataset.attributionControl).toBe('false');
  });

  it('should render the empty-state overlay when no groups are in the store', () => {
    render(<MapView />);
    expect(screen.getByText(/no groups yet/i)).toBeInTheDocument();
  });

  it('should not render the empty-state overlay when groups are in the store', () => {
    useAppStore.setState({ groups: [makeGroup()] });
    render(<MapView />);
    expect(screen.queryByText(/no groups yet/i)).not.toBeInTheDocument();
  });

  it('should center the map at world default when groups is empty', () => {
    render(<MapView />);
    const container = screen.getByTestId('map-container');
    expect(JSON.parse(container.dataset.center!)).toEqual([20, 0]);
    expect(Number(container.dataset.zoom)).toBe(4);
  });

  it('should call fitBounds when groups is non-empty', async () => {
    const groups = [
      makeGroup({ id: 'g1', lat: 48.858, lng: 2.294 }),
      makeGroup({ id: 'g2', lat: 45.764, lng: 4.834 }),
    ];
    useAppStore.setState({ groups });
    await act(async () => {
      render(<MapView />);
    });
    expect(mockFitBounds).toHaveBeenCalledOnce();
    expect(mockFitBounds).toHaveBeenCalledWith(
      expect.anything(),
      { padding: [40, 40], maxZoom: 14 },
    );
  });

  it('should not call fitBounds when groups is empty', async () => {
    await act(async () => {
      render(<MapView />);
    });
    expect(mockFitBounds).not.toHaveBeenCalled();
  });

  it('should render updated groups after a store mutation (empty → non-empty)', async () => {
    render(<MapView />);
    expect(screen.getByText(/no groups yet/i)).toBeInTheDocument();

    await act(async () => {
      useAppStore.setState({ groups: [makeGroup()] });
    });

    expect(screen.queryByText(/no groups yet/i)).not.toBeInTheDocument();
  });

  it('should call map.addLayer with the cluster group when groups are non-empty', async () => {
    useAppStore.setState({ groups: [makeGroup()] });
    await act(async () => { render(<MapView />); });
    expect(mockAddLayer).toHaveBeenCalledWith(mockCluster);
  });

  it('should call map.removeLayer on unmount', async () => {
    useAppStore.setState({ groups: [makeGroup()] });
    let unmount!: () => void;
    await act(async () => { ({ unmount } = render(<MapView />)); });
    await act(async () => { unmount(); });
    expect(mockRemoveLayer).toHaveBeenCalledWith(mockCluster);
  });

  it.each([
    [0],
    [1],
    [3],
    [5],
  ])('should add %i marker(s) to the cluster group', async (count) => {
    const groups = Array.from({ length: count }, (_, i) =>
      makeGroup({ id: String(i), lat: 48 + i, lng: 2 + i }),
    );
    useAppStore.setState({ groups });
    await act(async () => { render(<MapView />); });
    expect(mockCluster.addLayer).toHaveBeenCalledTimes(count);
  });

  it('should recreate the cluster layer when groups change', async () => {
    useAppStore.setState({ groups: [makeGroup({ id: 'g1' })] });
    await act(async () => { render(<MapView />); });
    expect(mockAddLayer).toHaveBeenCalledTimes(1);

    const newCluster = { addLayer: vi.fn() };
    (L as unknown as Record<string, unknown>).markerClusterGroup = vi.fn(() => newCluster);

    await act(async () => {
      useAppStore.setState({ groups: [makeGroup({ id: 'g2' }), makeGroup({ id: 'g3' })] });
    });

    expect(mockRemoveLayer).toHaveBeenCalledWith(mockCluster);
    expect(mockAddLayer).toHaveBeenCalledWith(newCluster);
  });

  it('should call createGroupPinMarker once per group, passing group, firstPhoto, records, cache, and onViewInGroups', async () => {
    const groups = [makeGroup({ id: 'g1' }), makeGroup({ id: 'g2' })];
    useAppStore.setState({ groups });
    const { cache } = useAppStore.getState();
    await act(async () => { render(<MapView />); });
    expect(mockCreateGroupPinMarker).toHaveBeenCalledTimes(groups.length);
    for (const group of groups) {
      expect(mockCreateGroupPinMarker).toHaveBeenCalledWith(
        expect.objectContaining({ group, firstPhoto: null, cache, records: [], onViewInGroups: expect.any(Function) }),
      );
    }
  });

  it('should pass null as firstPhoto and empty records when recordsByGroupId has no entry for a group', async () => {
    const group = makeGroup({ id: 'g1' });
    useAppStore.setState({ groups: [group], recordsByGroupId: new Map() });
    await act(async () => { render(<MapView />); });
    expect(mockCreateGroupPinMarker).toHaveBeenCalledWith(
      expect.objectContaining({ firstPhoto: null, records: [] }),
    );
  });

  it('should pass the first FlatRecord as firstPhoto and full records array when records exist', async () => {
    const group = makeGroup({ id: 'g1' });
    const photo: FlatRecord = {
      folderPath: '/Photos',
      key: 'id:abc',
      record: { pathLower: '/photos/a.jpg', pathDisplay: '/Photos/a.jpg', name: 'a.jpg' },
    };
    const extra: FlatRecord = {
      folderPath: '/Photos',
      key: 'id:xyz',
      record: { pathLower: '/photos/b.jpg', pathDisplay: '/Photos/b.jpg', name: 'b.jpg' },
    };
    useAppStore.setState({
      groups: [group],
      recordsByGroupId: new Map([['g1', [photo, extra]]]),
    });
    await act(async () => { render(<MapView />); });
    expect(mockCreateGroupPinMarker).toHaveBeenCalledWith(
      expect.objectContaining({ firstPhoto: photo, records: [photo, extra] }),
    );
  });

  it('should pass viewGroupDetail from the store as the onViewInGroups callback', async () => {
    const viewGroupDetailSpy = vi.fn();
    const group = makeGroup({ id: 'g1' });
    useAppStore.setState({ groups: [group], viewGroupDetail: viewGroupDetailSpy });
    await act(async () => { render(<MapView />); });
    const call = mockCreateGroupPinMarker.mock.calls[0][0] as { onViewInGroups: (id: string) => void };
    call.onViewInGroups('g1');
    expect(viewGroupDetailSpy).toHaveBeenCalledWith('g1');
  });

  it('should add each created marker to the cluster group', async () => {
    const groups = [makeGroup({ id: 'g1' }), makeGroup({ id: 'g2' })];
    useAppStore.setState({ groups });
    await act(async () => { render(<MapView />); });
    expect(mockCluster.addLayer).toHaveBeenCalledTimes(groups.length);
    for (const result of mockCreateGroupPinMarker.mock.results) {
      expect(mockCluster.addLayer).toHaveBeenCalledWith(
        (result as { value: { marker: unknown } }).value.marker,
      );
    }
  });

  it('should run all per-pin cleanups when groups change', async () => {
    useAppStore.setState({ groups: [makeGroup({ id: 'g1' }), makeGroup({ id: 'g2' })] });
    await act(async () => { render(<MapView />); });
    expect(mockPinCleanup).not.toHaveBeenCalled();

    await act(async () => {
      useAppStore.setState({ groups: [makeGroup({ id: 'g3' })] });
    });

    expect(mockPinCleanup).toHaveBeenCalledTimes(2);
  });

  it('should run all per-pin cleanups on unmount', async () => {
    useAppStore.setState({ groups: [makeGroup(), makeGroup()] });
    let unmount!: () => void;
    await act(async () => { ({ unmount } = render(<MapView />)); });
    expect(mockPinCleanup).not.toHaveBeenCalled();
    await act(async () => { unmount(); });
    expect(mockPinCleanup).toHaveBeenCalledTimes(2);
  });
});
