import type { DropboxEntry, DropboxFile } from '../dropbox/client';

type Props = {
  path: string;
  entries: DropboxEntry[];
  onChange: () => void;
};

export function FileList({ path, entries, onChange }: Props) {
  const files: DropboxFile[] = (entries as DropboxEntry[])
    .filter((e): e is DropboxFile => e['.tag'] === 'file')
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  const displayPath = path === '' ? '/' : path;

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header */}
      <div className="shrink-0 px-6 pt-6 pb-4 bg-nord-0 border-b border-nord-3">
        <div className="max-w-2xl mx-auto space-y-1">
          <h2 className="text-nord-6 font-semibold text-lg">
            {files.length} files in {displayPath}
          </h2>
          <button
            onClick={onChange}
            className="text-nord-8 hover:text-nord-7 text-sm transition-colors"
          >
            Change folder
          </button>
        </div>
      </div>

      {/* Scrollable file list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <ul className="space-y-0.5">
            {files.map((file) => (
              <li key={file.path_lower} className="text-nord-5 text-sm px-2 py-1">
                {file.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
