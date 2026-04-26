import { useEffect, useRef, useState } from 'react';

export type NominatimLocation = {
  name: string;
  lat: number;
  lng: number;
  placeId: string;
  displayName: string;
};

type NominatimApiResult = {
  place_id: string;
  display_name: string;
  name: string;
  lat: string;
  lon: string;
};

export async function searchNominatim(query: string): Promise<NominatimLocation[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=10`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Muninn/1.0' },
  });
  if (!resp.ok) {
    throw new Error(`Nominatim returned ${resp.status}`);
  }
  const data = (await resp.json()) as NominatimApiResult[];
  return data.map((r) => ({
    name: r.name || r.display_name.split(',')[0].trim(),
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    placeId: String(r.place_id),
    displayName: r.display_name,
  }));
}

type Props = {
  onSelect: (location: NominatimLocation) => void;
  placeholder?: string;
};

export function NominatimSearch({ onSelect, placeholder = 'Search for a place…' }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimLocation[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setStatus('idle');
      setErrorMsg(null);
      return;
    }

    const elapsed = Date.now() - lastFetchRef.current;
    const throttleDelay = Math.max(0, 1000 - elapsed);
    const totalDelay = 400 + throttleDelay;

    const timerId = setTimeout(async () => {
      lastFetchRef.current = Date.now();
      setStatus('loading');
      setErrorMsg(null);

      try {
        const data = await searchNominatim(query);
        setResults(data);
        setStatus('idle');
      } catch (e) {
        setErrorMsg((e as Error).message ?? 'Search failed');
        setStatus('error');
      }
    }, totalDelay);

    return () => clearTimeout(timerId);
  }, [query]);

  function handleSelect(location: NominatimLocation) {
    onSelect(location);
    setResults([]);
    setQuery('');
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
      />

      {status === 'loading' && (
        <p className="px-1 py-2 text-xs text-zinc-400">Searching…</p>
      )}

      {status === 'idle' && results.length > 0 && (
        <ul className="rounded border border-zinc-700 bg-zinc-900">
          {results.map((r) => (
            <li key={r.placeId}>
              <button
                type="button"
                onClick={() => handleSelect(r)}
                className="w-full px-3 py-2 text-left hover:bg-zinc-800 focus:bg-zinc-800 focus:outline-none"
              >
                <span className="block text-sm font-medium text-zinc-100">{r.name}</span>
                <span className="block truncate text-xs text-zinc-400">{r.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {status === 'idle' && results.length === 0 && query.trim() && (
        <p className="px-1 py-2 text-xs text-zinc-400">No results found.</p>
      )}

      {status === 'error' && (
        <p className="px-1 py-2 text-xs text-red-400">{errorMsg}</p>
      )}
    </div>
  );
}
