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
      <div className="relative w-40 h-40 rounded overflow-hidden bg-nord-2 flex items-center justify-center">
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
        {flag === 'keep' && (
          <span
            data-testid="flag-keep"
            className="absolute top-1 right-1 bg-nord-14 text-nord-0 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center leading-none"
          >
            K
          </span>
        )}
        {flag === 'discard' && (
          <span
            data-testid="flag-discard"
            className="absolute top-1 right-1 bg-nord-11 text-nord-6 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center leading-none"
          >
            D
          </span>
        )}
      </div>
      <p className="text-nord-4 text-xs truncate text-center leading-4">{file.name}</p>
    </button>
  );
}
