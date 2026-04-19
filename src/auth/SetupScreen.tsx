import { useState, FormEvent } from 'react';
import { setDropboxToken } from './keychain';
import { validateToken, DropboxAuthError, DropboxNetworkError, DropboxAccount } from '../dropbox/client';

type Props = {
  onConnect: (account: DropboxAccount, token: string) => void;
};

type Status = 'idle' | 'validating' | 'error';

export function SetupScreen({ onConnect }: Props) {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;

    setStatus('validating');
    setErrorMessage('');

    try {
      const account = await validateToken(token.trim());
      await setDropboxToken(token.trim());
      onConnect(account, token.trim());
    } catch (err) {
      if (err instanceof DropboxNetworkError) {
        setErrorMessage("Couldn't reach Dropbox — check your connection.");
      } else if (err instanceof DropboxAuthError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('An unexpected error occurred. Please try again.');
      }
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      <div className="w-full max-w-md px-8 py-10 bg-neutral-900 rounded-2xl shadow-xl">
        <h1 className="text-2xl font-semibold text-white mb-2">Connect Dropbox</h1>
        <p className="text-neutral-400 text-sm mb-8">
          Paste your Dropbox access token to start curating photos. The token is stored in your macOS Keychain — never in browser storage.
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="dropbox-token" className="block text-sm font-medium text-neutral-300 mb-2">
            Access token
          </label>
          <input
            id="dropbox-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="sl.…"
            className="w-full px-4 py-3 rounded-lg bg-neutral-800 text-white placeholder-neutral-500 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            aria-invalid={status === 'error'}
            aria-describedby={status === 'error' ? 'token-error' : undefined}
            disabled={status === 'validating'}
          />
          {status === 'error' && (
            <p id="token-error" role="alert" className="text-red-400 text-sm mb-4">
              {errorMessage}
            </p>
          )}
          <button
            type="submit"
            disabled={!token.trim() || status === 'validating'}
            className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'validating' ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      </div>
    </div>
  );
}
