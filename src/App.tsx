import { useEffect, useState } from 'react';
import { getDropboxToken, deleteDropboxToken } from './auth/keychain';
import { validateToken, DropboxAuthError, DropboxNetworkError } from './dropbox/client';
import type { DropboxAccount } from './dropbox/client';
import { SetupScreen } from './auth/SetupScreen';
import { Connected } from './curator/Connected';

type AppState =
  | { status: 'loading' }
  | { status: 'setup' }
  | { status: 'connected'; account: DropboxAccount; token: string };

function App() {
  const [state, setState] = useState<AppState>({ status: 'loading' });

  useEffect(() => {
    async function init() {
      let token: string | null;
      try {
        token = await getDropboxToken();
      } catch (e) {
        setState({ status: 'setup' });
        return;
      }

      if (!token) {
        setState({ status: 'setup' });
        return;
      }

      try {
        const account = await validateToken(token);
        setState({ status: 'connected', account, token });
      } catch (err) {
        if (err instanceof DropboxAuthError) {
          await deleteDropboxToken();
          setState({ status: 'setup' });
        } else if (err instanceof DropboxNetworkError) {
          const syntheticAccount: DropboxAccount = {
            account_id: '',
            name: { display_name: 'Dropbox' },
            email: '',
          };
          setState({ status: 'connected', account: syntheticAccount, token });
        } else {
          setState({ status: 'setup' });
        }
      }
    }

    init();
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <p className="text-neutral-500 text-sm">Loading…</p>
      </div>
    );
  }

  if (state.status === 'setup') {
    return (
      <SetupScreen
        onConnect={(account, token) => setState({ status: 'connected', account, token })}
      />
    );
  }

  return (
    <Connected
      account={state.account}
      token={state.token}
      onDisconnect={() => setState({ status: 'setup' })}
    />
  );
}

export default App;
