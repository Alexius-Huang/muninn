import { useRef, useState } from 'react';
import type { DropboxAccount, DropboxEntry } from '../dropbox/client';
import { disconnect } from '../auth/dropboxAuth';
import { FolderTree } from './FolderTree';
import { ThumbnailGrid, sortFiles } from './ThumbnailGrid';
import { PreviewPanel } from './PreviewPanel';
import { FlaggedView } from './FlaggedView';
import { useThumbnailCache } from './useThumbnailCache';
import { useCurationState } from './useCurationState';
import { useAllFlagged } from './useAllFlagged';
import { wrapIndex, jumpRow } from './navigate';
import type { NavigateDirection } from './PreviewPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/shadcn/tabs';

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
  const [columns, setColumns] = useState(4);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [previewWidth, setPreviewWidth] = useState(480);
  const [isDraggingPreview, setIsDraggingPreview] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const previewDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const pendingTabRef = useRef<'browse' | 'flagged' | null>(null);

  const cache = useThumbnailCache();
  const files = active ? sortFiles(active.entries) : [];
  const { flags, setFlag, clearAll, flush: flushBrowse, reload: reloadBrowse } = useCurationState(active?.path ?? null, files);
  const { records: flaggedRecords, setFlag: setFlaggedFlag, clearAll: clearAllFlagged, flush: flushFlagged, reload: reloadFlagged, loading: flaggedLoading } = useAllFlagged();

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

  function handleNavigate(direction: NavigateDirection) {
    if (selectedIndex === null || files.length === 0) return;
    switch (direction) {
      case 'prev': setSelectedIndex(wrapIndex(selectedIndex, -1, files.length)); break;
      case 'next': setSelectedIndex(wrapIndex(selectedIndex, 1, files.length)); break;
      case 'up':   setSelectedIndex(jumpRow(selectedIndex, -1, files.length, columns)); break;
      case 'down': setSelectedIndex(jumpRow(selectedIndex, 1, files.length, columns)); break;
    }
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
    <Tabs
      value={tab}
      onValueChange={async (next) => {
        const target = next as 'browse' | 'flagged';
        if (target === tab || target === pendingTabRef.current) return;
        pendingTabRef.current = target;
        if (target === 'flagged') {
          await flushBrowse();
          await reloadFlagged();
        } else {
          await flushFlagged();
          await reloadBrowse();
        }
        pendingTabRef.current = null;
        setTab(target);
      }}
      className="h-full bg-nord-0 gap-0"
    >
      <header className="flex items-stretch justify-between px-6 h-12 bg-nord-1 border-b border-nord-3 shrink-0">
        <div className="flex items-center">
          <span className="text-nord-6 font-medium text-sm">{account.name.display_name}</span>
          {account.email && (
            <span className="text-nord-4 text-sm ml-2">{account.email}</span>
          )}
        </div>
        <TabsList className="h-full! bg-transparent! gap-1 p-0! rounded-none">
          <TabsTrigger
            value="browse"
            className="h-full! items-center! rounded-none border-0! border-b-2! border-transparent px-4 text-sm font-medium shadow-none! bg-transparent! text-nord-4! hover:text-nord-6! hover:bg-nord-2! focus-visible:ring-0! focus-visible:outline-hidden after:hidden data-[state=active]:border-nord-8! data-[state=active]:text-nord-6! data-[state=active]:bg-transparent! data-[state=active]:hover:bg-nord-2! transition-colors -mb-px"
          >
            Browse
          </TabsTrigger>
          <TabsTrigger
            value="flagged"
            className="h-full! items-center! rounded-none border-0! border-b-2! border-transparent px-4 text-sm font-medium shadow-none! bg-transparent! text-nord-4! hover:text-nord-6! hover:bg-nord-2! focus-visible:ring-0! focus-visible:outline-hidden after:hidden data-[state=active]:border-nord-8! data-[state=active]:text-nord-6! data-[state=active]:bg-transparent! data-[state=active]:hover:bg-nord-2! transition-colors -mb-px"
          >
            Flagged
          </TabsTrigger>
        </TabsList>
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
          <div className="flex items-center">
            <button
              onClick={handleDisconnect}
              className="px-4 py-1.5 rounded-lg bg-nord-3 text-nord-5 hover:bg-nord-2 transition-colors text-sm"
            >
              Disconnect
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 min-h-0 flex overflow-hidden">
        <TabsContent
          value="browse"
          forceMount
          className="flex-1 min-h-0 flex overflow-hidden data-[state=inactive]:hidden"
        >
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
                  activeIndex={selectedIndex}
                  onSelect={setSelectedIndex}
                  onClearAll={clearAll}
                  onColumnsChange={setColumns}
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
        </TabsContent>

        <TabsContent
          value="flagged"
          forceMount
          className="flex-1 min-h-0 flex overflow-hidden data-[state=inactive]:hidden"
        >
          <FlaggedView
            records={flaggedRecords}
            setFlag={setFlaggedFlag}
            clearAll={clearAllFlagged}
            loading={flaggedLoading}
            isActive={tab === 'flagged'}
            cache={cache}
            previewWidth={previewWidth}
            isResizing={isDraggingPreview}
            onPreviewResize={handlePreviewResizeStart}
          />
        </TabsContent>
      </main>
    </Tabs>
  );
}
