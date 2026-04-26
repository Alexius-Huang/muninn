import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet';

type Props = {
  lat: number | null;
  lng: number | null;
  zoom?: number;
  className?: string;
};

export function LocationMapPreview({ lat, lng, zoom, className }: Props) {
  const containerClass = className ?? 'h-[300px] w-full rounded border border-nord-3 overflow-hidden';

  if (lat === null || lng === null) {
    return (
      <div className={`${containerClass} flex items-center justify-center bg-nord-0`}>
        <span className="text-sm text-nord-3">Select a location to preview on map</span>
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <MapContainer
        center={[lat, lng]}
        zoom={zoom ?? 14}
        zoomControl={false}
        attributionControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
        />
        <CircleMarker
          center={[lat, lng]}
          radius={7}
          pathOptions={{ color: '#bf616a', fillColor: '#bf616a', fillOpacity: 0.85, weight: 2 }}
        />
      </MapContainer>
    </div>
  );
}
