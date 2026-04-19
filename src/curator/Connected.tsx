import { useState } from 'react';
import type { DropboxAccount, DropboxEntry } from '../dropbox/client';
import { deleteDropboxToken } from '../auth/keychain';
import { FolderTree } from './FolderTree';
import { ThumbnailGrid } from './ThumbnailGrid';

type Props = {
  account: DropboxAccount;
  token: string;
  onDisconnect: () => void;
};

type Active = { path: string; entries: DropboxEntry[] };

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <p className="text-nord-4 text-sm">Select a folder to see its photos</p>
    </div>
  );
}

export function Connected({ account, token, onDisconnect }: Props) {
  const [active, setActive] = useState<Active | null>(null);

  async function handleDisconnect() {
    if (!window.confirm('Disconnect this Dropbox account? You will need to paste the token again to reconnect.')) return;
    await deleteDropboxToken();
    onDisconnect();
  }

  return (
    <div className="h-full flex flex-col bg-nord-0">
      <header className="flex items-center justify-between px-6 py-3 bg-nord-1 border-b border-nord-3 shrink-0">
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

      <main className="flex-1 min-h-0 flex">
        <aside className="w-60 shrink-0 border-r border-nord-3 overflow-y-auto bg-nord-0">
          <FolderTree
            token={token}
            activePath={active?.path ?? null}
            onOpen={(path, entries) => setActive({ path, entries })}
          />
        </aside>
        <section className="flex-1 min-w-0 flex flex-col">
          {active === null ? (
            <EmptyState />
          ) : (
            <ThumbnailGrid
              path={active.path}
              entries={active.entries}
              token={token}
            />
          )}
        </section>
      </main>
    </div>
  );
}
