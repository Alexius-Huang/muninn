import { useState } from 'react';
import type { DropboxAccount } from '../dropbox/client';
import type { DropboxEntry } from '../dropbox/client';
import { deleteDropboxToken } from '../auth/keychain';
import { FolderPicker } from './FolderPicker';
import { FileList } from './FileList';

type Props = {
  account: DropboxAccount;
  token: string;
  onDisconnect: () => void;
};

type Selected = { path: string; entries: DropboxEntry[] };

export function Connected({ account, token, onDisconnect }: Props) {
  const [selected, setSelected] = useState<Selected | null>(null);

  async function handleDisconnect() {
    if (!window.confirm('Disconnect this Dropbox account? You will need to paste the token again to reconnect.')) return;
    await deleteDropboxToken();
    onDisconnect();
  }

  return (
    <div className="min-h-screen flex flex-col bg-neutral-950">
      <header className="flex items-center justify-between px-6 py-3 bg-neutral-900 border-b border-neutral-800">
        <div>
          <span className="text-white font-medium text-sm">{account.name.display_name}</span>
          {account.email && (
            <span className="text-neutral-500 text-sm ml-2">{account.email}</span>
          )}
        </div>
        <button
          onClick={handleDisconnect}
          className="px-4 py-1.5 rounded-lg bg-neutral-700 text-neutral-200 hover:bg-neutral-600 transition-colors text-sm"
        >
          Disconnect
        </button>
      </header>

      <main className="flex-1 overflow-auto">
        {selected === null ? (
          <FolderPicker
            token={token}
            onSelect={(path, entries) => setSelected({ path, entries })}
          />
        ) : (
          <FileList
            path={selected.path}
            entries={selected.entries}
            onChange={() => setSelected(null)}
          />
        )}
      </main>
    </div>
  );
}
