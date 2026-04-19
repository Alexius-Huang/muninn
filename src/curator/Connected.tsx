import { useRef, useState } from 'react';
import type { DropboxAccount, DropboxEntry } from '../dropbox/client';
import { deleteDropboxToken } from '../auth/keychain';
import { FolderTree } from './FolderTree';
import { ThumbnailGrid, sortFiles } from './ThumbnailGrid';
import { PreviewPanel } from './PreviewPanel';
import { useThumbnailCache } from './useThumbnailCache';
import { useCurationState } from './useCurationState';

type Props = {
  account: DropboxAccount;
  token: string;
  onDisconnect: () => void;
};

type Active = { path: string; entries: DropboxEntry[] };

const MIN_SIDEBAR = 140;
const MAX_SIDEBAR = 600;

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <p className="text-nord-4 text-sm">Select a folder to see its photos</p>
    </div>
  );
}

export function Connected({ account, token, onDisconnect }: Props) {
  const [active, setActive] = useState<Active | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const cache = useThumbnailCache(token);
  const { flags, setFlag } = useCurationState(active?.path ?? null);

  const files = active ? sortFiles(active.entries) : [];

  async function handleDisconnect() {
    if (!window.confirm('Disconnect this Dropbox account? You will need to paste the token again to reconnect.')) return;
    await deleteDropboxToken();
    onDisconnect();
  }

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: sidebarWidth };

    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const next = dragRef.current.startWidth + ev.clientX - dragRef.current.startX;
      setSidebarWidth(Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, next)));
    }

    function onUp() {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleOpen(path: string, entries: DropboxEntry[]) {
    setActive({ path, entries });
    setSelectedIndex(null);
  }

  function handleNavigate(delta: -1 | 1) {
    if (selectedIndex === null) return;
    const next = selectedIndex + delta;
    if (next >= 0 && next < files.length) setSelectedIndex(next);
  }

  const selectedFile = selectedIndex !== null ? files[selectedIndex] : null;
  const placeholderDataUrl =
    selectedFile
      ? (() => {
          const s = cache.peek(selectedFile.path_lower);
          return s.tag === 'success' ? s.dataUrl : undefined;
        })()
      : undefined;

  return (
    <div className="h-full flex flex-col bg-nord-0">
      <header className="flex items-center justify-between px-6 py-3 bg-nord-1 border-b border-nord-3 shrink-0">
        <div>
          <span className="text-nord-6 font-medium text-sm">{account.name.display_name}</span>
          {account.email && (
            <span className="text-nord-4 text-sm ml-2">{account.email}</span>
          )}
        </div>
        <button
          onClick={handleDisconnect}
          className="px-4 py-1.5 rounded-lg bg-nord-3 text-nord-5 hover:bg-nord-2 transition-colors text-sm"
        >
          Disconnect
        </button>
      </header>

      <main className="flex-1 min-h-0 flex overflow-hidden">
        <aside
          style={{ width: sidebarWidth }}
          className="shrink-0 overflow-y-auto bg-nord-0"
        >
          <FolderTree
            token={token}
            activePath={active?.path ?? null}
            onOpen={handleOpen}
          />
        </aside>

        {/* drag handle */}
        <div
          onMouseDown={handleResizeStart}
          className="w-1 shrink-0 cursor-col-resize bg-nord-3 hover:bg-nord-8 transition-colors"
        />

        <section className="flex-1 min-w-0 flex overflow-hidden">
          {active === null ? (
            <EmptyState />
          ) : (
            <ThumbnailGrid
              key={active.path}
              path={active.path}
              entries={active.entries}
              cache={cache}
              flags={flags}
              onSelect={setSelectedIndex}
            />
          )}

          {selectedFile !== null && active !== null && (
            <PreviewPanel
              key={selectedFile.path_lower}
              file={selectedFile}
              index={selectedIndex!}
              total={files.length}
              flag={flags[selectedFile.path_lower]}
              placeholderDataUrl={placeholderDataUrl}
              token={token}
              onClose={() => setSelectedIndex(null)}
              onNavigate={handleNavigate}
              onFlag={(value) => setFlag(selectedFile.path_lower, value)}
            />
          )}
        </section>
      </main>
    </div>
  );
}
