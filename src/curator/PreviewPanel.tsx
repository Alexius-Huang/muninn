import { useEffect, useRef, useState } from 'react';
import { X, CheckCircle, XCircle, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import type { DropboxFile } from '../dropbox/client';
import { getPreview } from '../dropbox/client';
import type { Flag } from './curation';

type PreviewState =
  | { tag: 'loading' }
  | { tag: 'success'; dataUrl: string }
  | { tag: 'error' };

export type NavigateDirection = 'prev' | 'next' | 'up' | 'down';

export type GroupInfo = {
  name: string;
  locationName?: string;
};

type Props = {
  file: DropboxFile;
  index: number;
  total: number;
  flag: Flag | undefined;
  groupInfo?: GroupInfo;
  placeholderDataUrl: string | undefined;
  width: number;
  isResizing?: boolean;
  onClose: () => void;
  onNavigate: (direction: NavigateDirection) => void;
  onFlag: (value: Flag | undefined) => void;
  onRemoveFromGroup?: () => void;
};

export function PreviewPanel({
  file,
  index,
  total,
  flag,
  groupInfo,
  placeholderDataUrl,
  width,
  isResizing = false,
  onClose,
  onNavigate,
  onFlag,
  onRemoveFromGroup,
}: Props) {
  const [preview, setPreview] = useState<PreviewState>({ tag: 'loading' });
  const pathRef = useRef(file.path_lower);

  useEffect(() => {
    pathRef.current = file.path_lower;
    setPreview({ tag: 'loading' });
    let cancelled = false;
    getPreview(file.path_display).then(
      (dataUrl) => {
        if (!cancelled) setPreview({ tag: 'success', dataUrl });
      },
      () => {
        if (!cancelled) setPreview({ tag: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [file.path_lower, file.path_display]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case '1':
        case 'k':
        case 'K':
          if (!groupInfo) onFlag(flag === 'keep' ? undefined : 'keep');
          break;
        case '2':
        case 'd':
        case 'D':
          if (!groupInfo) onFlag(flag === 'discard' ? undefined : 'discard');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onNavigate('prev');
          break;
        case 'ArrowRight':
          e.preventDefault();
          onNavigate('next');
          break;
        case 'ArrowUp':
          e.preventDefault();
          onNavigate('up');
          break;
        case 'ArrowDown':
          e.preventDefault();
          onNavigate('down');
          break;
        case 'Escape':
          onClose();
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNavigate, onFlag]);

  const displaySrc =
    preview.tag === 'success' ? preview.dataUrl : (placeholderDataUrl ?? undefined);

  return (
    <aside
      className="flex flex-col shrink-0 bg-nord-1"
      style={{ width, transition: isResizing ? undefined : 'width 200ms ease' }}
    >

      {/* header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-nord-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-nord-4 text-xs tabular-nums shrink-0">{index + 1} / {total}</span>
          <p className="text-nord-5 text-sm truncate">{file.name}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close preview"
          className="shrink-0 p-1 rounded text-nord-4 hover:text-nord-6 hover:bg-nord-3 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* image area */}
      <div className="flex-1 min-h-0 min-w-0 relative bg-nord-0">
        {preview.tag === 'error' && !placeholderDataUrl ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-nord-11 text-sm">Failed to load preview</p>
          </div>
        ) : displaySrc ? (
          <img
            src={displaySrc}
            alt={file.name}
            className="absolute inset-0 w-full h-full object-contain"
            style={{ imageOrientation: 'from-image' }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 rounded bg-nord-2 animate-pulse" />
          </div>
        )}
      </div>

      {/* flag controls / group info */}
      {groupInfo ? (
        <div className="shrink-0 flex flex-col gap-2 px-4 py-3 border-t border-nord-3">
          <div className="flex items-start gap-2">
            <MapPin size={14} className="text-nord-9 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-nord-6 text-sm font-medium truncate">{groupInfo.name}</p>
              <p className="text-nord-4 text-xs truncate">{groupInfo.locationName ?? 'No location'}</p>
            </div>
          </div>
          {onRemoveFromGroup && (
            <button
              onClick={onRemoveFromGroup}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-nord-3 text-nord-5 hover:bg-nord-11 hover:text-nord-6 transition-colors"
            >
              <XCircle size={14} />
              Remove from group
            </button>
          )}
        </div>
      ) : (
        <div className="shrink-0 flex items-center justify-center gap-3 px-4 py-3 border-t border-nord-3">
          <button
            onClick={() => onFlag(flag === 'keep' ? undefined : 'keep')}
            aria-label="Keep (1 or K)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              flag === 'keep'
                ? 'bg-nord-14 text-nord-0'
                : 'bg-nord-3 text-nord-5 hover:bg-nord-14 hover:text-nord-0'
            }`}
          >
            <CheckCircle size={14} />
            Keep
            <kbd className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-mono rounded border border-current opacity-50 leading-none ml-0.5">1</kbd>
          </button>
          <button
            onClick={() => onFlag(flag === 'discard' ? undefined : 'discard')}
            aria-label="Discard (2 or D)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              flag === 'discard'
                ? 'bg-nord-11 text-nord-6'
                : 'bg-nord-3 text-nord-5 hover:bg-nord-11 hover:text-nord-6'
            }`}
          >
            <XCircle size={14} />
            Discard
            <kbd className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-mono rounded border border-current opacity-50 leading-none ml-0.5">2</kbd>
          </button>
        </div>
      )}

      {/* navigation */}
      <div className="shrink-0 flex items-center justify-between px-3 pb-3">
        <button
          onClick={() => onNavigate('prev')}
          aria-label="Previous photo"
          className="flex items-center gap-1 px-2 py-1 rounded text-nord-4 hover:text-nord-6 hover:bg-nord-3 transition-colors text-sm"
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <button
          onClick={() => onNavigate('next')}
          aria-label="Next photo"
          className="flex items-center gap-1 px-2 py-1 rounded text-nord-4 hover:text-nord-6 hover:bg-nord-3 transition-colors text-sm"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </aside>
  );
}
