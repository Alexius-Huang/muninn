import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet';

type Props = {
  lat: number;
  lng: number;
  zoom?: number;
  className?: string;
};

export function LocationMapPreview({ lat, lng, zoom, className }: Props) {
  return (
    <div className={className ?? 'h-40 w-full rounded border border-nord-3 overflow-hidden'}>
      <MapContainer
        center={[lat, lng]}
        zoom={zoom ?? 14}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        touchZoom={false}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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
