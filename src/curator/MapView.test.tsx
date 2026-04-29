// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const mockFitBounds = vi.fn();
const mockInvalidateSize = vi.fn();

vi.mock('react-leaflet', () => ({
  MapContainer: ({
    center,
    zoom,
    children,
  }: {
    center: [number, number];
    zoom: number;
    children: React.ReactNode;
  }) => (
    <div
      data-testid="map-container"
      data-center={JSON.stringify(center)}
      data-zoom={String(zoom)}
    >
      {children}
    </div>
  ),
  TileLayer: ({ url, attribution }: { url: string; attribution: string }) => (
    <div data-testid="tile-layer" data-url={url} data-attribution={attribution} />
  ),
  useMap: () => ({ fitBounds: mockFitBounds, invalidateSize: mockInvalidateSize }),
}));

import { MapView } from './MapView';
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

beforeEach(() => {
  mockFitBounds.mockReset();
  mockInvalidateSize.mockReset();
});

describe('MapView', () => {
  it('should render the OSM tile layer with the OpenStreetMap URL', () => {
    render(<MapView groups={[]} isActive={false} />);
    const tileLayer = screen.getByTestId('tile-layer');
    expect(tileLayer.dataset.url).toContain('tile.openstreetmap.org');
  });

  it('should render OSM attribution on the tile layer', () => {
    render(<MapView groups={[]} isActive={false} />);
    const tileLayer = screen.getByTestId('tile-layer');
    expect(tileLayer.dataset.attribution).toContain('OpenStreetMap');
  });

  it('should render the empty-state overlay when no groups are passed', () => {
    render(<MapView groups={[]} isActive={false} />);
    expect(screen.getByText(/no groups yet/i)).toBeInTheDocument();
  });

  it('should not render the empty-state overlay when groups are passed', () => {
    render(<MapView groups={[makeGroup()]} isActive={true} />);
    expect(screen.queryByText(/no groups yet/i)).not.toBeInTheDocument();
  });

  it('should center the map at world default when groups is empty', () => {
    render(<MapView groups={[]} isActive={false} />);
    const container = screen.getByTestId('map-container');
    expect(JSON.parse(container.dataset.center!)).toEqual([20, 0]);
    expect(Number(container.dataset.zoom)).toBe(2);
  });

  it('should call fitBounds when groups is non-empty', async () => {
    const groups = [
      makeGroup({ id: 'g1', lat: 48.858, lng: 2.294 }),
      makeGroup({ id: 'g2', lat: 45.764, lng: 4.834 }),
    ];
    await act(async () => {
      render(<MapView groups={groups} isActive={true} />);
    });
    expect(mockFitBounds).toHaveBeenCalledOnce();
    expect(mockFitBounds).toHaveBeenCalledWith(
      expect.anything(),
      { padding: [40, 40], maxZoom: 14 },
    );
  });

  it('should not call fitBounds when groups is empty', async () => {
    await act(async () => {
      render(<MapView groups={[]} isActive={false} />);
    });
    expect(mockFitBounds).not.toHaveBeenCalled();
  });
});
