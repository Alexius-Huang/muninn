import { useEffect, useState } from 'react';
import { init, isAuthenticated, onDisconnect } from './auth/dropboxAuth';
import { validateToken, DropboxNetworkError } from './dropbox/client';
import type { DropboxAccount } from './dropbox/client';
import { SetupScreen } from './auth/SetupScreen';
import { Connected } from './curator/Connected';
import { CfDebugPanel } from './cloud/CfDebugPanel';

type AppState =
  | { status: 'loading' }
  | { status: 'setup' }
  | { status: 'connected'; account: DropboxAccount };

function MainApp() {
  const [state, setState] = useState<AppState>({ status: 'loading' });

  useEffect(() => {
    async function boot() {
      await init();

      if (!isAuthenticated()) {
        setState({ status: 'setup' });
        return;
      }

      try {
        const account = await validateToken();
        setState({ status: 'connected', account });
      } catch (err) {
        if (err instanceof DropboxNetworkError) {
          // Offline at launch — proceed as connected with a synthetic account
          const syntheticAccount: DropboxAccount = {
            account_id: '',
            name: { display_name: 'Dropbox' },
            email: '',
          };
          setState({ status: 'connected', account: syntheticAccount });
        } else {
          setState({ status: 'setup' });
        }
      }
    }

    boot();
  }, []);

  useEffect(() => {
    return onDisconnect(() => setState({ status: 'setup' }));
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="h-full flex items-center justify-center bg-nord-0">
        <p className="text-nord-4 text-sm">Loading…</p>
      </div>
    );
  }

  if (state.status === 'setup') {
    return (
      <SetupScreen
        onConnect={(account) => setState({ status: 'connected', account })}
      />
    );
  }

  return (
    <Connected
      account={state.account}
      onDisconnect={() => setState({ status: 'setup' })}
    />
  );
}

function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('cf') === 'debug') {
    return <CfDebugPanel />;
  }
  return <MainApp />;
}

export default App;
