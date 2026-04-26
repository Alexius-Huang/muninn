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

const DEBOUNCE_MS = 400;
const THROTTLE_MS = 1000;

// User-Agent is a forbidden request header in browsers — identify via email param per Nominatim policy.
export async function searchNominatim(query: string, email: string): Promise<NominatimLocation[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=10&email=${encodeURIComponent(email)}`;
  const resp = await fetch(url);
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
  email: string;
  placeholder?: string;
};

export function NominatimSearch({ onSelect, email, placeholder = 'Search for a place…' }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimLocation[]>([]);
  const [status, setStatus] = useState<'idle' | 'pending' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);
  const reqIdRef = useRef<number>(0);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setStatus('idle');
      setErrorMsg(null);
      return;
    }

    setStatus('pending');

    const elapsed = Date.now() - lastFetchRef.current;
    const throttleDelay = Math.max(0, THROTTLE_MS - elapsed);
    const totalDelay = DEBOUNCE_MS + throttleDelay;
    const reqId = ++reqIdRef.current;

    const timerId = setTimeout(async () => {
      lastFetchRef.current = Date.now();
      setStatus('loading');
      setErrorMsg(null);

      try {
        const data = await searchNominatim(query, email);
        if (reqId !== reqIdRef.current) return;
        setResults(data);
        setStatus('idle');
      } catch (e) {
        if (reqId !== reqIdRef.current) return;
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
    <div className="relative flex flex-col gap-1">
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
        <ul className="absolute top-full left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded border border-zinc-700 bg-zinc-900 shadow-lg">
          {results.map((r) => (
            <li key={r.placeId}>
              <button
                type="button"
                onClick={() => handleSelect(r)}
                className="w-full min-w-0 px-3 py-2 text-left hover:bg-zinc-800 focus:bg-zinc-800 focus:outline-none"
              >
                <span className="block truncate text-sm font-medium text-zinc-100">{r.name}</span>
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
        <p role="alert" className="px-1 py-2 text-xs text-red-400">{errorMsg}</p>
      )}
    </div>
  );
}
