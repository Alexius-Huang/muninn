import { useState } from 'react';
import { connect } from './dropboxAuth';
import { validateToken, DropboxAuthError, DropboxNetworkError } from '../dropbox/client';
import type { DropboxAccount } from '../dropbox/client';

type Props = {
  onConnect: (account: DropboxAccount) => void;
};

type Status = 'idle' | 'connecting' | 'error';

export function SetupScreen({ onConnect }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleConnect() {
    setStatus('connecting');
    setErrorMessage('');

    try {
      await connect();
      const account = await validateToken();
      onConnect(account);
    } catch (err) {
      if (err instanceof DropboxNetworkError) {
        setErrorMessage("Couldn't reach Dropbox — check your connection.");
      } else if (err instanceof DropboxAuthError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage((err as Error).message || 'An unexpected error occurred. Please try again.');
      }
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-nord-0">
      <div className="w-full max-w-md px-8 py-10 bg-nord-1 rounded-2xl shadow-xl">
        <h1 className="text-2xl font-semibold text-nord-6 mb-2">Connect Dropbox</h1>
        <p className="text-nord-4 text-sm mb-8">
          Authorize Muninn to access your Dropbox. You'll be taken to Dropbox in your browser — tokens are stored in your macOS Keychain.
        </p>

        {status === 'error' && (
          <p id="connect-error" role="alert" className="text-nord-11 text-sm mb-4">
            {errorMessage}
          </p>
        )}

        <button
          type="button"
          onClick={handleConnect}
          disabled={status === 'connecting'}
          aria-describedby={status === 'error' ? 'connect-error' : undefined}
          className="w-full py-3 rounded-lg bg-nord-10 text-nord-6 font-medium hover:bg-nord-9 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === 'connecting' ? 'Connecting…' : 'Connect Dropbox'}
        </button>
      </div>
    </div>
  );
}
