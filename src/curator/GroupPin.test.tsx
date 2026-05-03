// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Group } from './groups';
import type { CurationRecord } from './curation';
import type { FlatRecord, ThumbnailCache, ThumbnailState } from './store';

vi.mock('leaflet.markercluster', () => ({}));

const { mockCreateRoot, mockRootRender, mockRootUnmount } = vi.hoisted(() => {
  const mockRootUnmount = vi.fn();
  const mockRootRender = vi.fn();
  const mockRoot = { render: mockRootRender, unmount: mockRootUnmount };
  const mockCreateRoot = vi.fn(() => mockRoot);
  return { mockCreateRoot, mockRootRender, mockRootUnmount };
});

vi.mock('react-dom/client', () => ({
  createRoot: mockCreateRoot,
}));

vi.mock('./GroupPinPopup', () => ({
  GroupPinPopup: vi.fn(() => null),
}));

import L from 'leaflet';
import { createGroupPinMarker } from './GroupPin';

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'test-group-id',
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

type EventHandlerMap = Record<string, (...args: unknown[]) => void>;

let mockSetIcon: ReturnType<typeof vi.fn>;
let mockBindTooltip: ReturnType<typeof vi.fn>;
let mockBindPopup: ReturnType<typeof vi.fn>;
let mockClosePopup: ReturnType<typeof vi.fn>;
let mockOn: ReturnType<typeof vi.fn>;
let mockOff: ReturnType<typeof vi.fn>;
let mockPopupSetContent: ReturnType<typeof vi.fn>;

function makeDefaultArgs(overrides: Partial<Parameters<typeof createGroupPinMarker>[0]> = {}) {
  return {
    group: makeGroup(),
    firstPhoto: null,
    cache: makeCache(),
    records: [],
    onViewInGroups: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockSetIcon = vi.fn();
  mockBindTooltip = vi.fn().mockReturnThis();
  mockBindPopup = vi.fn().mockReturnThis();
  mockClosePopup = vi.fn();
  mockOn = vi.fn();
  mockOff = vi.fn();
  mockPopupSetContent = vi.fn().mockReturnThis();

  mockCreateRoot.mockClear();
  mockRootRender.mockClear();
  mockRootUnmount.mockClear();

  (L as unknown as Record<string, unknown>).marker = vi.fn(() => ({
    setIcon: mockSetIcon,
    bindTooltip: mockBindTooltip,
    bindPopup: mockBindPopup,
    closePopup: mockClosePopup,
    on: mockOn,
    off: mockOff,
  }));
  (L as unknown as Record<string, unknown>).divIcon = vi.fn((args: unknown) => args);
  (L as unknown as Record<string, unknown>).popup = vi.fn(() => ({
    setContent: mockPopupSetContent,
  }));
});

describe('createGroupPinMarker', () => {
  it('should create a marker at the group\'s lat/lng', () => {
    const group = makeGroup({ lat: 51.5, lng: -0.1 });
    createGroupPinMarker(makeDefaultArgs({ group }));
    expect(L.marker).toHaveBeenCalledWith([51.5, -0.1]);
  });

  it('should use a divIcon with empty className (no leaflet-div-icon defaults)', () => {
    createGroupPinMarker(makeDefaultArgs());
    expect(L.divIcon).toHaveBeenCalledWith(expect.objectContaining({ className: '' }));
  });

  it('should include a triangle SVG in the icon HTML', () => {
    createGroupPinMarker(makeDefaultArgs());
    const call = (L.divIcon as ReturnType<typeof vi.fn>).mock.calls[0][0] as { html: string };
    expect(call.html).toContain('muninn-pin__tail');
    expect(call.html).toContain('<polygon');
  });

  it('should set data-state="empty" when firstPhoto is null', () => {
    createGroupPinMarker(makeDefaultArgs());
    const call = (L.divIcon as ReturnType<typeof vi.fn>).mock.calls[0][0] as { html: string };
    expect(call.html).toContain('data-state="empty"');
  });

  it('should set data-state="loading" when firstPhoto is provided but cache is empty', () => {
    const cache = makeCache({ peek: vi.fn((): ThumbnailState => ({ tag: 'loading' })) });
    createGroupPinMarker(makeDefaultArgs({ firstPhoto: makeFlatRecord(), cache }));
    const calls = (L.divIcon as ReturnType<typeof vi.fn>).mock.calls;
    const lastHtml = (calls[calls.length - 1][0] as { html: string }).html;
    expect(lastHtml).toContain('data-state="loading"');
    expect(lastHtml).not.toContain('background-image');
  });

  it('should request the first photo\'s pathDisplay from the cache on creation', () => {
    const photo = makeFlatRecord({ pathDisplay: '/Photos/sunset.jpg' });
    const cache = makeCache();
    createGroupPinMarker(makeDefaultArgs({ firstPhoto: photo, cache }));
    expect(cache.request).toHaveBeenCalledWith('/Photos/sunset.jpg');
  });

  it('should subscribe to the first photo\'s pathLower on the cache', () => {
    const photo = makeFlatRecord({ pathDisplay: '/Photos/Sunset.JPG', pathLower: '/photos/sunset.jpg' });
    const cache = makeCache();
    createGroupPinMarker(makeDefaultArgs({ firstPhoto: photo, cache }));
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
    createGroupPinMarker(makeDefaultArgs({ firstPhoto: makeFlatRecord(), cache }));
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
    createGroupPinMarker(makeDefaultArgs({ firstPhoto: makeFlatRecord(), cache }));
    notifyFn();
    const lastSetIconArg = mockSetIcon.mock.calls.slice(-1)[0][0] as { html: string };
    expect(lastSetIconArg.html).toContain('data-state="error"');
    expect(lastSetIconArg.html).not.toContain('background-image');
  });

  it('should bind a tooltip with the group name, top direction, muninn-pin-tooltip className', () => {
    const group = makeGroup({ name: 'Paris 2024' });
    createGroupPinMarker(makeDefaultArgs({ group }));
    expect(mockBindTooltip).toHaveBeenCalledWith(
      'Paris 2024',
      { direction: 'top', offset: [0, -92], opacity: 1, className: 'muninn-pin-tooltip' },
    );
  });

  it('should return a cleanup that unsubscribes from the cache', () => {
    const unsubscribe = vi.fn();
    const cache = makeCache({ subscribe: vi.fn(() => unsubscribe) });
    const { cleanup } = createGroupPinMarker(makeDefaultArgs({ firstPhoto: makeFlatRecord(), cache }));
    cleanup();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('should return a cleanup that does not throw when firstPhoto is null', () => {
    const { cleanup } = createGroupPinMarker(makeDefaultArgs());
    expect(() => cleanup()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Popup binding
  // -------------------------------------------------------------------------

  it('should call L.popup and bind the popup to the marker', () => {
    createGroupPinMarker(makeDefaultArgs());
    expect(L.popup).toHaveBeenCalled();
    expect(mockBindPopup).toHaveBeenCalled();
  });

  it('should register popupopen and popupclose event handlers on the marker', () => {
    createGroupPinMarker(makeDefaultArgs());
    const onCalls = (mockOn as ReturnType<typeof vi.fn>).mock.calls.map(([event]) => event as string);
    expect(onCalls).toContain('popupopen');
    expect(onCalls).toContain('popupclose');
  });

  it('should call createRoot and render GroupPinPopup when popupopen fires', () => {
    const eventHandlers: EventHandlerMap = {};
    mockOn.mockImplementation((event: string, cb: () => void) => { eventHandlers[event] = cb; });

    createGroupPinMarker(makeDefaultArgs({ group: makeGroup({ id: 'g42' }) }));
    eventHandlers['popupopen']?.();

    expect(mockCreateRoot).toHaveBeenCalledOnce();
    expect(mockRootRender).toHaveBeenCalledOnce();
  });

  it('should call root.unmount when popupclose fires', () => {
    const eventHandlers: EventHandlerMap = {};
    mockOn.mockImplementation((event: string, cb: () => void) => { eventHandlers[event] = cb; });

    createGroupPinMarker(makeDefaultArgs());
    eventHandlers['popupopen']?.();
    eventHandlers['popupclose']?.();

    expect(mockRootUnmount).toHaveBeenCalledOnce();
  });

  it('should invoke onViewInGroups with the group id when the popup render call includes the callback', () => {
    const eventHandlers: EventHandlerMap = {};
    mockOn.mockImplementation((event: string, cb: () => void) => { eventHandlers[event] = cb; });
    const onViewInGroups = vi.fn();
    const group = makeGroup({ id: 'g-popup' });

    createGroupPinMarker(makeDefaultArgs({ group, onViewInGroups }));
    eventHandlers['popupopen']?.();

    // Extract the React element passed to root.render and invoke onViewInGroups
    const rendered = mockRootRender.mock.calls[0][0] as { props: { onViewInGroups: () => void } };
    rendered.props.onViewInGroups();

    expect(onViewInGroups).toHaveBeenCalledWith('g-popup');
  });

  it('should close the popup and unmount the root on cleanup', () => {
    const eventHandlers: EventHandlerMap = {};
    mockOn.mockImplementation((event: string, cb: () => void) => { eventHandlers[event] = cb; });

    const { cleanup } = createGroupPinMarker(makeDefaultArgs());
    // Open the popup first so root is created
    eventHandlers['popupopen']?.();
    cleanup();

    expect(mockClosePopup).toHaveBeenCalledOnce();
    expect(mockRootUnmount).toHaveBeenCalledOnce();
  });

  it('should remove popupopen and popupclose event listeners on cleanup', () => {
    const eventHandlers: EventHandlerMap = {};
    mockOn.mockImplementation((event: string, cb: () => void) => { eventHandlers[event] = cb; });

    const { cleanup } = createGroupPinMarker(makeDefaultArgs());
    cleanup();

    const offCalls = (mockOff as ReturnType<typeof vi.fn>).mock.calls.map(([event]) => event as string);
    expect(offCalls).toContain('popupopen');
    expect(offCalls).toContain('popupclose');
  });
});
