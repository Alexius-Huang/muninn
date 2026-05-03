import { useCallback, useEffect, useState } from 'react';
import { getCfAuth, setCfAuth, deleteCfAuth } from './cfAuth';
import type { CfAuth } from './cfAuth';
import { createD1Client } from './d1Client';
import { createR2Client } from './r2Client';

const DEFAULT_BUCKET = 'muninn-photos';

type PanelState = 'loading' | 'unconfigured' | 'ready';

type PingResult = { ok: true; detail: string } | { ok: false; error: string };

export function CfDebugPanel() {
  const [panelState, setPanelState] = useState<PanelState>('loading');
  const [auth, setAuth] = useState<CfAuth | null>(null);

  const [form, setForm] = useState({
    accountId: '',
    d1ApiToken: '',
    d1DatabaseId: '',
    r2AccessKeyId: '',
    r2SecretAccessKey: '',
    r2Bucket: DEFAULT_BUCKET,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [d1Result, setD1Result] = useState<PingResult | null>(null);
  const [r2Result, setR2Result] = useState<PingResult | null>(null);
  const [pinging, setPinging] = useState<'d1' | 'r2' | null>(null);

  const reload = useCallback(async () => {
    const stored = await getCfAuth();
    if (stored) {
      setAuth(stored);
      setPanelState('ready');
    } else {
      setAuth(null);
      setPanelState('unconfigured');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await setCfAuth(form);
      await reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await deleteCfAuth();
    setAuth(null);
    setPanelState('unconfigured');
    setD1Result(null);
    setR2Result(null);
  }

  async function handlePingD1() {
    if (!auth) return;
    setPinging('d1');
    setD1Result(null);
    try {
      const client = createD1Client(auth);
      const ts = Date.now().toString();
      const testId = `debug-${ts}`;
      await client.query(
        'INSERT OR REPLACE INTO groups (id, name, lat, lng, created_at) VALUES (?, ?, ?, ?, ?)',
        [testId, 'ping', 0, 0, new Date().toISOString()],
      );
      const rows = await client.query('SELECT * FROM groups WHERE id = ?', [testId]);
      setD1Result({ ok: true, detail: JSON.stringify(rows[0], null, 2) });
    } catch (err) {
      setD1Result({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setPinging(null);
    }
  }

  async function handlePingR2() {
    if (!auth) return;
    setPinging('r2');
    setR2Result(null);
    try {
      const client = createR2Client(auth);
      const key = `debug/ping-${Date.now()}.bin`;
      await client.putObject(key, new Blob(['\x00']));
      const blob = await client.getObject(key);
      const size = blob?.size ?? 0;
      setR2Result({ ok: true, detail: `OK · ${size} byte${size === 1 ? '' : 's'} (key: ${key})` });
    } catch (err) {
      setR2Result({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setPinging(null);
    }
  }

  if (panelState === 'loading') {
    return (
      <div className="h-full flex items-center justify-center bg-nord-0">
        <p className="text-nord-4 text-sm">Loading CF credentials…</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <h2 className="text-nord-5 text-sm font-semibold uppercase tracking-wide">Cloudflare Settings</h2>

        {panelState === 'unconfigured' && (
          <form onSubmit={(e) => { void handleSave(e); }} className="space-y-4">
            <p className="text-nord-4 text-sm">No CF credentials found. Enter them to connect.</p>

            {(
              [
                ['accountId', 'Account ID'],
                ['d1ApiToken', 'D1 API Token'],
                ['d1DatabaseId', 'D1 Database ID'],
                ['r2AccessKeyId', 'R2 Access Key ID'],
                ['r2SecretAccessKey', 'R2 Secret Access Key'],
                ['r2Bucket', 'R2 Bucket Name'],
              ] as [keyof typeof form, string][]
            ).map(([field, label]) => (
              <div key={field} className="space-y-1">
                <label className="text-nord-4 text-xs">{label}</label>
                <input
                  type={field.toLowerCase().includes('token') || field.toLowerCase().includes('secret') ? 'password' : 'text'}
                  value={form[field]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
                  className="w-full bg-nord-1 border border-nord-3 rounded px-3 py-1.5 text-nord-6 text-sm focus:outline-none focus:border-nord-8"
                  required
                  aria-label={label}
                />
              </div>
            ))}

            {saveError && (
              <p role="alert" className="text-red-400 text-sm">{saveError}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 bg-nord-8 text-white rounded text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save credentials'}
            </button>
          </form>
        )}

        {panelState === 'ready' && auth && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-nord-14 text-sm">✓ Credentials present</span>
              <span className="text-nord-4 text-xs">Account: {auth.accountId}</span>
              <button
                onClick={() => { void handleDelete(); }}
                className="ml-auto text-nord-11 text-xs underline"
              >
                Clear
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { void handlePingD1(); }}
                disabled={pinging !== null}
                className="px-4 py-1.5 bg-nord-9 text-white rounded text-sm disabled:opacity-50"
              >
                {pinging === 'd1' ? 'Pinging…' : 'Ping D1'}
              </button>
              <button
                onClick={() => { void handlePingR2(); }}
                disabled={pinging !== null}
                className="px-4 py-1.5 bg-nord-10 text-white rounded text-sm disabled:opacity-50"
              >
                {pinging === 'r2' ? 'Pinging…' : 'Ping R2'}
              </button>
            </div>

            {d1Result && (
              <div className="space-y-1">
                <p className="text-nord-4 text-xs">D1 result:</p>
                {d1Result.ok ? (
                  <pre className="bg-nord-1 rounded p-3 text-nord-6 text-xs overflow-auto">{d1Result.detail}</pre>
                ) : (
                  <p role="alert" className="text-red-400 text-sm">{d1Result.error}</p>
                )}
              </div>
            )}

            {r2Result && (
              <div className="space-y-1">
                <p className="text-nord-4 text-xs">R2 result:</p>
                {r2Result.ok ? (
                  <pre className="bg-nord-1 rounded p-3 text-nord-6 text-xs overflow-auto">{r2Result.detail}</pre>
                ) : (
                  <p role="alert" className="text-red-400 text-sm">{r2Result.error}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
