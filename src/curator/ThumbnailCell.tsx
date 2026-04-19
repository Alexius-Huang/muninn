import type { DropboxFile } from '../dropbox/client';
import type { ThumbnailState } from './useThumbnailCache';

type Props = { file: DropboxFile; state: ThumbnailState };

export function ThumbnailCell({ file, state }: Props) {
  return (
    <div className="w-40 shrink-0 flex flex-col gap-1">
      <div className="w-40 h-40 rounded overflow-hidden bg-nord-2 flex items-center justify-center">
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
      <p className="text-nord-4 text-xs truncate text-center leading-4">{file.name}</p>
    </div>
  );
}
