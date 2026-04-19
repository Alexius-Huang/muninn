import { invoke } from '@tauri-apps/api/core';

export async function getDropboxToken(): Promise<string | null> {
  return invoke<string | null>('get_dropbox_token');
}

export async function setDropboxToken(token: string): Promise<void> {
  await invoke('set_dropbox_token', { token });
}

export async function deleteDropboxToken(): Promise<void> {
  await invoke('delete_dropbox_token');
}
