// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Group } from './groups';
import type { CurationRecord } from './curation';
import type { FlatRecord, ThumbnailCache, ThumbnailState } from './store';

vi.mock('leaflet.markercluster', () => ({}));

import L from 'leaflet';
import { createGroupPinMarker } from './GroupPin';

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

function makeFlatRecord(overrides: Partial<CurationRecord> = {}): FlatRecord {
  const pathDisplay = '/Photos/test.jpg';
  return {
    folderPath: '/Photos',
    key: 'id:abc123',
    record: {
      pathLower: pathDisplay.toLowerCase(),
      pathDisplay,
      name: 'test.jpg',
      ...overrides,
    },
  };
}

function makeCache(overrides: Partial<ThumbnailCache> = {}): ThumbnailCache {
  return {
    request: vi.fn(),
    peek: vi.fn((): ThumbnailState => ({ tag: 'loading' })),
    subscribe: vi.fn(() => vi.fn()),
    retry: vi.fn(),
    ...overrides,
  };
}

let mockSetIcon: ReturnType<typeof vi.fn>;
let mockBindTooltip: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockSetIcon = vi.fn();
  mockBindTooltip = vi.fn().mockReturnThis();
  (L as unknown as Record<string, unknown>).marker = vi.fn(() => ({
    setIcon: mockSetIcon,
    bindTooltip: mockBindTooltip,
  }));
  (L as unknown as Record<string, unknown>).divIcon = vi.fn((args: unknown) => args);
});

describe('createGroupPinMarker', () => {
  it('should create a marker at the group\'s lat/lng', () => {
    const group = makeGroup({ lat: 51.5, lng: -0.1 });
    createGroupPinMarker({ group, firstPhoto: null, cache: makeCache() });
    expect(L.marker).toHaveBeenCalledWith([51.5, -0.1]);
  });

  it('should use a divIcon with empty className (no leaflet-div-icon defaults)', () => {
    createGroupPinMarker({ group: makeGroup(), firstPhoto: null, cache: makeCache() });
    expect(L.divIcon).toHaveBeenCalledWith(expect.objectContaining({ className: '' }));
  });

  it('should include a triangle SVG in the icon HTML', () => {
    createGroupPinMarker({ group: makeGroup(), firstPhoto: null, cache: makeCache() });
    const call = (L.divIcon as ReturnType<typeof vi.fn>).mock.calls[0][0] as { html: string };
    expect(call.html).toContain('muninn-pin__tail');
    expect(call.html).toContain('<polygon');
  });

  it('should set data-state="empty" when firstPhoto is null', () => {
    createGroupPinMarker({ group: makeGroup(), firstPhoto: null, cache: makeCache() });
    const call = (L.divIcon as ReturnType<typeof vi.fn>).mock.calls[0][0] as { html: string };
    expect(call.html).toContain('data-state="empty"');
  });

  it('should set data-state="loading" when firstPhoto is provided but cache is empty', () => {
    const cache = makeCache({ peek: vi.fn((): ThumbnailState => ({ tag: 'loading' })) });
    createGroupPinMarker({ group: makeGroup(), firstPhoto: makeFlatRecord(), cache });
    const calls = (L.divIcon as ReturnType<typeof vi.fn>).mock.calls;
    const lastHtml = (calls[calls.length - 1][0] as { html: string }).html;
    expect(lastHtml).toContain('data-state="loading"');
    expect(lastHtml).not.toContain('background-image');
  });

  it('should request the first photo\'s pathDisplay from the cache on creation', () => {
    const photo = makeFlatRecord({ pathDisplay: '/Photos/sunset.jpg' });
    const cache = makeCache();
    createGroupPinMarker({ group: makeGroup(), firstPhoto: photo, cache });
    expect(cache.request).toHaveBeenCalledWith('/Photos/sunset.jpg');
  });

  it('should subscribe to the first photo\'s pathLower on the cache', () => {
    const photo = makeFlatRecord({ pathDisplay: '/Photos/Sunset.JPG', pathLower: '/photos/sunset.jpg' });
    const cache = makeCache();
    createGroupPinMarker({ group: makeGroup(), firstPhoto: photo, cache });
    expect(cache.subscribe).toHaveBeenCalledWith('/photos/sunset.jpg', expect.any(Function));
  });

  it('should re-render the icon with background-image style when the cache notifies success', () => {
    let notifyFn!: () => void;
    const cache = makeCache({
      subscribe: vi.fn((_: string, cb: () => void) => { notifyFn = cb; return vi.fn(); }),
      peek: vi.fn()
        .mockReturnValueOnce({ tag: 'loading' } satisfies ThumbnailState)
        .mockReturnValueOnce({ tag: 'success', dataUrl: 'data:image/jpeg;base64,abc' } satisfies ThumbnailState),
    });
    createGroupPinMarker({ group: makeGroup(), firstPhoto: makeFlatRecord(), cache });
    notifyFn();
    const lastSetIconArg = mockSetIcon.mock.calls.slice(-1)[0][0] as { html: string };
    expect(lastSetIconArg.html).toContain('data-state="success"');
    expect(lastSetIconArg.html).toContain("background-image: url('data:image/jpeg;base64,abc')");
  });

  it('should re-render the icon with data-state="error" when the cache resolves to error', () => {
    let notifyFn!: () => void;
    const cache = makeCache({
      subscribe: vi.fn((_: string, cb: () => void) => { notifyFn = cb; return vi.fn(); }),
      peek: vi.fn()
        .mockReturnValueOnce({ tag: 'loading' } satisfies ThumbnailState)
        .mockReturnValueOnce({ tag: 'error' } satisfies ThumbnailState),
    });
    createGroupPinMarker({ group: makeGroup(), firstPhoto: makeFlatRecord(), cache });
    notifyFn();
    const lastSetIconArg = mockSetIcon.mock.calls.slice(-1)[0][0] as { html: string };
    expect(lastSetIconArg.html).toContain('data-state="error"');
    expect(lastSetIconArg.html).not.toContain('background-image');
  });

  it('should bind a tooltip with the group name, top direction, muninn-pin-tooltip className', () => {
    const group = makeGroup({ name: 'Paris 2024' });
    createGroupPinMarker({ group, firstPhoto: null, cache: makeCache() });
    expect(mockBindTooltip).toHaveBeenCalledWith(
      'Paris 2024',
      { direction: 'top', offset: [0, -92], opacity: 1, className: 'muninn-pin-tooltip' },
    );
  });

  it('should return a cleanup that unsubscribes from the cache', () => {
    const unsubscribe = vi.fn();
    const cache = makeCache({ subscribe: vi.fn(() => unsubscribe) });
    const { cleanup } = createGroupPinMarker({ group: makeGroup(), firstPhoto: makeFlatRecord(), cache });
    cleanup();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('should return a cleanup that is a no-op when firstPhoto is null', () => {
    const { cleanup } = createGroupPinMarker({ group: makeGroup(), firstPhoto: null, cache: makeCache() });
    expect(() => cleanup()).not.toThrow();
  });
});
