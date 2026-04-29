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
  return `<div class="muninn-pin" data-state="${state}"><div class="muninn-pin__head">${imgHtml}</div><svg class="muninn-pin__tail" width="12" height="18" viewBox="0 0 12 18" aria-hidden="true"><polygon points="0,0 12,0 6,18" /></svg></div>`;
}

function buildDivIcon(html: string): L.DivIcon {
  return L.divIcon({ html, className: '', iconSize: [45, 61], iconAnchor: [22, 61] });
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
