import { useState, useEffect, useRef } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { DropboxFile } from '../dropbox/client';
import type { ThumbnailState } from './useThumbnailCache';
import type { Flag } from './curation';

type Props = {
  file: DropboxFile;
  state: ThumbnailState;
  flag?: Flag;
  isActive?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
  onClick: () => void;
};

export function ThumbnailCell({ file, state, flag, isActive = false, ref, onClick }: Props) {
  const [isLeaving, setIsLeaving] = useState(false);
  const prevActiveRef = useRef(isActive);

  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = isActive;
    if (wasActive && !isActive) {
      setIsLeaving(true);
      const timer = setTimeout(() => setIsLeaving(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  const showRing = isActive || isLeaving;
  const ringShadow = showRing ? 'inset 0 0 0 3px #81A1C1' : 'inset 0 0 0 0 #81A1C1';
  const flagShadow =
    flag === 'keep'
      ? '0 0 0 2px var(--color-nord-14), 0 0 10px 2px var(--color-nord-14)'
      : flag === 'discard'
        ? '0 0 0 2px var(--color-nord-11), 0 0 10px 2px var(--color-nord-11)'
        : undefined;

  return (
    <button
      ref={ref}
      className="w-40 shrink-0 flex flex-col gap-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-nord-8"
      onClick={onClick}
      aria-label={file.name}
      aria-current={isActive ? 'true' : undefined}
    >
      <div
        data-testid={flag ? `flag-${flag}` : undefined}
        data-leaving={isLeaving ? 'true' : undefined}
        className="relative w-40 h-40 rounded overflow-hidden bg-nord-2 flex items-center justify-center transition-shadow duration-200 motion-reduce:transition-none"
        style={{ boxShadow: flagShadow }}
      >
        {state.tag === 'loading' && (
          <div
            data-testid="thumbnail-loading"
            role="presentation"
            className="flex items-center justify-center w-full h-full"
          >
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {state.tag === 'success' && (
          <img
            src={state.dataUrl}
            alt={file.name}
            className="object-cover w-full h-full"
          />
        )}
        {state.tag === 'error' && (
          <div
            data-testid="thumbnail-error"
            title={file.name}
            className="w-full h-full flex items-center justify-center"
          >
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded pointer-events-none transition-shadow duration-200 motion-reduce:transition-none"
          style={{ boxShadow: ringShadow }}
        />
      </div>
      <p className="w-full text-nord-4 text-xs truncate text-center leading-4" title={file.name}>{file.name}</p>
    </button>
  );
}
