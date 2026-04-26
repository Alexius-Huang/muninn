// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { NominatimSearch, type NominatimLocation } from './NominatimSearch';

const PARIS: NominatimLocation = {
  name: 'Paris',
  lat: 48.8566,
  lng: 2.3522,
  placeId: '7444',
  displayName: 'Paris, Île-de-France, France',
};

function makeNominatimResponse(locations: NominatimLocation[]) {
  return locations.map((l) => ({
    place_id: l.placeId,
    display_name: l.displayName,
    name: l.name,
    lat: String(l.lat),
    lon: String(l.lng),
  }));
}

function mockFetchSuccess(locations: NominatimLocation[]) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(makeNominatimResponse(locations)),
  } as unknown as Response);
}

function mockFetchError(status: number) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
  } as unknown as Response);
}

function mockFetchNetworkError() {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));
}

function typeInto(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('NominatimSearch', () => {
  it('renders a text input', () => {
    render(<NominatimSearch onSelect={vi.fn()} email="test@example.com" />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('does not call fetch on mount with empty input', () => {
    globalThis.fetch = vi.fn();
    render(<NominatimSearch onSelect={vi.fn()} email="test@example.com" />);
    act(() => { vi.runAllTimers(); });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([[''], [' '], ['   ']])(
    'does not fetch for whitespace-only query %j',
    (query) => {
      globalThis.fetch = vi.fn();
      render(<NominatimSearch onSelect={vi.fn()} email="test@example.com" />);
      if (query) typeInto(screen.getByRole('textbox'), query);
      act(() => { vi.runAllTimers(); });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('shows results after debounce fires', async () => {
    mockFetchSuccess([PARIS]);
    render(<NominatimSearch onSelect={vi.fn()} email="test@example.com" />);
    typeInto(screen.getByRole('textbox'), 'Paris');
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(screen.getByText('Paris')).toBeInTheDocument();
    expect(screen.getByText('Paris, Île-de-France, France')).toBeInTheDocument();
  });

  it('shows loading indicator while fetch is in-flight', async () => {
    let resolveJson!: (v: unknown) => void;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => new Promise((resolve) => { resolveJson = resolve; }),
    } as unknown as Response);

    render(<NominatimSearch onSelect={vi.fn()} email="test@example.com" />);
    typeInto(screen.getByRole('textbox'), 'Lyon');
    // Fire the debounce — setStatus('loading') is called synchronously before
    // the first await in the callback, so act flushes it.
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(screen.getByText('Searching…')).toBeInTheDocument();
    // Cleanup: let the component finish so it doesn't leak into the next test.
    await act(async () => { resolveJson([]); });
  });

  it('calls onSelect with correct shape and clears input on result click', async () => {
    mockFetchSuccess([PARIS]);
    const onSelect = vi.fn();
    render(<NominatimSearch onSelect={onSelect} email="test@example.com" />);
    typeInto(screen.getByRole('textbox'), 'Paris');
    await act(async () => { await vi.runAllTimersAsync(); });
    fireEvent.click(screen.getByRole('button', { name: /Paris/ }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith({
      name: 'Paris',
      lat: 48.8566,
      lng: 2.3522,
      placeId: '7444',
      displayName: 'Paris, Île-de-France, France',
    });
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.queryByRole('button', { name: /Paris/ })).not.toBeInTheDocument();
  });

  it('shows empty state when Nominatim returns no results', async () => {
    mockFetchSuccess([]);
    render(<NominatimSearch onSelect={vi.fn()} email="test@example.com" />);
    typeInto(screen.getByRole('textbox'), 'zzzzz');
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(screen.getByText('No results found.')).toBeInTheDocument();
  });

  it.each([
    ['network error', 'throw' as const, 0],
    ['HTTP 500', 'status' as const, 500],
    ['HTTP 429', 'status' as const, 429],
  ])('shows error state on %s', async (_label, mode, status) => {
    if (mode === 'throw') {
      mockFetchNetworkError();
    } else {
      mockFetchError(status);
    }
    render(<NominatimSearch onSelect={vi.fn()} email="test@example.com" />);
    typeInto(screen.getByRole('textbox'), 'Paris');
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
