import L from 'leaflet';
import type { Group } from './groups';
import type { ThumbnailCache, FlatRecord } from './store';

export type CreateGroupPinArgs = {
  group: Group;
  firstPhoto: FlatRecord | null;
  cache: ThumbnailCache;
};

export type GroupPinHandle = {
  marker: L.Marker;
  cleanup: () => void;
};

function buildIconHtml(state: 'loading' | 'success' | 'error' | 'empty', dataUrl?: string): string {
  const imgHtml = state === 'success' && dataUrl ? `<img src="${dataUrl}" alt="" />` : '';
  return `<div class="muninn-pin" data-state="${state}"><svg class="muninn-pin__tail" viewBox="0 0 48 60" aria-hidden="true"><path d="M24 0C10.745 0 0 10.745 0 24c0 18 24 36 24 36s24-18 24-36C48 10.745 37.255 0 24 0z" /></svg><div class="muninn-pin__head">${imgHtml}</div></div>`;
}

function buildDivIcon(html: string): L.DivIcon {
  return L.divIcon({ html, className: '', iconSize: [48, 60], iconAnchor: [24, 60] });
}

export function createGroupPinMarker({ group, firstPhoto, cache }: CreateGroupPinArgs): GroupPinHandle {
  const marker = L.marker([group.lat, group.lng]);

  marker.bindTooltip(group.name, {
    direction: 'top',
    offset: [0, -36],
    opacity: 0.95,
    className: 'muninn-pin-tooltip',
  });

  if (!firstPhoto) {
    marker.setIcon(buildDivIcon(buildIconHtml('empty')));
    return { marker, cleanup: () => {} };
  }

  const { pathDisplay, pathLower } = firstPhoto.record;

  function refresh() {
    const state = cache.peek(pathLower);
    marker.setIcon(
      buildDivIcon(
        state.tag === 'success'
          ? buildIconHtml('success', state.dataUrl)
          : buildIconHtml(state.tag),
      ),
    );
  }

  cache.request(pathDisplay);
  refresh();
  const unsubscribe = cache.subscribe(pathLower, refresh);

  return { marker, cleanup: unsubscribe };
}
