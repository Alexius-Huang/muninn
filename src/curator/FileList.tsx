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
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h2 className="text-white font-semibold text-lg mb-1">
          {files.length} files in {displayPath}
        </h2>
        <button
          onClick={onChange}
          className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
        >
          Change folder
        </button>
      </div>

      <ul className="space-y-0.5">
        {files.map((file) => (
          <li
            key={file.path_lower}
            className="text-neutral-300 text-sm px-2 py-1"
          >
            {file.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
