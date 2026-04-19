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
    <nav className="flex items-center gap-1 text-sm text-neutral-400 flex-wrap">
      <button
        onClick={() => onJump('')}
        className="hover:text-white transition-colors"
      >
        Dropbox
      </button>
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="text-neutral-600">/</span>
          <button
            onClick={() => onJump(pathUpTo(i))}
            className="hover:text-white transition-colors"
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
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-4">
        <Breadcrumbs path={currentPath} onJump={setCurrentPath} />
      </div>

      <div className="mb-6">
        <button
          onClick={() => onSelect(currentPath, entries ?? [])}
          disabled={loading || entries === null}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Select this folder
        </button>
      </div>

      {loading && (
        <p className="text-neutral-500 text-sm">Loading…</p>
      )}

      {error && (
        <p role="alert" className="text-red-400 text-sm">
          {error}
        </p>
      )}

      {!loading && !error && entries !== null && folders.length === 0 && (
        <p className="text-neutral-500 text-sm">No subfolders</p>
      )}

      {!loading && !error && folders.length > 0 && (
        <ul className="space-y-1">
          {folders.map((folder) => (
            <li key={folder.path_lower}>
              <button
                onClick={() => setCurrentPath(folder.path_display)}
                className="w-full text-left px-4 py-2 rounded-lg text-neutral-200 hover:bg-neutral-800 transition-colors text-sm"
              >
                📁 {folder.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
