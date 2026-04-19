import { DropboxAccount } from '../dropbox/client';
import { deleteDropboxToken } from '../auth/keychain';

type Props = {
  account: DropboxAccount;
  onDisconnect: () => void;
};

export function Connected({ account, onDisconnect }: Props) {
  async function handleDisconnect() {
    const confirmed = window.confirm(
      'Disconnect this Dropbox account? You will need to paste the token again to reconnect.'
    );
    if (!confirmed) return;
    await deleteDropboxToken();
    onDisconnect();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      <div className="w-full max-w-md px-8 py-10 bg-neutral-900 rounded-2xl shadow-xl text-center">
        <h1 className="text-2xl font-semibold text-white mb-2">Muninn</h1>
        <p className="text-neutral-400 text-sm mb-1">Connected as</p>
        <p className="text-white font-medium mb-1">{account.name.display_name}</p>
        <p className="text-neutral-500 text-sm mb-8">{account.email}</p>
        <p className="text-neutral-400 text-sm mb-8">
          Folder picker coming soon — this is the curator placeholder.
        </p>
        <button
          onClick={handleDisconnect}
          className="px-6 py-2 rounded-lg bg-neutral-700 text-neutral-200 hover:bg-neutral-600 transition-colors text-sm"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}
