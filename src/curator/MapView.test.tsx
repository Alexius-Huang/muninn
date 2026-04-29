// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const mockFitBounds = vi.fn();
const mockInvalidateSize = vi.fn();
const mockAddLayer = vi.fn();
const mockRemoveLayer = vi.fn();

vi.mock('leaflet.markercluster', () => ({}));

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
});
