import { useRef, useState } from 'react';
import type { DropboxAccount, DropboxEntry } from '../dropbox/client';
import { disconnect } from '../auth/dropboxAuth';
import { FolderTree } from './FolderTree';
import { ThumbnailGrid, sortFiles } from './ThumbnailGrid';
import { PreviewPanel } from './PreviewPanel';
import { FlaggedView } from './FlaggedView';
import { useThumbnailCache } from './useThumbnailCache';
import { useCurationState } from './useCurationState';

type Props = {
  account: DropboxAccount;
  onDisconnect: () => void;
};

type Active = { path: string; entries: DropboxEntry[] };

const MIN_SIDEBAR = 140;
const MAX_SIDEBAR = 600;
const MIN_PREVIEW = 280;
const MAX_PREVIEW = 900;

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <p className="text-nord-4 text-sm">Select a folder to see its photos</p>
    </div>
  );
}

export function Connected({ account, onDisconnect }: Props) {
  const [tab, setTab] = useState<'browse' | 'flagged'>('browse');
  const [active, setActive] = useState<Active | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [previewWidth, setPreviewWidth] = useState(480);
  const [isDraggingPreview, setIsDraggingPreview] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const previewDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const cache = useThumbnailCache();
  const files = active ? sortFiles(active.entries) : [];
  const { flags, setFlag, flush: flushBrowse } = useCurationState(active?.path ?? null, files);

  async function handleDisconnect() {
    if (!confirmingDisconnect) {
      setConfirmingDisconnect(true);
      return;
    }
    setConfirmingDisconnect(false);
    await disconnect();
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

  function handlePreviewResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    setIsDraggingPreview(true);
    previewDragRef.current = { startX: e.clientX, startWidth: previewWidth };

    function onMove(ev: MouseEvent) {
      if (!previewDragRef.current) return;
      const next = previewDragRef.current.startWidth - (ev.clientX - previewDragRef.current.startX);
      setPreviewWidth(Math.max(MIN_PREVIEW, Math.min(MAX_PREVIEW, next)));
    }

    function onUp() {
      previewDragRef.current = null;
      setIsDraggingPreview(false);
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
        <div className="flex gap-1">
          <button
            aria-pressed={tab === 'browse'}
            onClick={() => setTab('browse')}
            className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${tab === 'browse' ? 'bg-nord-2 text-nord-6' : 'text-nord-4 hover:bg-nord-1'}`}
          >
            Browse
          </button>
          <button
            aria-pressed={tab === 'flagged'}
            onClick={() => setTab('flagged')}
            className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${tab === 'flagged' ? 'bg-nord-2 text-nord-6' : 'text-nord-4 hover:bg-nord-1'}`}
          >
            Flagged
          </button>
        </div>
        {confirmingDisconnect ? (
          <div className="flex items-center gap-2">
            <span className="text-nord-4 text-sm">Disconnect?</span>
            <button
              onClick={handleDisconnect}
              className="px-3 py-1 rounded-lg bg-nord-11 text-white hover:bg-red-600 transition-colors text-sm"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmingDisconnect(false)}
              className="px-3 py-1 rounded-lg bg-nord-3 text-nord-5 hover:bg-nord-2 transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleDisconnect}
            className="px-4 py-1.5 rounded-lg bg-nord-3 text-nord-5 hover:bg-nord-2 transition-colors text-sm"
          >
            Disconnect
          </button>
        )}
      </header>

      <main className="flex-1 min-h-0 flex overflow-hidden">
        <div className={`flex-1 min-h-0 flex overflow-hidden ${tab !== 'browse' ? 'hidden' : ''}`}>
          <aside
            style={{ width: sidebarWidth }}
            className="shrink-0 overflow-y-auto bg-nord-0"
          >
            <FolderTree
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
            <div className="flex-1 min-w-0 flex flex-col">
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
            </div>

            {selectedFile !== null && active !== null && tab === 'browse' && (
              <>
                <div
                  onMouseDown={handlePreviewResizeStart}
                  className="w-1 shrink-0 cursor-col-resize bg-nord-3 hover:bg-nord-8 transition-colors"
                />
                <PreviewPanel
                  key={selectedFile.path_lower}
                  file={selectedFile}
                  index={selectedIndex!}
                  total={files.length}
                  flag={flags[selectedFile.id]}
                  placeholderDataUrl={placeholderDataUrl}
                  width={previewWidth}
                  isResizing={isDraggingPreview}
                  onClose={() => setSelectedIndex(null)}
                  onNavigate={handleNavigate}
                  onFlag={(value) => setFlag(selectedFile, value)}
                />
              </>
            )}
          </section>
        </div>

        {/* Keep FlaggedView mounted (not conditionally rendered) so useAllFlagged stays alive for the isActive edge trigger */}
        <div className={`flex-1 min-h-0 flex overflow-hidden ${tab !== 'flagged' ? 'hidden' : ''}`}>
          <FlaggedView
            isActive={tab === 'flagged'}
            cache={cache}
            previewWidth={previewWidth}
            isResizing={isDraggingPreview}
            onPreviewResize={handlePreviewResizeStart}
            onBeforeActivate={flushBrowse}
          />
        </div>
      </main>
    </div>
  );
}
