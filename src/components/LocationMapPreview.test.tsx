// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ center, children }: { center: [number, number]; children: React.ReactNode }) => (
    <div data-testid="map-container" data-center={JSON.stringify(center)}>{children}</div>
  ),
  TileLayer: ({ attribution }: { attribution: string }) => (
    <div data-testid="tile-layer" data-attribution={attribution} />
  ),
  CircleMarker: ({ center }: { center: [number, number] }) => (
    <div data-testid="circle-marker" data-center={JSON.stringify(center)} />
  ),
}));

import { LocationMapPreview } from './LocationMapPreview';

const LAT = 48.858;
const LNG = 2.294;

describe('LocationMapPreview', () => {
  it('should show a placeholder when lat/lng are null', () => {
    render(<LocationMapPreview lat={null} lng={null} />);
    expect(screen.getByText(/select a location to preview on map/i)).toBeInTheDocument();
    expect(screen.queryByTestId('map-container')).not.toBeInTheDocument();
  });

  it('should render without throwing for valid coordinates', () => {
    expect(() => render(<LocationMapPreview lat={LAT} lng={LNG} />)).not.toThrow();
  });

  it('should center the map on the provided lat/lng', () => {
    render(<LocationMapPreview lat={LAT} lng={LNG} />);
    const container = screen.getByTestId('map-container');
    expect(JSON.parse(container.dataset.center!)).toEqual([LAT, LNG]);
  });

  it('should place the marker on the provided lat/lng', () => {
    render(<LocationMapPreview lat={LAT} lng={LNG} />);
    const marker = screen.getByTestId('circle-marker');
    expect(JSON.parse(marker.dataset.center!)).toEqual([LAT, LNG]);
  });
});
