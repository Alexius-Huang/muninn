import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';

const pinIcon = L.divIcon({
  html: `<svg viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24C24 5.373 18.627 0 12 0z" fill="#bf616a"/>
    <circle cx="12" cy="12" r="4.5" fill="rgba(255,255,255,0.9)"/>
  </svg>`,
  className: '',
  iconSize: [24, 36],
  iconAnchor: [12, 36],
});

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
        className="muninn-map"
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
        />
        <Marker position={[lat, lng]} icon={pinIcon} />
      </MapContainer>
    </div>
  );
}
