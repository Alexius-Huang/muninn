import { invoke } from '@tauri-apps/api/core';

export type CfAuth = {
  accountId: string;
  d1ApiToken: string;
  d1DatabaseId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2Bucket: string;
};

export async function getCfAuth(): Promise<CfAuth | null> {
  const json = await invoke<string | null>('read_cf_token');
  if (!json) return null;
  try {
    return JSON.parse(json) as CfAuth;
  } catch {
    return null;
  }
}

export async function setCfAuth(auth: CfAuth): Promise<void> {
  const json = JSON.stringify(auth);
  await invoke('save_cf_token', { json });

  const readBack = await invoke<string | null>('read_cf_token');
  if (!readBack) throw new Error('Keychain verification failed: read returned null after save');

  let parsed: CfAuth;
  try {
    parsed = JSON.parse(readBack) as CfAuth;
  } catch {
    throw new Error('Keychain verification failed: read returned invalid JSON');
  }

  if (JSON.stringify(parsed) !== JSON.stringify(auth)) {
    throw new Error('Keychain verification failed: read-back does not match saved value');
  }
}

export async function deleteCfAuth(): Promise<void> {
  await invoke('delete_cf_token');
}
