import { invoke } from '@tauri-apps/api/core';
import type { AuthTokens } from './oauth';

export async function getAuth(): Promise<AuthTokens | null> {
  const json = await invoke<string | null>('get_dropbox_auth');
  if (!json) return null;
  try {
    return JSON.parse(json) as AuthTokens;
  } catch {
    return null;
  }
}

export async function setAuth(tokens: AuthTokens): Promise<void> {
  await invoke('set_dropbox_auth', { json: JSON.stringify(tokens) });
}

export async function deleteAuth(): Promise<void> {
  await invoke('delete_dropbox_auth');
}

export async function deleteLegacyToken(): Promise<void> {
  await invoke('delete_legacy_dropbox_token');
}
