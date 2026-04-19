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
    <div className="h-full flex flex-col bg-nord-0">
      <header className="flex items-center justify-between px-6 py-3 bg-nord-1 border-b border-nord-3">
        <div>
          <span className="text-nord-6 font-medium text-sm">{account.name.display_name}</span>
          {account.email && (
            <span className="text-nord-4 text-sm ml-2">{account.email}</span>
          )}
        </div>
        <button
          onClick={handleDisconnect}
          className="px-4 py-1.5 rounded-lg bg-nord-3 text-nord-5 hover:bg-nord-2 transition-colors text-sm"
        >
          Disconnect
        </button>
      </header>

      <main className="flex-1 min-h-0 flex flex-col">
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
