import { useEffect, useRef, useState } from 'react';
import { X, CheckCircle, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import type { DropboxFile } from '../dropbox/client';
import { getPreview } from '../dropbox/client';
import type { Flag } from './curation';

type PreviewState =
  | { tag: 'loading' }
  | { tag: 'success'; dataUrl: string }
  | { tag: 'error' };

type Props = {
  file: DropboxFile;
  index: number;
  total: number;
  flag: Flag | undefined;
  placeholderDataUrl: string | undefined;
  token: string;
  onClose: () => void;
  onNavigate: (delta: -1 | 1) => void;
  onFlag: (value: Flag) => void;
};

export function PreviewPanel({
  file,
  index,
  total,
  flag,
  placeholderDataUrl,
  token,
  onClose,
  onNavigate,
  onFlag,
}: Props) {
  const [preview, setPreview] = useState<PreviewState>({ tag: 'loading' });
  const pathRef = useRef(file.path_lower);

  useEffect(() => {
    pathRef.current = file.path_lower;
    setPreview({ tag: 'loading' });
    let cancelled = false;
    getPreview(file.path_display, token).then(
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
  }, [file.path_lower, file.path_display, token]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'k':
        case 'K':
          onFlag('keep');
          break;
        case 'd':
        case 'D':
          onFlag('discard');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onNavigate(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          onNavigate(1);
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
    <aside className="flex flex-col w-[45%] max-w-[720px] min-w-[300px] shrink-0 bg-nord-1 border-l border-nord-3">
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
      <div className="flex-1 min-h-0 flex items-center justify-center bg-nord-0 p-2">
        {preview.tag === 'error' && !placeholderDataUrl ? (
          <p className="text-nord-11 text-sm">Failed to load preview</p>
        ) : displaySrc ? (
          <img
            src={displaySrc}
            alt={file.name}
            className="max-w-full max-h-full object-contain"
            style={{ imageOrientation: 'from-image' }}
          />
        ) : (
          <div className="w-24 h-24 rounded bg-nord-2 animate-pulse" />
        )}
      </div>

      {/* flag controls */}
      <div className="shrink-0 flex items-center justify-center gap-3 px-4 py-3 border-t border-nord-3">
        <button
          onClick={() => onFlag('keep')}
          aria-label="Keep (K)"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            flag === 'keep'
              ? 'bg-nord-14 text-nord-0'
              : 'bg-nord-3 text-nord-5 hover:bg-nord-14 hover:text-nord-0'
          }`}
        >
          <CheckCircle size={14} />
          Keep
        </button>
        <button
          onClick={() => onFlag('discard')}
          aria-label="Discard (D)"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            flag === 'discard'
              ? 'bg-nord-11 text-nord-6'
              : 'bg-nord-3 text-nord-5 hover:bg-nord-11 hover:text-nord-6'
          }`}
        >
          <XCircle size={14} />
          Discard
        </button>
      </div>

      {/* navigation */}
      <div className="shrink-0 flex items-center justify-between px-3 pb-3">
        <button
          onClick={() => onNavigate(-1)}
          disabled={index === 0}
          aria-label="Previous photo"
          className="flex items-center gap-1 px-2 py-1 rounded text-nord-4 hover:text-nord-6 hover:bg-nord-3 disabled:opacity-30 disabled:cursor-default transition-colors text-sm"
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <button
          onClick={() => onNavigate(1)}
          disabled={index === total - 1}
          aria-label="Next photo"
          className="flex items-center gap-1 px-2 py-1 rounded text-nord-4 hover:text-nord-6 hover:bg-nord-3 disabled:opacity-30 disabled:cursor-default transition-colors text-sm"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </aside>
  );
}
