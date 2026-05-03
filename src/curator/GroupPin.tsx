import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import type { Group } from './groups';
import type { ThumbnailCache, FlatRecord } from './store';
import { GroupPinPopup } from './GroupPinPopup';

export type CreateGroupPinArgs = {
  group: Group;
  firstPhoto: FlatRecord | null;
  cache: ThumbnailCache;
  records: FlatRecord[];
  onViewInGroups: (groupId: string) => void;
};

export type GroupPinHandle = {
  marker: L.Marker;
  cleanup: () => void;
};

function buildIconHtml(state: 'loading' | 'success' | 'error' | 'empty', dataUrl?: string): string {
  const bgStyle = state === 'success' && dataUrl ? ` style="background-image: url('${dataUrl}')"` : '';
  return `<div class="muninn-pin" data-state="${state}"><div class="muninn-pin__head"${bgStyle}></div><svg class="muninn-pin__tail" width="12" height="18" viewBox="0 0 12 18" aria-hidden="true"><polygon points="0,0 12,0 6,18" /></svg></div>`;
}

function buildDivIcon(html: string): L.DivIcon {
  return L.divIcon({ html, className: '', iconSize: [60, 76], iconAnchor: [30, 76] });
}

export function createGroupPinMarker({ group, firstPhoto, cache, records, onViewInGroups }: CreateGroupPinArgs): GroupPinHandle {
  const marker = L.marker([group.lat, group.lng]);

  marker.bindTooltip(group.name, {
    direction: 'top',
    offset: [0, -92],
    opacity: 1,
    className: 'muninn-pin-tooltip',
  });

  // Popup setup
  const popupContainer = document.createElement('div');
  const popup = L.popup({
    closeButton: false,
    className: 'muninn-pin-popup',
    maxWidth: 360,
    offset: [0, -76] as L.PointExpression,
  }).setContent(popupContainer);
  marker.bindPopup(popup);

  let root: ReturnType<typeof createRoot> | null = null;

  function onPopupOpen() {
    root = createRoot(popupContainer);
    root.render(
      createElement(GroupPinPopup, {
        group,
        records,
        cache,
        onViewInGroups: () => onViewInGroups(group.id),
      }),
    );
  }

  function onPopupClose() {
    root?.unmount();
    root = null;
  }

  marker.on('popupopen', onPopupOpen);
  marker.on('popupclose', onPopupClose);

  if (!firstPhoto) {
    marker.setIcon(buildDivIcon(buildIconHtml('empty')));
    return {
      marker,
      cleanup: () => {
        marker.closePopup();
        root?.unmount();
        root = null;
        marker.off('popupopen', onPopupOpen);
        marker.off('popupclose', onPopupClose);
      },
    };
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

  return {
    marker,
    cleanup: () => {
      marker.closePopup();
      root?.unmount();
      root = null;
      marker.off('popupopen', onPopupOpen);
      marker.off('popupclose', onPopupClose);
      unsubscribe();
    },
  };
}
