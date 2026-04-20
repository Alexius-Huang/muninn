import type { DropboxFile } from '../dropbox/client';
import type { ThumbnailState } from './useThumbnailCache';
import type { Flag } from './curation';

type Props = {
  file: DropboxFile;
  state: ThumbnailState;
  flag?: Flag;
  onClick: () => void;
};

export function ThumbnailCell({ file, state, flag, onClick }: Props) {
  return (
    <button
      className="w-40 shrink-0 flex flex-col gap-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-nord-8"
      onClick={onClick}
      aria-label={file.name}
    >
      <div
        data-testid={flag ? `flag-${flag}` : undefined}
        className="relative w-40 h-40 rounded overflow-hidden bg-nord-2 flex items-center justify-center transition-shadow duration-200"
        style={
          flag === 'keep'
            ? { boxShadow: '0 0 0 2px var(--color-nord-14), 0 0 10px 2px var(--color-nord-14)' }
            : flag === 'discard'
            ? { boxShadow: '0 0 0 2px var(--color-nord-11), 0 0 10px 2px var(--color-nord-11)' }
            : undefined
        }
      >
        {state.tag === 'loading' && (
          <div
            data-testid="thumbnail-skeleton"
            role="presentation"
            className="w-full h-full bg-nord-2 animate-pulse"
          />
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
            className="w-full h-full flex items-center justify-center text-nord-3 text-xl"
          >
            ⚠
          </div>
        )}
      </div>
      <p className="w-full text-nord-4 text-xs truncate text-center leading-4" title={file.name}>{file.name}</p>
    </button>
  );
}
