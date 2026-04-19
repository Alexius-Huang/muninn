import { useEffect, useState } from 'react';
import { listFolderAll } from '../dropbox/client';
import type { DropboxEntry, DropboxFolder } from '../dropbox/client';

type BreadcrumbsProps = {
  path: string;
  onJump: (path: string) => void;
};

function Breadcrumbs({ path, onJump }: BreadcrumbsProps) {
  const segments = path === '' ? [] : path.split('/').filter(Boolean);

  function pathUpTo(index: number): string {
    return '/' + segments.slice(0, index + 1).join('/');
  }

  return (
    <nav className="flex items-center gap-1 text-sm text-nord-4 flex-wrap">
      <button
        onClick={() => onJump('')}
        className="hover:text-nord-6 transition-colors"
      >
        Dropbox
      </button>
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="text-nord-3">/</span>
          <button
            onClick={() => onJump(pathUpTo(i))}
            className="hover:text-nord-6 transition-colors"
          >
            {seg}
          </button>
        </span>
      ))}
    </nav>
  );
}

type Props = {
  token: string;
  onSelect: (path: string, entries: DropboxEntry[]) => void;
};

export function FolderPicker({ token, onSelect }: Props) {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<DropboxEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setEntries(null);
    listFolderAll(currentPath, token)
      .then(setEntries)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [currentPath, token]);

  const folders: DropboxFolder[] = (entries ?? [])
    .filter((e): e is DropboxFolder => e['.tag'] === 'folder')
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  return (
    <div className="flex flex-col h-full">
      {/* Sticky controls — breadcrumbs + select button */}
      <div className="shrink-0 px-6 pt-6 pb-4 bg-nord-0 border-b border-nord-3">
        <div className="max-w-2xl mx-auto space-y-3">
          <Breadcrumbs path={currentPath} onJump={setCurrentPath} />
          <button
            onClick={() => onSelect(currentPath, entries ?? [])}
            disabled={loading || entries === null}
            className="px-4 py-2 rounded-lg bg-nord-10 text-nord-6 text-sm font-medium hover:bg-nord-9 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Select this folder
          </button>
        </div>
      </div>

      {/* Scrollable folder list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-4">
          {loading && (
            <p className="text-nord-4 text-sm">Loading…</p>
          )}

          {error && (
            <p role="alert" className="text-nord-11 text-sm">
              {error}
            </p>
          )}

          {!loading && !error && entries !== null && folders.length === 0 && (
            <p className="text-nord-4 text-sm">No subfolders</p>
          )}

          {!loading && !error && folders.length > 0 && (
            <ul className="space-y-1">
              {folders.map((folder) => (
                <li key={folder.path_lower}>
                  <button
                    onClick={() => setCurrentPath(folder.path_display)}
                    className="w-full text-left px-4 py-2 rounded-lg text-nord-5 hover:bg-nord-2 transition-colors text-sm"
                  >
                    📁 {folder.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
