import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { useAppStore } from './store';

function FitBounds({ groups }: { groups: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (groups.length === 0) return;
    const points: [number, number][] = groups.map((g) => [g.lat, g.lng]);
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 });
  }, [map, groups]);
  return null;
}

function ResizeOnWindow() {
  const map = useMap();
  useEffect(() => {
    const handler = () => map.invalidateSize();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [map]);
  return null;
}

export function MapView() {
  const groups = useAppStore((s) => s.groups);
  return (
    <div className="flex-1 min-h-0 relative">
      <MapContainer
        center={[20, 0]}
        zoom={4}
        minZoom={4}
        style={{ height: '100%', width: '100%' }}
        className="muninn-map"
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
        />
        <FitBounds groups={groups} />
        <ResizeOnWindow />
      </MapContainer>
      {groups.length === 0 && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[400]">
          <p className="pointer-events-auto bg-nord-1/90 text-nord-6 text-sm px-4 py-2 rounded border border-nord-3">
            No groups yet — create groups in the Flagged tab to see them on the map.
          </p>
        </div>
      )}
    </div>
  );
}
